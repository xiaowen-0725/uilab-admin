/**
 * Task Pane Projection types (Phase 4C).
 * Full Timeline taxonomy is declared; 4C implements a vertical-slice subset.
 */

import type { ProjectId, RunId, RunStatus, TaskId, TitleSource, TurnId } from '../model/lifecycle'
import type { QuestionAnswer, QuestionRequest } from '../protocol/question-answer'
import type { PlanSnapshot } from './plan-snapshot'

export type { PlanProgress, PlanSnapshot, PlanStep, PlanStepStatus } from './plan-snapshot'

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
 * Legacy assistant text role. Projection no longer writes `commentary`;
 * the type remains so persisted / replayed items can still be read.
 */
export type AssistantMessageRole = 'commentary' | 'final'

/** Source of the current `liveStatus` line. Tool wins over generic hints. */
export type LiveStatusKind = 'tool' | 'generic'

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
  /**
   * Tool kind hint for icon (read / web_search / command / generic).
   */
  toolKind?: string
  /** Concrete tool name for approval-request rows (exact match for presets). */
  toolName?: string
  /** Stable process category for deterministic summary aggregation. */
  processKind?: ProcessStepKind
  /** Structured plan for Timeline plan-update cards (snapshot without derived progress). */
  plan?: Omit<PlanSnapshot, 'progress'>
  /** Structured Question Request (present when `run.input_requested` carried options). */
  question?: QuestionRequest
  /** Structured answer after `run.input_provided`. */
  answer?: QuestionAnswer
  /** Run-terminal deterministic summary, counted by logical row id. */
  processSummary?: ProcessSummary
  /**
   * Legacy assistant segment role. Projection no longer writes `commentary`.
   */
  messageRole?: AssistantMessageRole
  /**
   * Mid-turn user reply to a Question Request. Stays in the same turn
   * (`groupTimelineIntoTurns` does not split on this item).
   */
  inlineResponse?: boolean
  /** ISO end time for a completed working-row (duration derivation). */
  endedAt?: string
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
  /**
   * Internal: which kind last wrote `liveStatus`.
   * Tool-sourced status is not overwritten by generic thinking/generating hints.
   */
  liveStatusKind: LiveStatusKind | null
  /**
   * Latest Plan snapshot from `plan.updated`. Null until the first update.
   * Progress is derived; UI must not treat it as independent state.
   */
  plan: PlanSnapshot | null
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
