import { describe, expect, it } from 'vitest'
import {
  completedRunScenario,
  cancelledRunScenario,
  failedRunScenario,
  createScriptedRuntimePort,
} from './scripted-runtime-port'

describe('ScriptedRuntimePort', () => {
  it('emits completed-run events on startRun', async () => {
    const runtime = createScriptedRuntimePort()
    const received: string[] = []
    runtime.subscribe('task-a', null, (event) => {
      if (event.kind === 'event') received.push(event.envelope.eventType)
    })

    await runtime.startRun(
      {
        taskId: 'task-a',
        turnId: 'turn-1',
        proposedRunId: 'run-1',
        taskExecutionContextSnapshot: {} as never,
        capabilitiesSnapshot: null,
      },
      'idem-1',
    )

    // Wait for microtask
    await new Promise((r) => setTimeout(r, 10))

    expect(received).toEqual([
      'run.queued',
      'run.started',
      'message.accepted',
      'output.delta',
      'output.completed',
      'run.completed',
    ])
  })

  it('emits cancelled-run events', async () => {
    const runtime = createScriptedRuntimePort({
      defaultScenario: cancelledRunScenario,
    })
    const received: string[] = []
    runtime.subscribe('task-a', null, (event) => {
      if (event.kind === 'event') received.push(event.envelope.eventType)
    })

    await runtime.startRun(
      {
        taskId: 'task-a',
        turnId: 'turn-1',
        proposedRunId: 'run-1',
        taskExecutionContextSnapshot: {} as never,
        capabilitiesSnapshot: null,
      },
      'idem-1',
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(received).toContain('run.cancelled')
  })

  it('emits failed-run events', async () => {
    const runtime = createScriptedRuntimePort({
      defaultScenario: failedRunScenario,
    })
    const received: string[] = []
    runtime.subscribe('task-fail', null, (event) => {
      if (event.kind === 'event') received.push(event.envelope.eventType)
    })

    await runtime.startRun(
      {
        taskId: 'task-fail',
        turnId: 'turn-1',
        proposedRunId: 'run-1',
        taskExecutionContextSnapshot: {} as never,
        capabilitiesSnapshot: null,
      },
      'idem-1',
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(received).toContain('run.failed')
  })

  it('records received commands', async () => {
    const runtime = createScriptedRuntimePort()
    const ack = await runtime.sendCommand({
      type: 'submitTurn',
      taskId: 'task-a',
      inputText: 'hello',
      commandId: 'cmd-1',
      issuedAt: '1970-01-01T00:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-1',
      schemaVersion: 1,
    } as never)

    expect(ack.status).toBe('accepted')
    expect(runtime.receivedCommands).toHaveLength(1)
    expect(runtime.receivedCommands[0]!.type).toBe('submitTurn')
  })

  it('getSnapshot returns null for unknown task', async () => {
    const runtime = createScriptedRuntimePort()
    const snap = await runtime.getSnapshot('unknown')
    expect(snap).toBeNull()
  })

  it('getSnapshot returns stored snapshot after startRun', async () => {
    const runtime = createScriptedRuntimePort()
    await runtime.startRun(
      {
        taskId: 'task-a',
        turnId: 'turn-1',
        proposedRunId: 'run-1',
        taskExecutionContextSnapshot: {} as never,
        capabilitiesSnapshot: null,
      },
      'idem-1',
    )
    const snap = await runtime.getSnapshot('task-a')
    expect(snap).not.toBeNull()
    expect(snap!.runStatus).toBe('completed')
    expect(snap!.lastTaskSequence).toBe(6)
  })

  it('setScenario overrides default per task', async () => {
    const runtime = createScriptedRuntimePort()
    runtime.setScenario('task-custom', cancelledRunScenario('task-custom', 'run-1', 'turn-1'))
    const received: string[] = []
    runtime.subscribe('task-custom', null, (event) => {
      if (event.kind === 'event') received.push(event.envelope.eventType)
    })

    await runtime.startRun(
      {
        taskId: 'task-custom',
        turnId: 'turn-1',
        proposedRunId: 'run-1',
        taskExecutionContextSnapshot: {} as never,
        capabilitiesSnapshot: null,
      },
      'idem-1',
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(received).toContain('run.cancelled')
    expect(received).not.toContain('run.completed')
  })

  it('completedRunScenario produces correct sequence', () => {
    const scenario = completedRunScenario('task-a', 'run-1', 'turn-1')
    expect(scenario.events).toHaveLength(6)
    expect(scenario.events.map((e) => e.eventType)).toEqual([
      'run.queued',
      'run.started',
      'message.accepted',
      'output.delta',
      'output.completed',
      'run.completed',
    ])
    // All envelopes should have monotonically increasing taskSequence
    const seqs = scenario.events.map((e) => e.taskSequence)
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!)
    }
  })
})
