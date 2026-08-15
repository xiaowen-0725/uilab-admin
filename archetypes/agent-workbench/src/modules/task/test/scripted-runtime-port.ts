/**
 * ScriptedRuntimePort — minimal test-only RuntimePort for controller/projection tests.
 *
 * Replaces the deleted DeterministicFakeRuntime (ADR-0018) for testing paths
 * that need a runtime producing real event envelopes without a sidecar:
 * - persistence rehydrate / attach race
 * - submit → completed/cancelled/failed projection
 * - approval / input / retry / steer / reconcile command forwarding
 * - work_surface.open_requested event channel
 *
 * NOT a product runtime. NOT exported from the task module index.
 * NOT wired into composition root. Test files import directly from this path.
 */

import type { RuntimePort, RuntimeSubscriptionEvent, RuntimeCapabilities, RuntimeSnapshot, RunStartInput } from '../ports/runtime-port'
import type { ApplicationCommand, CommandAcknowledgement } from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'

/** A scripted scenario: envelopes to emit for one Run, in order. */
export type ScriptedScenario = {
  /** Event envelopes to emit after startRun, in order. */
  events: AgentRuntimeEventEnvelope[]
}

/** Build a minimal envelope with auto-incrementing taskSequence. */
export function envelope(
  taskId: string,
  eventType: string,
  fields: Partial<AgentRuntimeEventEnvelope> & { taskSequence: number },
): AgentRuntimeEventEnvelope {
  const seq = fields.taskSequence
  return {
    eventId: `${taskId}:e${seq}`,
    eventType: eventType as AgentRuntimeEventEnvelope['eventType'],
    schemaVersion: 1,
    projectId: fields.projectId ?? 'test-project',
    taskId,
    turnId: fields.turnId,
    runId: fields.runId,
    taskSequence: seq,
    occurredAt: fields.occurredAt ?? '1970-01-01T00:00:00.000Z',
    receivedAt: fields.receivedAt ?? '1970-01-01T00:00:00.000Z',
    payload: fields.payload ?? {},
  }
}

/** Standard completed-run scenario: lifecycle + message + terminal. */
export function completedRunScenario(taskId: string, runId: string, turnId: string): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'run.queued', { taskSequence: 1, runId, turnId }),
      envelope(taskId, 'run.started', { taskSequence: 2, runId, turnId }),
      envelope(taskId, 'message.accepted', { taskSequence: 3, runId, turnId }),
      envelope(taskId, 'output.delta', { taskSequence: 4, runId, turnId, payload: { text: 'Hello' } }),
      envelope(taskId, 'output.completed', { taskSequence: 5, runId, turnId }),
      envelope(taskId, 'run.completed', { taskSequence: 6, runId, turnId }),
    ],
  }
}

/** Cancelled-run scenario. */
export function cancelledRunScenario(taskId: string, runId: string, turnId: string): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'run.queued', { taskSequence: 1, runId, turnId }),
      envelope(taskId, 'run.started', { taskSequence: 2, runId, turnId }),
      envelope(taskId, 'run.cancel_requested', { taskSequence: 3, runId, turnId }),
      envelope(taskId, 'run.cancelled', { taskSequence: 4, runId, turnId }),
    ],
  }
}

/** Failed-run scenario. */
export function failedRunScenario(taskId: string, runId: string, turnId: string, message = 'runtime error'): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'run.queued', { taskSequence: 1, runId, turnId }),
      envelope(taskId, 'run.started', { taskSequence: 2, runId, turnId }),
      envelope(taskId, 'run.failed', { taskSequence: 3, runId, turnId, payload: { message } }),
    ],
  }
}

/** Approval-required scenario: run pauses at waiting_for_approval. */
export function approvalScenario(taskId: string, runId: string, turnId: string, requestId = 'req-1'): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'run.queued', { taskSequence: 1, runId, turnId }),
      envelope(taskId, 'run.started', { taskSequence: 2, runId, turnId }),
      envelope(taskId, 'tool.called', { taskSequence: 3, runId, turnId, payload: { tool: 'write_file', approvalRequestId: requestId } }),
    ],
  }
}

/** `approval.requested` pause — used by permission-preset auto-respond tests. */
export function approvalRequestedScenario(
  taskId: string,
  runId: string,
  turnId: string,
  requestId: string,
  toolName: string,
): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'run.queued', { taskSequence: 1, runId, turnId }),
      envelope(taskId, 'run.started', { taskSequence: 2, runId, turnId }),
      envelope(taskId, 'approval.requested', {
        taskSequence: 3,
        runId,
        turnId,
        payload: { requestId, toolName },
      }),
    ],
  }
}

/** Structured Question Request pause — used by question-card / preset lock tests. */
export function questionRequestedScenario(
  taskId: string,
  runId: string,
  turnId: string,
  requestId: string,
  options?: {
    question?: string
    choices?: Array<{ id: string; label: string }>
    allowMultiple?: boolean
  },
): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'run.queued', { taskSequence: 1, runId, turnId }),
      envelope(taskId, 'run.started', { taskSequence: 2, runId, turnId }),
      envelope(taskId, 'run.input_requested', {
        taskSequence: 3,
        runId,
        turnId,
        payload: {
          requestId,
          question: options?.question ?? '用哪种语气写纪要？',
          options: options?.choices ?? [
            { id: 'formal', label: '正式' },
            { id: 'casual', label: '轻松' },
          ],
          allowMultiple: options?.allowMultiple === true,
        },
      }),
    ],
  }
}

