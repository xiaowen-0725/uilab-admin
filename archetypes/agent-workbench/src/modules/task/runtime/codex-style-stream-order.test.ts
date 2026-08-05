/**
 * Codex-style stream order tests (mapped from openai/codex):
 * - sdk/typescript/tests/runStreamed.test.ts — exact event type sequence
 * - codex-rs/core/tests/suite/items.rs — deltas before complete, concat deltas
 * - approvals / cancel intermediate states
 *
 * Uses DeterministicFakeRuntime + VirtualClock instead of SSE proxy.
 */

import { describe, expect, it } from 'vitest'
import {
  assertTypesInOrder,
  collectEnvelopes,
  collectOutputDeltaTexts,
  eventTypes,
  findEnvelope,
  payloadText,
} from '@/test-support/codex-style-stream'
import type { ApplicationCommand } from '../protocol/commands'
import { createDeterministicFakeRuntime } from './fake-runtime'
import { VirtualClock } from './virtual-clock'
import { projectEventsFromEmpty } from '../projection/project-events'

function cmd(
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

async function bootstrapTask(
  runtime: ReturnType<typeof createDeterministicFakeRuntime>,
  taskId: string,
  projectId = 'proj-1',
) {
  const ack = await runtime.sendCommand(
    cmd({
      type: 'createTask',
      commandId: `create-${taskId}`,
      idempotencyKey: `idem-create-${taskId}`,
      proposedTaskId: taskId,
      projectId,
      title: '测试任务',
    }),
  )
  expect(ack.status).toBe('accepted')
}

describe('Codex-style stream order (Fake Runtime)', () => {
  it('runStreamed-like sequence: lifecycle then deltas then completed', async () => {
    // Mirrors sdk/typescript runStreamed.test.ts "returns thread events":
    // thread.started → turn.started → item… → turn.completed
    // Ours: task.created → turn.created → run.* → output.delta* → run.completed
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'codex-order',
      clock,
      defaultScenario: 'normal-stream-complete',
      stepMs: 10,
      outputDeltas: ['Hello', ', ', 'world'],
      keywordScenarios: false,
    })
    const { envelopes } = collectEnvelopes(runtime, 'task-stream')
    await bootstrapTask(runtime, 'task-stream')

    const submit = await runtime.sendCommand(
      cmd({
        type: 'submitTurn',
        commandId: 'submit-1',
        idempotencyKey: 'idem-submit-1',
        taskId: 'task-stream',
        inputText: 'Hello, world!',
      }),
    )
    expect(submit.status).toBe('accepted')

    // Immediate prefix (before clock flush) — intermediate, no completed.
    const beforeFlush = eventTypes(envelopes)
    expect(beforeFlush).toEqual([
      'task.created',
      'turn.created',
      'message.accepted',
      'run.queued',
    ])
    expect(beforeFlush).not.toContain('run.completed')
    expect(beforeFlush).not.toContain('output.delta')

    clock.flush()

    const types = eventTypes(envelopes)
    // Exact tail order for normal stream (Codex: full sequence equality style).
    assertTypesInOrder(types, [
      'task.created',
      'turn.created',
      'message.accepted',
      'run.queued',
      'run.started',
      'output.delta',
      'output.delta',
      'output.delta',
      'output.completed',
      'run.completed',
    ])

    // Deltas concat == final output text (items.rs style).
    const deltas = collectOutputDeltaTexts(envelopes)
    expect(deltas.join('')).toBe('Hello, world')
    const completed = findEnvelope(envelopes, 'output.completed')
    expect(payloadText(completed)).toBe('Hello, world')
  })

  it('partial advance: still running after first delta only', async () => {
    // Intermediate vs final — advance clock partially, not flush.
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'codex-partial',
      clock,
      defaultScenario: 'normal-stream-complete',
      stepMs: 100,
      outputDeltas: ['A', 'B', 'C'],
      keywordScenarios: false,
    })
    const { envelopes } = collectEnvelopes(runtime, 'task-partial')
    await bootstrapTask(runtime, 'task-partial')
    await runtime.sendCommand(
      cmd({
        type: 'submitTurn',
        commandId: 's1',
        idempotencyKey: 'i1',
        taskId: 'task-partial',
        inputText: 'partial',
      }),
    )

    // run.started is scheduled at +100ms; first delta at +200ms.
    clock.advance(100)
    let types = eventTypes(envelopes)
    expect(types).toContain('run.started')
    expect(types).not.toContain('output.delta')
    expect(types).not.toContain('run.completed')

    clock.advance(100)
    types = eventTypes(envelopes)
    expect(types.filter((t) => t === 'output.delta')).toHaveLength(1)
    expect(types).not.toContain('run.completed')

    // Projection intermediate: assistant may exist, run still running.
    const mid = projectEventsFromEmpty('task-partial', 'proj-1', envelopes)
    expect(mid.readModel.runStatus).toBe('running')
    expect(mid.readModel.timeline.some((i) => i.category === 'assistant-message')).toBe(
      true,
    )

    clock.flush()
    const final = projectEventsFromEmpty('task-partial', 'proj-1', envelopes)
    expect(final.readModel.runStatus).toBe('completed')
  })

  it('cancel: cancel_requested then cancelled, never completed', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'codex-cancel',
      clock,
      defaultScenario: 'cancel-run',
      stepMs: 10,
      keywordScenarios: false,
    })
    const { envelopes } = collectEnvelopes(runtime, 'task-cancel')
    await bootstrapTask(runtime, 'task-cancel')
    await runtime.sendCommand(
      cmd({
        type: 'submitTurn',
        commandId: 's1',
        idempotencyKey: 'i1',
        taskId: 'task-cancel',
        inputText: 'long work',
      }),
    )
    clock.advance(10) // → running
    expect(eventTypes(envelopes)).toContain('run.started')

    const cancelAck = await runtime.sendCommand(
      cmd({
        type: 'cancelRun',
        commandId: 'c1',
        idempotencyKey: 'ic1',
        taskId: 'task-cancel',
      }),
    )
    expect(cancelAck.status).toBe('accepted')
    expect(eventTypes(envelopes)).toContain('run.cancel_requested')

    clock.flush()
    const types = eventTypes(envelopes)
    assertTypesInOrder(types, [
      'run.started',
      'run.cancel_requested',
      'run.cancelled',
    ])
    expect(types).not.toContain('run.completed')

    const projected = projectEventsFromEmpty('task-cancel', 'proj-1', envelopes)
    expect(projected.readModel.runStatus).toBe('cancelled')
  })

  it('approval: pauses until respondToApproval, then continues', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'codex-appr',
      clock,
      defaultScenario: 'approval-approve',
      stepMs: 10,
      keywordScenarios: false,
    })
    const { envelopes } = collectEnvelopes(runtime, 'task-appr')
    await bootstrapTask(runtime, 'task-appr')
    await runtime.sendCommand(
      cmd({
        type: 'submitTurn',
        commandId: 's1',
        idempotencyKey: 'i1',
        taskId: 'task-appr',
        inputText: '需要审批',
      }),
    )
    clock.flush()

    let types = eventTypes(envelopes)
    expect(types).toContain('approval.requested')
    expect(types).not.toContain('run.completed')

    const mid = projectEventsFromEmpty('task-appr', 'proj-1', envelopes)
    expect(mid.readModel.runStatus).toBe('waiting_for_approval')

    const requested = findEnvelope(envelopes, 'approval.requested')
    const requestId =
      requested &&
      typeof requested.payload === 'object' &&
      requested.payload &&
      'requestId' in requested.payload
        ? String((requested.payload as { requestId: string }).requestId)
        : ''
    expect(requestId).toBeTruthy()

    const ack = await runtime.sendCommand(
      cmd({
        type: 'respondToApproval',
        commandId: 'a1',
        idempotencyKey: 'ia1',
        taskId: 'task-appr',
        payload: { decision: 'approved', requestId },
      }),
    )
    expect(ack.status).toBe('accepted')
    clock.flush()

    types = eventTypes(envelopes)
    assertTypesInOrder(types, [
      'approval.requested',
      'approval.resolved',
      'run.completed',
    ])
    const final = projectEventsFromEmpty('task-appr', 'proj-1', envelopes)
    expect(final.readModel.runStatus).toBe('completed')
  })

  it('reasoning-tools: tool/command appear before final output.completed', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'codex-tools',
      clock,
      defaultScenario: 'reasoning-tools-complete',
      stepMs: 5,
      keywordScenarios: false,
    })
    const { envelopes } = collectEnvelopes(runtime, 'task-tools')
    await bootstrapTask(runtime, 'task-tools')
    await runtime.sendCommand(
      cmd({
        type: 'submitTurn',
        commandId: 's1',
        idempotencyKey: 'i1',
        taskId: 'task-tools',
        inputText: '跑工具',
      }),
    )
    clock.flush()

    const types = eventTypes(envelopes)
    assertTypesInOrder(types, [
      'run.started',
      'reasoning.started',
      'reasoning.delta',
      'reasoning.completed',
      'plan.updated',
      'tool.called',
      'tool.completed',
      'command.started',
      'command.completed',
      'file.changed',
      'output.completed',
      'run.completed',
    ])

    const projected = projectEventsFromEmpty('task-tools', 'proj-1', envelopes)
    const cats = projected.readModel.timeline.map((i) => i.category)
    expect(cats).toContain('reasoning-section')
    expect(cats).toContain('tool-group')
    expect(cats).toContain('command-execution')
    expect(cats).toContain('assistant-message')
  })
})
