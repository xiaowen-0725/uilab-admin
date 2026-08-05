import { describe, expect, it } from 'vitest'
import { createDeterministicFakeRuntime } from './fake-runtime'
import { VirtualClock } from './virtual-clock'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import type { ApplicationCommand } from '../protocol/commands'
import type { RuntimeSubscriptionEvent } from '../ports/runtime-port'

function baseEnvelope(
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

describe('DeterministicFakeRuntime', () => {
  it('normal-stream-complete: createTask + submitTurn yields fixed lifecycle + deltas', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 't1',
      clock,
      defaultScenario: 'normal-stream-complete',
      stepMs: 10,
      outputDeltas: ['A', 'B'],
    })

    const events = collectEvents(runtime, 'task-a')

    const createAck = await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'cmd-create-1',
        idempotencyKey: 'idem-create-1',
        proposedTaskId: 'task-a',
        projectId: 'proj-1',
        initialPrompt: 'hello world',
      }),
    )
    expect(createAck.status).toBe('accepted')

    const submitAck = await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'cmd-submit-1',
        idempotencyKey: 'idem-submit-1',
        taskId: 'task-a',
        inputText: 'hello world',
        proposedTurnId: 'turn-1',
        proposedRunId: 'run-1',
      }),
    )
    expect(submitAck.status).toBe('accepted')

    // Immediate: task.created, turn.created, message.accepted, run.queued
    const typesBefore = events.map((e) => e.eventType)
    expect(typesBefore).toEqual([
      'task.created',
      'turn.created',
      'message.accepted',
      'run.queued',
    ])

    clock.flush()

    const types = events.map((e) => e.eventType)
    expect(types).toEqual([
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

    // Deterministic ids and taskSequence under seed + virtual clock.
    expect(events.map((e) => e.eventId)).toEqual([
      't1:evt:task-a:1',
      't1:evt:task-a:2',
      't1:evt:task-a:3',
      't1:evt:task-a:4',
      't1:evt:task-a:5',
      't1:evt:task-a:6',
      't1:evt:task-a:7',
      't1:evt:task-a:8',
      't1:evt:task-a:9',
    ])
    expect(events.map((e) => e.taskSequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(events.every((e) => e.runId === undefined || e.runId === 'run-1' || e.eventType.startsWith('task') || e.eventType.startsWith('turn') || e.eventType.startsWith('message'))).toBe(
      true,
    )
    const runEvents = events.filter((e) => e.runId)
    expect(runEvents.every((e) => e.runId === 'run-1')).toBe(true)
    expect(runEvents.every((e) => e.turnId === 'turn-1')).toBe(true)

    // Same seed + same commands again on a fresh runtime → identical envelopes.
    const clock2 = new VirtualClock({ startMs: 0 })
    const runtime2 = createDeterministicFakeRuntime({
      seed: 't1',
      clock: clock2,
      defaultScenario: 'normal-stream-complete',
      stepMs: 10,
      outputDeltas: ['A', 'B'],
    })
    await runtime2.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'cmd-create-1',
        idempotencyKey: 'idem-create-1',
        proposedTaskId: 'task-a',
        projectId: 'proj-1',
        initialPrompt: 'hello world',
      }),
    )
    await runtime2.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'cmd-submit-1',
        idempotencyKey: 'idem-submit-1',
        taskId: 'task-a',
        inputText: 'hello world',
        proposedTurnId: 'turn-1',
        proposedRunId: 'run-1',
      }),
    )
    clock2.flush()
    expect(runtime2.getTaskEvents('task-a')).toEqual(runtime.getTaskEvents('task-a'))
  })

  it('cancel-run: cancel while running → cancel_requested → cancelled', async () => {
    const clock = new VirtualClock()
    const runtime = createDeterministicFakeRuntime({
      seed: 'c1',
      clock,
      defaultScenario: 'cancel-run',
      stepMs: 10,
    })

    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'c-create',
        idempotencyKey: 'c-create',
        proposedTaskId: 'task-c',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'c-submit',
        idempotencyKey: 'c-submit',
        taskId: 'task-c',
        inputText: 'cancel me',
        proposedRunId: 'run-c',
      }),
    )

    // Advance to run.started only.
    clock.advance(10)
    const mid = runtime.getTaskEvents('task-c').map((e) => e.eventType)
    expect(mid).toContain('run.started')
    expect(mid).not.toContain('run.completed')

    const cancelAck = await runtime.sendCommand(
      baseEnvelope({
        type: 'cancelRun',
        commandId: 'c-cancel',
        idempotencyKey: 'c-cancel',
        taskId: 'task-c',
        runId: 'run-c',
      }),
    )
    expect(cancelAck.status).toBe('accepted')

    const afterCancelReq = runtime.getTaskEvents('task-c').map((e) => e.eventType)
    expect(afterCancelReq).toContain('run.cancel_requested')

    clock.flush()
    const finalTypes = runtime.getTaskEvents('task-c').map((e) => e.eventType)
    expect(finalTypes).toContain('run.cancelled')
    expect(finalTypes).not.toContain('run.completed')

    const snap = await runtime.getSnapshot('task-c', 'run-c')
    expect(snap?.runStatus).toBe('cancelled')
  })

  it('duplicate idempotencyKey → duplicate ack, no second side effects', async () => {
    const clock = new VirtualClock()
    const runtime = createDeterministicFakeRuntime({ seed: 'dup', clock })

    const first = await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'cmd-1',
        idempotencyKey: 'same-key',
        proposedTaskId: 'task-d',
        projectId: 'proj-1',
      }),
    )
    expect(first.status).toBe('accepted')

    const second = await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'cmd-2',
        idempotencyKey: 'same-key',
        proposedTaskId: 'task-other',
        projectId: 'proj-1',
      }),
    )
    expect(second.status).toBe('duplicate')
    expect(second.originalCommandId).toBe('cmd-1')
    expect(second.reasonCode).toBe('duplicate_idempotency_key')

    // Only one task.created
    expect(runtime.getTaskEvents('task-d').filter((e) => e.eventType === 'task.created')).toHaveLength(
      1,
    )
    expect(runtime.getTaskEvents('task-other')).toHaveLength(0)
  })

  it('cross-task isolation: independent sequences, no shared cursor mutation', async () => {
    const clock = new VirtualClock()
    const runtime = createDeterministicFakeRuntime({
      seed: 'iso',
      clock,
      stepMs: 5,
      outputDeltas: ['x'],
    })

    const eventsA: AgentRuntimeEventEnvelope[] = []
    const eventsB: AgentRuntimeEventEnvelope[] = []
    runtime.subscribe('task-a', 0, (ev) => {
      if (ev.kind === 'event') eventsA.push(ev.envelope)
    })
    runtime.subscribe('task-b', 0, (ev) => {
      if (ev.kind === 'event') eventsB.push(ev.envelope)
    })

    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'a-create',
        idempotencyKey: 'a-create',
        proposedTaskId: 'task-a',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'b-create',
        idempotencyKey: 'b-create',
        proposedTaskId: 'task-b',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'a-submit',
        idempotencyKey: 'a-submit',
        taskId: 'task-a',
        inputText: 'A',
        proposedRunId: 'run-a',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'b-submit',
        idempotencyKey: 'b-submit',
        taskId: 'task-b',
        inputText: 'B',
        proposedRunId: 'run-b',
      }),
    )
    clock.flush()

    expect(eventsA.every((e) => e.taskId === 'task-a')).toBe(true)
    expect(eventsB.every((e) => e.taskId === 'task-b')).toBe(true)

    // Sequences are task-local (both restart at 1).
    expect(eventsA.map((e) => e.taskSequence)).toEqual(
      Array.from({ length: eventsA.length }, (_, i) => i + 1),
    )
    expect(eventsB.map((e) => e.taskSequence)).toEqual(
      Array.from({ length: eventsB.length }, (_, i) => i + 1),
    )

    // No cross contamination of run ids.
    expect(eventsA.filter((e) => e.runId).every((e) => e.runId === 'run-a')).toBe(true)
    expect(eventsB.filter((e) => e.runId).every((e) => e.runId === 'run-b')).toBe(true)
  })

  it('second concurrent submitTurn while running → rejected task_busy', async () => {
    const clock = new VirtualClock()
    const runtime = createDeterministicFakeRuntime({
      seed: 'busy',
      clock,
      defaultScenario: 'cancel-run', // stays running until cancel
      stepMs: 10,
    })

    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'b-create',
        idempotencyKey: 'b-create',
        proposedTaskId: 'task-busy',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'b-submit-1',
        idempotencyKey: 'b-submit-1',
        taskId: 'task-busy',
        inputText: 'first',
      }),
    )
    clock.advance(10) // run.started

    const second = await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'b-submit-2',
        idempotencyKey: 'b-submit-2',
        taskId: 'task-busy',
        inputText: 'second concurrent',
      }),
    )
    expect(second.status).toBe('rejected')
    expect(second.reasonCode).toBe('task_busy')
  })

  it('queueFollowUp while running enqueues and drains after complete', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'q',
      clock,
      defaultScenario: 'cancel-run',
      stepMs: 10,
      keywordScenarios: false,
    })
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'q-create',
        idempotencyKey: 'q-create',
        proposedTaskId: 'task-q',
        projectId: 'proj-1',
      }),
    )
    // Stay running until we complete via a different scenario path:
    // use cancel-run only for first turn busy check; switch scenario for queue drain.
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'q-submit-1',
        idempotencyKey: 'q-submit-1',
        taskId: 'task-q',
        inputText: 'first',
        proposedRunId: 'run-q1',
      }),
    )
    clock.advance(10) // started

    const busy = await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'q-busy',
        idempotencyKey: 'q-busy',
        taskId: 'task-q',
        inputText: 'should reject',
      }),
    )
    expect(busy.status).toBe('rejected')
    expect(busy.reasonCode).toBe('task_busy')

    const q = await runtime.sendCommand(
      baseEnvelope({
        type: 'queueFollowUp',
        commandId: 'q-q',
        idempotencyKey: 'q-q',
        taskId: 'task-q',
        inputText: 'queued later',
      }),
    )
    expect(q.status).toBe('accepted')

    // Cancel first run to free the task, then drain uses normal complete for queued turn.
    runtime.setTaskScenario('task-q', 'normal-stream-complete')
    await runtime.sendCommand(
      baseEnvelope({
        type: 'cancelRun',
        commandId: 'q-cancel',
        idempotencyKey: 'q-cancel',
        taskId: 'task-q',
        runId: 'run-q1',
      }),
    )
    clock.flush()

    const types = runtime.getTaskEvents('task-q').map((e) => e.eventType)
    expect(types.filter((t) => t === 'turn.created').length).toBeGreaterThanOrEqual(2)
    expect(types).toContain('run.completed')
    expect(
      runtime
        .getTaskEvents('task-q')
        .some(
          (e) =>
            e.eventType === 'message.accepted' &&
            (e.payload as { text?: string }).text === 'queued later',
        ),
    ).toBe(true)
  })

  it('reasoning-tools-complete emits full s02-class sequence', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'rt',
      clock,
      stepMs: 0,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-rt', 'reasoning-tools-complete')
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'rt-c',
        idempotencyKey: 'rt-c',
        proposedTaskId: 'task-rt',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'rt-s',
        idempotencyKey: 'rt-s',
        taskId: 'task-rt',
        inputText: 'use tools',
        proposedRunId: 'run-rt',
      }),
    )
    clock.flush()
    const types = runtime.getTaskEvents('task-rt').map((e) => e.eventType)
    expect(types).toContain('reasoning.started')
    expect(types).toContain('reasoning.delta')
    expect(types).toContain('reasoning.section_completed')
    expect(types).toContain('reasoning.completed')
    expect(types).toContain('plan.updated')
    expect(types).toContain('tool.called')
    expect(types).toContain('tool.completed')
    expect(types).toContain('command.started')
    expect(types).toContain('command.completed')
    expect(types).toContain('file.changed')
    expect(types).toContain('source.grouped')
    expect(types).toContain('run.completed')
    // Order: reasoning before tools before output
    const ri = types.indexOf('reasoning.started')
    const ti = types.indexOf('tool.called')
    const oi = types.indexOf('output.delta')
    expect(ri).toBeLessThan(ti)
    expect(ti).toBeLessThan(oi)
  })

  it('approval-approve waits then completes after respondToApproval', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'ap',
      clock,
      stepMs: 10,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-ap', 'approval-approve')
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'ap-c',
        idempotencyKey: 'ap-c',
        proposedTaskId: 'task-ap',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'ap-s',
        idempotencyKey: 'ap-s',
        taskId: 'task-ap',
        inputText: 'need approval',
        proposedRunId: 'run-ap',
      }),
    )
    clock.flush()
    const mid = runtime.getTaskEvents('task-ap').map((e) => e.eventType)
    expect(mid).toContain('approval.requested')
    expect(mid).not.toContain('run.completed')
    const snap = await runtime.getSnapshot('task-ap', 'run-ap')
    expect(snap?.runStatus).toBe('waiting_for_approval')

    const req = runtime
      .getTaskEvents('task-ap')
      .find((e) => e.eventType === 'approval.requested')
    const requestId = (req?.payload as { requestId: string }).requestId

    const ack = await runtime.sendCommand(
      baseEnvelope({
        type: 'respondToApproval',
        commandId: 'ap-ok',
        idempotencyKey: 'ap-ok',
        taskId: 'task-ap',
        payload: { decision: 'approved', requestId },
      }),
    )
    expect(ack.status).toBe('accepted')
    clock.flush()
    const final = runtime.getTaskEvents('task-ap').map((e) => e.eventType)
    expect(final).toContain('approval.resolved')
    expect(final).toContain('run.completed')
  })

  it('approval-reject → cancelled with approval_rejected', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'ar',
      clock,
      stepMs: 0,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-ar', 'approval-reject')
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'ar-c',
        idempotencyKey: 'ar-c',
        proposedTaskId: 'task-ar',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'ar-s',
        idempotencyKey: 'ar-s',
        taskId: 'task-ar',
        inputText: 'reject path',
        proposedRunId: 'run-ar',
      }),
    )
    clock.flush()
    const requestId = (
      runtime
        .getTaskEvents('task-ar')
        .find((e) => e.eventType === 'approval.requested')?.payload as {
        requestId: string
      }
    ).requestId
    await runtime.sendCommand(
      baseEnvelope({
        type: 'respondToApproval',
        commandId: 'ar-no',
        idempotencyKey: 'ar-no',
        taskId: 'task-ar',
        payload: { decision: 'rejected', requestId },
      }),
    )
    clock.flush()
    const cancelled = runtime
      .getTaskEvents('task-ar')
      .find((e) => e.eventType === 'run.cancelled')
    expect(cancelled).toBeTruthy()
    expect((cancelled?.payload as { reasonCode: string }).reasonCode).toBe(
      'approval_rejected',
    )
  })

  it('waiting-input resumes after provideRunInput', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'wi',
      clock,
      stepMs: 0,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-wi', 'waiting-input')
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'wi-c',
        idempotencyKey: 'wi-c',
        proposedTaskId: 'task-wi',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'wi-s',
        idempotencyKey: 'wi-s',
        taskId: 'task-wi',
        inputText: 'need clarify',
        proposedRunId: 'run-wi',
      }),
    )
    clock.flush()
    expect((await runtime.getSnapshot('task-wi', 'run-wi'))?.runStatus).toBe(
      'waiting_for_input',
    )
    const requestId = (
      runtime
        .getTaskEvents('task-wi')
        .find((e) => e.eventType === 'run.input_requested')?.payload as {
        requestId: string
      }
    ).requestId
    await runtime.sendCommand(
      baseEnvelope({
        type: 'provideRunInput',
        commandId: 'wi-in',
        idempotencyKey: 'wi-in',
        taskId: 'task-wi',
        inputText: 'path=/tmp/demo',
        requestId,
      }),
    )
    clock.flush()
    const types = runtime.getTaskEvents('task-wi').map((e) => e.eventType)
    expect(types).toContain('run.input_provided')
    expect(types).toContain('run.completed')
  })

  it('fail-once-retry: first fails, retryTurn completes', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'fo',
      clock,
      stepMs: 0,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-fo', 'fail-once-retry')
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'fo-c',
        idempotencyKey: 'fo-c',
        proposedTaskId: 'task-fo',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'fo-s',
        idempotencyKey: 'fo-s',
        taskId: 'task-fo',
        inputText: 'may fail',
        proposedTurnId: 'turn-fo',
        proposedRunId: 'run-fo-1',
      }),
    )
    clock.flush()
    expect((await runtime.getSnapshot('task-fo', 'run-fo-1'))?.runStatus).toBe(
      'failed',
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'retryTurn',
        commandId: 'fo-r',
        idempotencyKey: 'fo-r',
        taskId: 'task-fo',
        turnId: 'turn-fo',
        proposedRunId: 'run-fo-2',
      }),
    )
    clock.flush()
    expect((await runtime.getSnapshot('task-fo', 'run-fo-2'))?.runStatus).toBe(
      'completed',
    )
  })

  it('long-content produces >2k chars of output deltas', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'lc',
      clock,
      stepMs: 0,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-lc', 'long-content')
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'lc-c',
        idempotencyKey: 'lc-c',
        proposedTaskId: 'task-lc',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'lc-s',
        idempotencyKey: 'lc-s',
        taskId: 'task-lc',
        inputText: 'long',
      }),
    )
    clock.flush()
    const deltas = runtime
      .getTaskEvents('task-lc')
      .filter((e) => e.eventType === 'output.delta')
    const total = deltas.reduce((n, e) => {
      const t = (e.payload as { text?: string }).text ?? ''
      return n + t.length
    }, 0)
    expect(total).toBeGreaterThan(2000)
  })

  it('steerRun while running injects steer note', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'st',
      clock,
      defaultScenario: 'cancel-run',
      stepMs: 10,
      keywordScenarios: false,
    })
    await runtime.sendCommand(
      baseEnvelope({
        type: 'createTask',
        commandId: 'st-c',
        idempotencyKey: 'st-c',
        proposedTaskId: 'task-st',
        projectId: 'proj-1',
      }),
    )
    await runtime.sendCommand(
      baseEnvelope({
        type: 'submitTurn',
        commandId: 'st-s',
        idempotencyKey: 'st-s',
        taskId: 'task-st',
        inputText: 'run',
        proposedRunId: 'run-st',
      }),
    )
    clock.advance(10)
    const ack = await runtime.sendCommand(
      baseEnvelope({
        type: 'steerRun',
        commandId: 'st-steer',
        idempotencyKey: 'st-steer',
        taskId: 'task-st',
        runId: 'run-st',
        inputText: 'focus on tests',
      }),
    )
    expect(ack.status).toBe('accepted')
    const steered = runtime
      .getTaskEvents('task-st')
      .filter((e) => e.eventType === 'output.delta')
      .some((e) => (e.payload as { steer?: boolean }).steer === true)
    expect(steered).toBe(true)
  })
})