export type CreateScriptedRuntimePortOptions = {
  /** Default scenario producer; called per startRun if no per-task scenario is set. */
  defaultScenario?: (taskId: string, runId: string, turnId: string) => ScriptedScenario
  /** Delay between events (ms); 0 = synchronous (default). */
  eventDelayMs?: number
}

/**
 * Create a ScriptedRuntimePort — a test double that emits scripted event
 * sequences when startRun is called. Commands are accepted; events flow
 * through subscribe.
 */
export function createScriptedRuntimePort(
  options: CreateScriptedRuntimePortOptions = {},
): RuntimePort & {
  /** Set a per-task scenario (overrides default). */
  setScenario: (taskId: string, scenario: ScriptedScenario) => void
  /** Push envelopes to subscribers (tests that skip startRun). */
  pushEvents: (taskId: string, events: AgentRuntimeEventEnvelope[]) => void
  /** Recorded commands received via sendCommand. */
  receivedCommands: ApplicationCommand[]
} {
  const defaultScenario = options.defaultScenario ?? completedRunScenario
  const eventDelayMs = options.eventDelayMs ?? 0
  const perTaskScenarios = new Map<string, ScriptedScenario>()
  const listeners = new Map<string, Set<(event: RuntimeSubscriptionEvent) => void>>()
  const snapshots = new Map<string, RuntimeSnapshot>()
  const receivedCommands: ApplicationCommand[] = []
  const lastSeq = new Map<string, number>()

  function rememberSeq(taskId: string, seq: number): void {
    lastSeq.set(taskId, Math.max(lastSeq.get(taskId) ?? 0, seq))
  }

  function emit(taskId: string, events: AgentRuntimeEventEnvelope[]): void {
    const subs = listeners.get(taskId)
    for (const env of events) rememberSeq(taskId, env.taskSequence)
    if (!subs) return
    for (const env of events) {
      if (eventDelayMs > 0) {
        setTimeout(() => {
          for (const listener of subs) listener({ kind: 'event', envelope: env })
        }, eventDelayMs)
      } else {
        for (const listener of subs) listener({ kind: 'event', envelope: env })
      }
    }
  }

  return {
    receivedCommands,
    setScenario(taskId, scenario) {
      perTaskScenarios.set(taskId, scenario)
    },
    pushEvents(taskId, events) {
      emit(taskId, events)
    },

    async sendCommand(command: ApplicationCommand): Promise<CommandAcknowledgement> {
      receivedCommands.push(command)
      if (command.type === 'respondToApproval') {
        const taskId = command.taskId
        const seq = (lastSeq.get(taskId) ?? 0) + 1
        emit(taskId, [
          envelope(taskId, 'approval.resolved', {
            taskSequence: seq,
            runId: command.runId,
            turnId: command.turnId,
            payload: {
              requestId: command.payload.requestId,
              decision: command.payload.decision,
              reason: command.payload.reason,
            },
          }),
        ])
      }
      if (command.type === 'provideRunInput') {
        const taskId = command.taskId
        const seq = (lastSeq.get(taskId) ?? 0) + 1
        emit(taskId, [
          envelope(taskId, 'run.input_provided', {
            taskSequence: seq,
            runId: command.runId,
            turnId: command.turnId,
            payload: {
              requestId: command.requestId,
              answer: command.answer ?? {
                kind: 'freeText',
                text: command.inputText,
              },
              answeredAt: new Date().toISOString(),
            },
          }),
        ])
      }
      return {
        status: 'accepted',
        commandId: command.commandId,
        acceptedAt: new Date().toISOString(),
      }
    },

    subscribe(taskId, _cursor, listener) {
      let subs = listeners.get(taskId)
      if (!subs) {
        subs = new Set()
        listeners.set(taskId, subs)
      }
      subs.add(listener)
      return () => {
        subs!.delete(listener)
      }
    },

    async getSnapshot(taskId): Promise<RuntimeSnapshot | null> {
      return snapshots.get(taskId) ?? null
    },

    async getCapabilities(): Promise<RuntimeCapabilities> {
      return {
        projectId: 'test-project',
        environmentId: 'test-env',
        features: {
          steer: true,
          queueFollowUp: true,
          approval: true,
          runInput: true,
          cancel: true,
        },
      }
    },

    async startRun(input: RunStartInput, idempotencyKey: string): Promise<CommandAcknowledgement> {
      const { taskId, turnId, proposedRunId: runId } = input
      const scenario = perTaskScenarios.get(taskId) ?? defaultScenario(taskId, runId, turnId)

      // Store snapshot for rehydrate tests
      snapshots.set(taskId, {
        taskId,
        runId,
        protocolVersion: 1,
        runStatus: 'completed',
        lastTaskSequence: scenario.events.length,
      })

      // Emit events asynchronously so subscribe can be set up first
      if (eventDelayMs > 0) {
        setTimeout(() => emit(taskId, scenario.events), eventDelayMs)
      } else {
        // Microtask delay so the caller can subscribe before events fire
        Promise.resolve().then(() => emit(taskId, scenario.events))
      }

      return {
        status: 'accepted',
        commandId: idempotencyKey,
        acceptedAt: new Date().toISOString(),
      }
    },
  }
}
