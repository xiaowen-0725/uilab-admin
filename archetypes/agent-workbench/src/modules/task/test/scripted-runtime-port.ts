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
import { AGENT_RUNTIME_SCHEMA_VERSION } from '../protocol/events'

/** A scripted scenario: envelopes to emit for one Turn, in order. */
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
    schemaVersion: AGENT_RUNTIME_SCHEMA_VERSION,
    projectId: fields.projectId ?? 'test-project',
    taskId,
    turnId: fields.turnId ?? 'turn-1',
    taskSequence: seq,
    occurredAt: fields.occurredAt ?? '1970-01-01T00:00:00.000Z',
    receivedAt: fields.receivedAt ?? '1970-01-01T00:00:00.000Z',
    payload: fields.payload ?? {},
  }
}

/** Standard completed-turn scenario: lifecycle + message + terminal. */
export function completedRunScenario(taskId: string, _runId: string, turnId: string): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'turn.started', {
        taskSequence: 1,
        turnId,
        payload: { inputText: 'Hello' },
      }),
      envelope(taskId, 'message.delta', {
        taskSequence: 2,
        turnId,
        payload: { text: 'Hello' },
      }),
      envelope(taskId, 'message.completed', { taskSequence: 3, turnId }),
      envelope(taskId, 'turn.completed', {
        taskSequence: 4,
        turnId,
        payload: { outcome: 'completed' },
      }),
    ],
  }
}

/** Cancelled-turn scenario. */
export function cancelledRunScenario(taskId: string, _runId: string, turnId: string): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'turn.started', { taskSequence: 1, turnId }),
      envelope(taskId, 'turn.cancel_requested', { taskSequence: 2, turnId }),
      envelope(taskId, 'turn.cancelled', { taskSequence: 3, turnId }),
    ],
  }
}

/** Failed-turn scenario. */
export function failedRunScenario(taskId: string, _runId: string, turnId: string, message = 'runtime error'): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'turn.started', { taskSequence: 1, turnId }),
      envelope(taskId, 'turn.failed', { taskSequence: 3, turnId, payload: { message } }),
    ],
  }
}

/** Approval-required scenario: turn pauses at waiting_for_approval. */
export function approvalScenario(taskId: string, _runId: string, turnId: string, requestId = 'req-1'): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'turn.started', { taskSequence: 1, turnId }),
      envelope(taskId, 'tool.started', {
        taskSequence: 2,
        turnId,
        payload: { tool: 'write_file', approvalRequestId: requestId },
      }),
    ],
  }
}

/** `approval.requested` pause — used by permission-preset auto-respond tests. */
export function approvalRequestedScenario(
  taskId: string,
  _runId: string,
  turnId: string,
  requestId: string,
  toolName: string,
): ScriptedScenario {
  return {
    events: [
      envelope(taskId, 'turn.started', { taskSequence: 1, turnId }),
      envelope(taskId, 'approval.requested', {
        taskSequence: 2,
        turnId,
        payload: { requestId, toolName },
      }),
    ],
  }
}

/** Structured Question Request pause — used by question-card / preset lock tests. */
export function questionRequestedScenario(
  taskId: string,
  _runId: string,
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
      envelope(taskId, 'turn.started', { taskSequence: 1, turnId }),
      envelope(taskId, 'input.requested', {
        taskSequence: 2,
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
            turnId: command.turnId,
            payload: {
              requestId: command.payload.requestId,
              decision: command.payload.decision,
              reason: command.payload.reason,
            },
          }),
        ])
      } else if (command.type === 'provideRunInput') {
        const taskId = command.taskId
        const seq = (lastSeq.get(taskId) ?? 0) + 1
        emit(taskId, [
          envelope(taskId, 'input.provided', {
            taskSequence: seq,
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
      const { taskId, turnId } = input
      const scenario = perTaskScenarios.get(taskId) ?? defaultScenario(taskId, turnId, turnId)

      snapshots.set(taskId, {
        taskId,
        protocolVersion: AGENT_RUNTIME_SCHEMA_VERSION,
        turnStatus: 'completed',
        lastTaskSequence: scenario.events.length,
      })

      if (eventDelayMs > 0) {
        setTimeout(() => emit(taskId, scenario.events), eventDelayMs)
      } else {
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
