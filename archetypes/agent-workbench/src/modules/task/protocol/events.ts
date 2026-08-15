/**
 * Append-only Agent Runtime event envelope + event type family (protocol v2).
 * Hierarchy: Task > Turn > Step > event. No Run layer.
 * Envelope is immutable; emitters may send a subset of declared types.
 */

export const AGENT_RUNTIME_SCHEMA_VERSION = 2

export interface AgentRuntimeEventEnvelope {
  eventId: string
  eventType: AgentRuntimeEventType | (string & {})
  schemaVersion: number
  projectId: string
  taskId: string
  /** Required turn ownership — every fact belongs to exactly one Turn. */
  turnId: string
  /** Task-local monotonic sequence (1-based). */
  taskSequence: number
  runtimeCursor?: string
  occurredAt: string
  receivedAt: string
  idempotencyKey?: string
  payload: unknown
}

/**
 * Declared event family. Each family follows started / delta|progress / completed
 * where a stream exists. Projection rejects undeclared names as unsupported-event.
 */
export type AgentRuntimeEventType =
  // task (open container: active | archived — no task.completed)
  | 'task.created'
  | 'task.renamed'
  | 'task.title_suggested'
  | 'task.archived'
  // turn
  | 'turn.started'
  | 'turn.completed'
  | 'turn.failed'
  | 'turn.cancelled'
  | 'turn.cancel_requested'
  // assistant message stream
  | 'message.started'
  | 'message.delta'
  | 'message.completed'
  // step
  | 'step.started'
  | 'step.completed'
  // reasoning / plan
  | 'reasoning.started'
  | 'reasoning.delta'
  | 'reasoning.completed'
  | 'plan.updated'
  | 'warning'
  // tool
  | 'tool.started'
  | 'tool.progress'
  | 'tool.completed'
  // approval
  | 'approval.requested'
  | 'approval.resolved'
  // question / input (symmetric with approval.*)
  | 'input.requested'
  | 'input.provided'
  // command
  | 'command.started'
  | 'command.delta'
  | 'command.completed'
  | 'file.changed'
  // artifact
  | 'artifact.created'
  | 'artifact.updated'
  | 'artifact.linked'
  // work surface open request (Composition consumes; not a timeline fact)
  | 'work_surface.open_requested'
  // usage (sidecar may emit; also carried on turn.completed)
  | 'usage.updated'
  // transport / recovery (declared; remote path not implemented)
  | 'runtime.disconnected'
  | 'runtime.reconnected'
  | 'runtime.gap_detected'
  | 'runtime.snapshot_applied'
  // metadata
  | 'environment.selected'
  | 'capability.changed'

export const AGENT_RUNTIME_EVENT_TYPES = [
  'task.created',
  'task.renamed',
  'task.title_suggested',
  'task.archived',
  'turn.started',
  'turn.completed',
  'turn.failed',
  'turn.cancelled',
  'turn.cancel_requested',
  'message.started',
  'message.delta',
  'message.completed',
  'step.started',
  'step.completed',
  'reasoning.started',
  'reasoning.delta',
  'reasoning.completed',
  'plan.updated',
  'warning',
  'tool.started',
  'tool.progress',
  'tool.completed',
  'approval.requested',
  'approval.resolved',
  'input.requested',
  'input.provided',
  'command.started',
  'command.delta',
  'command.completed',
  'file.changed',
  'artifact.created',
  'artifact.updated',
  'artifact.linked',
  'work_surface.open_requested',
  'usage.updated',
  'runtime.disconnected',
  'runtime.reconnected',
  'runtime.gap_detected',
  'runtime.snapshot_applied',
  'environment.selected',
  'capability.changed',
] as const satisfies readonly AgentRuntimeEventType[]
