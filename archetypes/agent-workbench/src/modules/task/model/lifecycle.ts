/**
 * Task Module domain lifecycle types (protocol v2).
 * Project → Task → Turn → Step → event. No Run layer. No Project entity here.
 */

/** Opaque string aliases (branded for type-safety without runtime cost). */
export type ProjectId = string & { readonly __brand?: 'ProjectId' }
export type TaskId = string & { readonly __brand?: 'TaskId' }
export type TurnId = string & { readonly __brand?: 'TurnId' }

export function asProjectId(id: string): ProjectId {
  return id as ProjectId
}
export function asTaskId(id: string): TaskId {
  return id as TaskId
}
export function asTurnId(id: string): TurnId {
  return id as TurnId
}

/**
 * Turn execution status. Terminal: completed | failed | cancelled.
 * `queued` / `interrupted` remain for the local status machine; v2 emitters
 * start at `running` via `turn.started` and do not emit those events.
 */
export type TurnStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'waiting_for_input'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export const TURN_TERMINAL_STATUSES: ReadonlySet<TurnStatus> = new Set([
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

/** One user submit → Agent finishes every action in that cycle. */
export interface Turn {
  turnId: TurnId
  taskId: TaskId
  /** Task-local turn order (1-based). */
  sequence: number
  parentTurnId?: TurnId
  inputText: string
  createdAt: string
}

export function isTerminalTurnStatus(status: TurnStatus): boolean {
  return TURN_TERMINAL_STATUSES.has(status)
}
