import { describe, expect, it } from 'vitest'
import type { ApplicationCommand } from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import type { RuntimeSubscriptionEvent } from '../ports/runtime-port'
import { createDeterministicFakeRuntime } from '../runtime/fake-runtime'
import { VirtualClock } from '../runtime/virtual-clock'
import { emptyProjectionState } from './empty-read-model'
import { applyRuntimeEvent, projectEvents } from './project-events'

function baseCommand(
  overrides: Partial<ApplicationCommand> &
    Pick<ApplicationCommand, 'type' | 'commandId' | 'idempotencyKey'> &
    Record<string, unknown>,
): ApplicationCommand {
  return {
    issuedAt: '1970-01-01T00:00:00.000Z',
    actor: 'user',
    schemaVersion: 1,
    ...overrides,
  } as ApplicationCommand
}

function collectEvents(
  runtime: ReturnType<typeof createDeterministicFakeRuntime>,
  taskId: string,
): AgentRuntimeEventEnvelope[] {
  const out: AgentRuntimeEventEnvelope[] = []
  runtime.subscribe(taskId, 0, (ev: RuntimeSubscriptionEvent) => {
    if (ev.kind === 'event') out.push(ev.envelope)
  })
  return out
}

describe('projectEvents (Phase 4D)', () => {
  it('reasoning-tools-complete projects coalesced 4D categories without unsupported', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'p4d',
      clock,
      stepMs: 0,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-4d', 'reasoning-tools-complete')
    const events = collectEvents(runtime, 'task-4d')

    await runtime.sendCommand(
      baseCommand({
        type: 'createTask',
        commandId: 'c',
        idempotencyKey: 'c',
        proposedTaskId: 'task-4d',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseCommand({
        type: 'submitTurn',
        commandId: 's',
        idempotencyKey: 's',
        taskId: 'task-4d',
        inputText: 'tools',
        proposedRunId: 'run-4d',
      }),
    )
    clock.flush()

    const state = projectEvents(
      emptyProjectionState({ taskId: 'task-4d', projectId: 'proj-1' }),
      events,
    )
    const cats = state.readModel.timeline.map((t) => t.category)
    expect(cats).toContain('reasoning-section')
    expect(cats).toContain('plan-update')
    expect(cats).toContain('tool-group')
    expect(cats).toContain('command-execution')
    expect(cats).toContain('file-change')
    expect(cats).toContain('source-group')
    expect(cats).toContain('assistant-message')
    expect(cats).not.toContain('unsupported-event')

    const reasoning = state.readModel.timeline.find(
      (t) => t.category === 'reasoning-section',
    )
    expect(reasoning?.body).toContain('拆解')
    expect(reasoning?.sourceEventIds.length).toBeGreaterThan(1)

    const tool = state.readModel.timeline.find((t) => t.category === 'tool-group')
    expect(tool?.title).toMatch(/README/)
    expect(tool?.status).toBe('completed')
    expect(tool?.sourceEventIds.length).toBeGreaterThanOrEqual(2)

    expect(state.readModel.runStatus).toBe('completed')
  })

  it('approval + input request project waiting status and resolve', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    const mk = (
      seq: number,
      type: string,
      payload: unknown,
      runId = 'run-1',
    ): AgentRuntimeEventEnvelope => ({
      eventId: `e${seq}`,
      eventType: type,
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      turnId: 'turn-1',
      runId,
      taskSequence: seq,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload,
    })

    state = applyRuntimeEvent(state, mk(1, 'run.started', {}))
    state = applyRuntimeEvent(
      state,
      mk(2, 'approval.requested', {
        requestId: 'req-1',
        title: '敏感操作',
        detail: 'demo',
      }),
    )
    expect(state.readModel.runStatus).toBe('waiting_for_approval')
    const approval = state.readModel.timeline.find(
      (t) => t.category === 'approval-request',
    )
    expect(approval?.status).toBe('waiting')
    expect(approval?.id).toBe('approval-request:req-1')

    state = applyRuntimeEvent(
      state,
      mk(3, 'approval.resolved', {
        requestId: 'req-1',
        decision: 'approved',
      }),
    )
    expect(
      state.readModel.timeline.find((t) => t.category === 'approval-request')
        ?.status,
    ).toBe('approved')
    expect(state.readModel.runStatus).toBe('running')

    state = applyRuntimeEvent(
      state,
      mk(4, 'run.input_requested', {
        requestId: 'in-1',
        prompt: '补充路径',
      }),
    )
    expect(state.readModel.runStatus).toBe('waiting_for_input')
    state = applyRuntimeEvent(
      state,
      mk(5, 'run.input_provided', {
        requestId: 'in-1',
        text: '/tmp',
      }),
    )
    expect(
      state.readModel.timeline.find((t) => t.category === 'input-request')
        ?.status,
    ).toBe('provided')
  })

  it('run.failed projects error item + failed terminal', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, {
      eventId: 'e1',
      eventType: 'run.started',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      runId: 'r1',
      taskSequence: 1,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: {},
    })
    state = applyRuntimeEvent(state, {
      eventId: 'e2',
      eventType: 'run.failed',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      runId: 'r1',
      taskSequence: 2,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: { message: 'boom' },
    })
    expect(state.readModel.runStatus).toBe('failed')
    expect(
      state.readModel.timeline.some((t) => t.category === 'error'),
    ).toBe(true)
    expect(
      state.readModel.timeline.find((t) => t.category === 'run-terminal')?.title,
    ).toBe('失败')
  })

  it('run.interrupted / run.reconciled do not push unsupported', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, {
      eventId: 'e1',
      eventType: 'run.started',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      runId: 'r1',
      taskSequence: 1,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: {},
    })
    state = applyRuntimeEvent(state, {
      eventId: 'e2',
      eventType: 'run.interrupted',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      runId: 'r1',
      taskSequence: 2,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: {},
    })
    state = applyRuntimeEvent(state, {
      eventId: 'e3',
      eventType: 'run.reconciled',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      runId: 'r1',
      taskSequence: 3,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: { outcome: 'cancelled' },
    })
    expect(state.readModel.runStatus).toBe('interrupted')
    expect(
      state.readModel.timeline.some((t) => t.category === 'unsupported-event'),
    ).toBe(false)
  })
})
