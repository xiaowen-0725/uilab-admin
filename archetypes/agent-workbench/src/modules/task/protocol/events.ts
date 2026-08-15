/**
 * Append-only Agent Runtime event envelope + event type family (design §8).
 * Envelope is immutable; Fake may emit a subset of declared types.
 */

export interface AgentRuntimeEventEnvelope {
  eventId: string
  eventType: AgentRuntimeEventType | (string & {})
  schemaVersion: number
  projectId: string
  taskId: string
  turnId?: string
  runId?: string
  parentRunId?: string
  /** Task-local monotonic sequence (1-based). */
  taskSequence: number
  runtimeCursor?: string
  occurredAt: string
  receivedAt: string
  idempotencyKey?: string
  payload: unknown
}

/** Declared event family; Fake 4B emits a subset (lifecycle + stream + cancel). */
export type AgentRuntimeEventType =
  // lifecycle
  | 'task.created'
  | 'turn.created'
  | 'run.queued'
  | 'run.started'
  | 'run.completed'
  // message/stream
  | 'message.accepted'
  | 'output.delta'
  | 'output.completed'
  // reasoning/plan (declared; optional in Fake 4B)
  | 'reasoning.started'
  | 'reasoning.delta'
  | 'reasoning.section_completed'
  | 'reasoning.completed'
  | 'plan.updated'
  | 'warning'
  // tool/approval/input
  | 'tool.called'
  | 'tool.progress'
  | 'tool.completed'
  | 'approval.requested'
  | 'approval.resolved'
  /**
   * Structured Question Request or legacy free-text prompt.
   * Payload: `{ requestId, question, options: Array<{id,label}>, allowMultiple }`
   * or the older `{ requestId, prompt }` form.
   */
  | 'run.input_requested'
  /**
   * User answered or skipped. Payload: `{ requestId, answer, answeredAt }`.
   * Skip uses `answer.kind = 'skipped'` — no separate event.
   */
  | 'run.input_provided'
  // command/file/source
  | 'command.started'
  | 'command.output'
  | 'command.completed'
  | 'file.changed'
  | 'source.grouped'
  // control/reconcile
  | 'run.cancel_requested'
  | 'run.cancelled'
  | 'run.interrupted'
  | 'run.reconciled'
  // artifact
  | 'artifact.created'
  | 'artifact.updated'
  | 'artifact.linked'
  // work surface open request (Composition consumes; not a timeline fact)
  | 'work_surface.open_requested'
  // error/recovery
  | 'run.failed'
  | 'runtime.disconnected'
  | 'runtime.reconnected'
  | 'runtime.gap_detected'
  | 'runtime.snapshot_applied'
  // metadata
  | 'task.renamed'
  | 'task.title_suggested'
  | 'environment.selected'
  | 'capability.changed'

export const AGENT_RUNTIME_EVENT_TYPES = [
  'task.created',
  'turn.created',
  'run.queued',
  'run.started',
  'run.completed',
  'message.accepted',
  'output.delta',
  'output.completed',
  'reasoning.started',
  'reasoning.delta',
  'reasoning.section_completed',
  'reasoning.completed',
  'plan.updated',
  'warning',
  'tool.called',
  'tool.progress',
  'tool.completed',
  'approval.requested',
  'approval.resolved',
  'run.input_requested',
  'run.input_provided',
  'command.started',
  'command.output',
  'command.completed',
  'file.changed',
  'source.grouped',
  'run.cancel_requested',
  'run.cancelled',
  'run.interrupted',
  'run.reconciled',
  'artifact.created',
  'artifact.updated',
  'artifact.linked',
  'work_surface.open_requested',
  'run.failed',
  'runtime.disconnected',
  'runtime.reconnected',
  'runtime.gap_detected',
  'runtime.snapshot_applied',
  'task.renamed',
  'task.title_suggested',
  'environment.selected',
  'capability.changed',
] as const satisfies readonly AgentRuntimeEventType[]

