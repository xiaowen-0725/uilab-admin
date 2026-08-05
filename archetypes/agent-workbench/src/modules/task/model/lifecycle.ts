/**
 * Task Module domain lifecycle types (Phase 4B Kernel).
 * Project→Task→Turn→Run hierarchy; no Project entity lives here.
 */

/** Opaque string aliases (branded for type-safety without runtime cost). */
export type ProjectId = string & { readonly __brand?: 'ProjectId' }
export type TaskId = string & { readonly __brand?: 'TaskId' }
export type TurnId = string & { readonly __brand?: 'TurnId' }
export type RunId = string & { readonly __brand?: 'RunId' }

export function asProjectId(id: string): ProjectId {
  return id as ProjectId
}
export function asTaskId(id: string): TaskId {
  return id as TaskId
}
export function asTurnId(id: string): TurnId {
  return id as TurnId
}
export function asRunId(id: string): RunId {
  return id as RunId
}

/**
 * Exact RunStatus union from design §7.
 * Terminal: completed | failed | cancelled.
 * Recovery-local: interrupted (not a remote terminal; same Run never returns to running).
 */
export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'waiting_for_input'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export const RUN_TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
])

export type TitleSource = 'local' | 'runtime' | 'user'

/** Navigator-persistent work unit; references projectId only. */
export interface Task {
  taskId: TaskId
  projectId: ProjectId
  title: string
  titleSource: TitleSource
  /** Accept predicate for task.title_suggested; initial 0. */
  lastAcceptedSuggestionVersion: number
  createdAt: string
}

/** One user intent cycle; may own multiple Run attempts. */
export interface Turn {
  turnId: TurnId
  taskId: TaskId
  /** Task-local turn order (1-based). */
  sequence: number
  parentTurnId?: TurnId
  inputText: string
  createdAt: string
  runIds: RunId[]
}

/** One concrete execution attempt of a Turn. */
export interface Run {
  runId: RunId
  turnId: TurnId
  taskId: TaskId
  status: RunStatus
  attempt: number
  parentRunId?: RunId
  agentId?: string
  startedAt?: string
  endedAt?: string
  lastTaskSequence?: number
  runtimeCursor?: string
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return RUN_TERMINAL_STATUSES.has(status)
}
