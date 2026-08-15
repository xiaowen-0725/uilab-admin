/**
 * Task Pane Projection types (protocol v2).
 * TimelineItem aligns with Codex ThreadItem.
 */

import type { ProjectId, TaskId, TitleSource, TurnId, TurnStatus } from '../model/lifecycle'
import type { QuestionAnswer, QuestionRequest } from '../protocol/question-answer'
import type { PlanSnapshot } from './plan-snapshot'

export type { PlanProgress, PlanSnapshot, PlanStep, PlanStepStatus } from './plan-snapshot'

/**
 * Design §9 taxonomy. Projection must cover:
 * user-message | assistant-message | turn-terminal | unsupported-event.
 */
export type TimelineItemCategory =
  | 'user-message'
  | 'reasoning-section'
  | 'plan-update'
  | 'tool-group'
  | 'command-execution'
  | 'file-change'
  | 'artifact'
  | 'source-group'
  | 'approval-request'
  | 'input-request'
  | 'warning'
  | 'error'
  | 'assistant-message'
  | 'turn-terminal'
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

export type FileChangeKind = 'created' | 'updated' | 'deleted'

export type DeliverableSource = 'file' | 'artifact'

/** Token usage for a turn (hover/detail only; not a standing status bar). */
export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

/** Aggregated file / artifact produced by one completed turn. */
export interface DeliverableRef {
  path: string
  title?: string
  kind?: string
  changeKind?: FileChangeKind
  source: DeliverableSource
  additions?: number
  deletions?: number
}

/** Optional presentation meta (file diffs, tool children, turn duration). */
export interface TimelineItemMeta {
  /** File-change: line additions / deletions. */
  additions?: number
  deletions?: number
  /** File-change / artifact: created vs edited vs deleted. */
  changeKind?: FileChangeKind
  /** Artifact kind (document / image / …). */
  kind?: string
  /** Turn-terminal: files + artifacts produced in this turn. */
  deliverables?: DeliverableRef[]
  /** File-change: green/red card lines. */
  diffLines?: Array<{ type: 'add' | 'del' | 'context'; text: string; line?: number }>
  /** Tool / file collapsible child labels (paths, search titles). */
  children?: string[]
  /** File path when distinct from title. */
  path?: string
  /** Artifact / file display title when distinct from path. */
  title?: string
  /** VoltAgent step id; used to seal working blocks across steps. */
  stepId?: string
  /** ISO start time for live elapsed duration while the turn is active. */
  startedAt?: string
  /** Turn duration for completed turn chrome (ms). */
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
  /** Structured Question Request (present when `input.requested` carried options). */
  question?: QuestionRequest
  /** Structured answer after `input.provided`. */
  answer?: QuestionAnswer
  /** Turn-terminal deterministic summary, counted by logical row id. */
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
  /** Token usage shown on turn-terminal hover / detail. */
  usage?: TokenUsage
}

export interface TimelineItem {
  id: string
  category: TimelineItemCategory
  title?: string
  body?: string
  /** Chip status for turn-terminal (and optional future rows). */
  status?: TurnStatus | 'streaming' | string
  sourceEventIds: string[]
  sourceEventRange?: TimelineItemSourceRange
  taskId: TaskId
  turnId?: TurnId
  sequenceFrom?: number
  sequenceTo?: number
  projectionVersion: number
  /** Presentation extras (diffs, children, duration) — never mutates Turn authority. */
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
  turnStatus: TurnStatus | null
  activeTurnId: TurnId | null
  /** True after `task.archived`. Task is an open container otherwise. */
  archived: boolean
  /** Latest usage from `turn.completed` or `usage.updated`. */
  usage: TokenUsage | null
  /**
   * Codex-like intermediate status under timeline / above composer.
   * Chinese label while the turn is non-terminal; null when idle or terminal.
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
  /**
   * Files + artifacts from the latest completed turn.
   * Empty until `turn.completed` aggregates `file.changed` / `artifact.*`.
   */
  deliverables: DeliverableRef[]
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
  /**
   * True after this task has seen `step.*` / `message.started`.
   * Assistant lookback heuristic stays off once real step boundaries exist.
   */
  hasStepBoundaries: boolean
  /** Current VoltAgent step; stamped onto working-row meta. */
  activeStepId?: string
  /**
   * ISO time of the last user-visible boundary (turn start / answer /
   * approval / prose end). Consumed as `startedAt` by the next working row
   * so burst-delivered reasoning still reports honest wall-clock duration.
   */
  workAnchorAt?: string
}
