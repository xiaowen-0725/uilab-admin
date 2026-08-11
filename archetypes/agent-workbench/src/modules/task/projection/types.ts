/**
 * Task Pane Projection types (Phase 4C).
 * Full Timeline taxonomy is declared; 4C implements a vertical-slice subset.
 */

import type { ProjectId, RunId, RunStatus, TaskId, TitleSource, TurnId } from '../model/lifecycle'

/**
 * Design §9 taxonomy (full). Phase 4C must project at least:
 * user-message | assistant-message | run-terminal | unsupported-event.
 * Remaining categories land in 4D+.
 */
export type TimelineItemCategory =
  | 'user-message'
  | 'reasoning-section'
  | 'plan-update'
  | 'tool-group'
  | 'command-execution'
  | 'file-change'
  | 'source-group'
  | 'approval-request'
  | 'input-request'
  | 'warning'
  | 'error'
  | 'assistant-message'
  | 'run-terminal'
  | 'unsupported-event'

export interface TimelineItemSourceRange {
  from: number
  to: number
}

/**
 * Assistant text role for process fold (Codex commentary vs final).
 * Optional on envelopes as output.phase; projection may also infer.
 */
export type AssistantMessageRole = 'commentary' | 'final'

export type ProcessStepKind =
  | 'read'
  | 'write'
  | 'list'
  | 'search'
  | 'command'
  | 'other'

export interface ProcessSummary {
  stepCount: number
  counts: Partial<Record<ProcessStepKind, number>>
}

/** Optional presentation meta (file diffs, tool children, turn duration). */
export interface TimelineItemMeta {
  /** File-change: line additions / deletions. */
  additions?: number
  deletions?: number
  /** File-change: green/red card lines. */
  diffLines?: Array<{ type: 'add' | 'del' | 'context'; text: string; line?: number }>
  /** Tool / file collapsible child labels (paths, search titles). */
  children?: string[]
  /** File path when distinct from title. */
  path?: string
  /** ISO start time for live elapsed duration while run is active. */
  startedAt?: string
  /** Run duration for completed turn chrome (ms). */
  durationMs?: number
  /** Tool kind hint for icon (read / web_search / command / generic). */
  toolKind?: string
  /** Stable process category for deterministic summary aggregation. */
  processKind?: ProcessStepKind
  /** Run-terminal deterministic summary, counted by logical row id. */
  processSummary?: ProcessSummary
  /**
   * Assistant segment role: mid-turn narration vs final answer.
   * Process fold shows commentary; final renders outside the fold.
   */
  messageRole?: AssistantMessageRole
}

export interface TimelineItem {
  id: string
  category: TimelineItemCategory
  title?: string
  body?: string
  /** Run/chip status for run-terminal (and optional future rows). */
  status?: RunStatus | 'streaming' | string
  sourceEventIds: string[]
  sourceEventRange?: TimelineItemSourceRange
  taskId: TaskId
  turnId?: TurnId
  runId?: RunId
  sequenceFrom?: number
  sequenceTo?: number
  projectionVersion: number
  /** Presentation extras (diffs, children, duration) — never mutates Run authority. */
  meta?: TimelineItemMeta
}

export type TimelineFollowMode = 'follow' | 'user-pinned'

export interface TaskScrollMeta {
  followMode: TimelineFollowMode
  unreadCount: number
}

/**
 * UI-facing Task read model. Authority is append-only events;
 * this model is pure projection output only.
 */
export interface TaskReadModel {
  taskId: TaskId
  projectId: ProjectId
  title: string
  titleSource: TitleSource
  projectionVersion: number
  runStatus: RunStatus | null
  activeRunId: RunId | null
  activeTurnId: TurnId | null
  /**
   * Codex-like intermediate status under timeline / above composer.
   * Chinese label while run is non-terminal; null when idle or terminal.
   */
  liveStatus: string | null
  timeline: TimelineItem[]
  recoveryRequired: boolean
  lastTaskSequence: number
  scroll: TaskScrollMeta
}

/**
 * Internal pure projection state (read model + dedupe set).
 * `seenEventIds` is serialized as string[] on the model side for test dumps;
 * runtime uses ProjectionState with a Set.
 */
export interface ProjectionState {
  readModel: TaskReadModel
  seenEventIds: ReadonlySet<string>
}
