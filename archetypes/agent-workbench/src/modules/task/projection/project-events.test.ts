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

describe('projectEvents (Phase 4C)', () => {
  it('normal stream: order → user + coalesced assistant + completed run-terminal', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'proj1',
      clock,
      stepMs: 10,
      outputDeltas: ['Hello', ' world'],
    })
    const events = collectEvents(runtime, 'task-p')

    await runtime.sendCommand(
      baseCommand({
        type: 'createTask',
        commandId: 'c1',
        idempotencyKey: 'c1',
        proposedTaskId: 'task-p',
        projectId: 'proj-1',
        initialPrompt: 'say hi',
      }),
    )
    await runtime.sendCommand(
      baseCommand({
        type: 'submitTurn',
        commandId: 's1',
        idempotencyKey: 's1',
        taskId: 'task-p',
        inputText: 'say hi',
        proposedTurnId: 'turn-1',
        proposedRunId: 'run-1',
      }),
    )
    clock.flush()

    expect(events.map((e) => e.eventType)).toEqual([
      'task.created',
      'turn.created',
      'message.accepted',
      'run.queued',
      'run.started',
      'output.delta',
      'output.delta',
      'output.completed',
      'run.completed',
    ])

    const state = projectEvents(
      emptyProjectionState({ taskId: 'task-p', projectId: 'proj-1' }),
      events,
    )
    const { readModel } = state

    expect(readModel.title).toBe('say hi')
    expect(readModel.runStatus).toBe('completed')
    expect(readModel.activeRunId).toBeNull()
    expect(readModel.recoveryRequired).toBe(false)
    expect(readModel.lastTaskSequence).toBe(9)

    const categories = readModel.timeline.map((t) => t.category)
    expect(categories).toEqual([
      'user-message',
      'run-terminal',
      'assistant-message',
    ])

    const user = readModel.timeline.find((t) => t.category === 'user-message')
    expect(user?.body).toBe('say hi')
    // turn.created + message.accepted both contribute source ids
    expect(user?.sourceEventIds.length).toBeGreaterThanOrEqual(1)

    const assistant = readModel.timeline.find((t) => t.category === 'assistant-message')
    expect(assistant?.body).toBe('Hello world')
    // two deltas + completed
    expect(assistant?.sourceEventIds.length).toBe(3)
    expect(assistant?.status).toBe('completed')

    const terminal = readModel.timeline.find((t) => t.category === 'run-terminal')
    expect(terminal?.status).toBe('completed')
    expect(terminal?.title).toBe('已处理')
  })

  it('dedupes by eventId', () => {
    const base = emptyProjectionState({ taskId: 't', projectId: 'p' })
    const envelope: AgentRuntimeEventEnvelope = {
      eventId: 'e1',
      eventType: 'task.created',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      taskSequence: 1,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: { title: 'once', titleSource: 'local' },
    }
    const once = applyRuntimeEvent(base, envelope)
    const twice = applyRuntimeEvent(once, envelope)
    expect(twice.readModel.projectionVersion).toBe(once.readModel.projectionVersion)
    expect(twice.readModel.title).toBe('once')
    expect(twice.seenEventIds.size).toBe(1)
  })

  it('coalesces output.delta into one assistant-message with full sourceEventIds', () => {
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
    state = applyRuntimeEvent(state, mk(2, 'output.delta', { text: 'A' }))
    state = applyRuntimeEvent(state, mk(3, 'output.delta', { text: 'B' }))
    state = applyRuntimeEvent(state, mk(4, 'output.delta', { text: 'C' }))
    const assistant = state.readModel.timeline.filter((t) => t.category === 'assistant-message')
    expect(assistant).toHaveLength(1)
    expect(assistant[0]?.body).toBe('ABC')
    expect(assistant[0]?.sourceEventIds).toEqual(['e2', 'e3', 'e4'])
  })

  it('cancel while running → cancelled run-terminal', async () => {
    const clock = new VirtualClock()
    const runtime = createDeterministicFakeRuntime({
      seed: 'proj-c',
      clock,
      defaultScenario: 'cancel-run',
      stepMs: 10,
    })
    const events = collectEvents(runtime, 'task-c')

    await runtime.sendCommand(
      baseCommand({
        type: 'createTask',
        commandId: 'c',
        idempotencyKey: 'c',
        proposedTaskId: 'task-c',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseCommand({
        type: 'submitTurn',
        commandId: 's',
        idempotencyKey: 's',
        taskId: 'task-c',
        inputText: 'cancel me',
        proposedRunId: 'run-c',
      }),
    )
    clock.advance(10)
    await runtime.sendCommand(
      baseCommand({
        type: 'cancelRun',
        commandId: 'x',
        idempotencyKey: 'x',
        taskId: 'task-c',
        runId: 'run-c',
      }),
    )
    clock.flush()

    const state = projectEvents(
      emptyProjectionState({ taskId: 'task-c', projectId: 'proj-1' }),
      events,
    )
    expect(state.readModel.runStatus).toBe('cancelled')
    const terminal = state.readModel.timeline.find((t) => t.category === 'run-terminal')
    expect(terminal?.status).toBe('cancelled')
    expect(terminal?.title).toBe('已取消')
    expect(events.map((e) => e.eventType)).toContain('run.cancelled')
    expect(events.map((e) => e.eventType)).not.toContain('run.completed')
  })

  it('marks recoveryRequired on sequence gap', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, {
      eventId: 'e1',
      eventType: 'task.created',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      taskSequence: 1,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: { title: 'a' },
    })
    state = applyRuntimeEvent(state, {
      eventId: 'e5',
      eventType: 'run.started',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      runId: 'r',
      taskSequence: 5,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: {},
    })
    expect(state.readModel.recoveryRequired).toBe(true)
    expect(state.readModel.lastTaskSequence).toBe(5)
  })

  it('unknown eventType → unsupported-event once', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, {
      eventId: 'u1',
      eventType: 'totally.unknown.v99',
      schemaVersion: 1,
      projectId: 'p',
      taskId: 't',
      taskSequence: 1,
      occurredAt: '1970-01-01T00:00:00.000Z',
      receivedAt: '1970-01-01T00:00:00.000Z',
      payload: { raw: true },
    })
    expect(state.readModel.timeline).toHaveLength(1)
    expect(state.readModel.timeline[0]?.category).toBe('unsupported-event')
    expect(state.readModel.timeline[0]?.title).toBe('totally.unknown.v99')
  })
})
