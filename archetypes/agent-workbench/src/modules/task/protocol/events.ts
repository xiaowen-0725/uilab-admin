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
  // tool/approval/input
  | 'tool.called'
  | 'tool.progress'
  | 'tool.completed'
  | 'approval.requested'
  | 'approval.resolved'
  | 'run.input_requested'
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

/** Phase 4B Fake minimum emit set (s01/s03 class). */
export const FAKE_RUNTIME_CORE_EVENT_TYPES = [
  'task.created',
  'turn.created',
  'run.queued',
  'run.started',
  'message.accepted',
  'output.delta',
  'output.completed',
  'run.completed',
  'run.cancel_requested',
  'run.cancelled',
] as const satisfies readonly AgentRuntimeEventType[]
