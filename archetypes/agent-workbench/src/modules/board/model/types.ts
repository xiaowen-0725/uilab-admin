/**
 * Board module entities — field-level copy of workbench-board-spec §1.2–1.5.
 */

export type BoardId = string
export type BoardWidgetId = string
export type WidgetDataJobId = string
export type WidgetJobRunId = string
export type BoardMountId = string

/** Grid span in column / row units. Geometry constants stay in code, not IDB. */
export interface WidgetSpan {
  w: number
  h: number
}

/** Opaque until the widget-host ticket fills the slot contract. */
export type DataSlotSpec = unknown
/** Opaque until the widget-host ticket fills the submit contract. */
export type SubmitSpec = unknown

export type BoardWidgetStatus = 'idle' | 'running' | 'error' | 'cancelled'

export type WidgetJobRunStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'timeout'
  | 'cancelled'

export interface BoardPlacement {
  mountId: BoardMountId
  widgetId: BoardWidgetId
  x: number
  y: number
  w: number
  h: number
}

export interface BoardRecord {
  id: BoardId
  title: string
  purpose?: string
  isExample: boolean
  presetId?: string
  presetVersion?: number
  placements: BoardPlacement[]
  createdAt: string
  updatedAt: string
  createdByTaskId?: string
}

export interface BoardWidgetRecord {
  id: BoardWidgetId
  title: string
  html: string
  slots?: { main?: DataSlotSpec }
  events?: { submit?: SubmitSpec }
  span: { min: WidgetSpan; default: WidgetSpan; max: WidgetSpan }
  latestData?: unknown
  latestDataAt?: string
  status: BoardWidgetStatus
  lastRunId?: WidgetJobRunId
  createdAt: string
  updatedAt: string
  createdByTaskId?: string
}

export interface WidgetJobApprovedSnapshot {
  code: string
  codeHash: string
  allowedHosts: string[]
  approvedAt: string
  approvedInTaskId: string
}

export interface WidgetJobPendingChange {
  code: string
  allowedHosts: string[]
  requestedAt: string
}

export interface WidgetDataJobRecord {
  id: WidgetDataJobId
  widgetId: BoardWidgetId
  title: string
  description: string
  purpose?: string
  enabled: boolean
  trigger: { kind: 'manual' }
  resultSchema?: unknown
  timeoutMs?: number
  approved?: WidgetJobApprovedSnapshot
  pendingChange?: WidgetJobPendingChange
  createdAt: string
  updatedAt: string
}

export interface WidgetJobRunRecord {
  id: WidgetJobRunId
  jobId: WidgetDataJobId
  widgetId: BoardWidgetId
  startedAt: string
  finishedAt?: string
  status: WidgetJobRunStatus
  errorMessage?: string
  /** Reserved; v1 is always empty (spec revision 2026-08-16e). */
  artifactRef?: string
}

export const BOARD_WIDGET_LIMIT = 20
export const WIDGET_JOB_RUN_LIMIT = 10

export function isJobRunnable(job: WidgetDataJobRecord): boolean {
  return Boolean(job.approved?.code && job.approved.codeHash)
}

export function widgetStatusForRun(
  status: WidgetJobRunStatus,
): BoardWidgetStatus {
  if (status === 'running') return 'running'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'success') return 'idle'
  return 'error'
}
