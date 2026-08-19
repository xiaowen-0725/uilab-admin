/**
 * Board module entities — field-level copy of workbench-board-spec §1.2–1.5.
 */

export type BoardId = string
export type BoardWidgetId = string
export type WidgetDataJobId = string
export type WidgetJobRunId = string
export type BoardMountId = string
export type WidgetDataSourceId = string

/** Sentinel identity for the no-identity path (template default, example boards, public jobs). */
export const ANONYMOUS_PRINCIPAL_KEY = 'anonymous'

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
  /**
   * Compat view of the current identity's snapshot (ADR-0025 §1).
   * Persisted in `widgetDataSnapshots`; leftover v3 rows may still carry these fields.
   */
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
  /**
   * Leftover v3 field. Trigger lives on WidgetDataSource; ignored at runtime.
   * Old IDB rows may still carry `{ kind: 'manual' }`.
   */
  trigger?: { kind: 'manual' }
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

export type WidgetDataSourceKind = 'preset' | 'job' | 'query'

export type WidgetDataSourceTrigger =
  | { kind: 'manual' }
  | { kind: 'onOpen' }
  | { kind: 'schedule' }

/** Resource-ref parameter (ADR-0024 §2). Other param kinds stay unstructured. */
export interface DataSourceResourceParameterDecl {
  type: 'resource'
  resourceType: string
}

export interface WidgetDataSourceRecord {
  id: WidgetDataSourceId
  widgetId: BoardWidgetId
  kind: WidgetDataSourceKind
  trigger: WidgetDataSourceTrigger
  parameters?: Record<string, unknown>
  /** Marks which parameters are resource refs for gate ②. */
  parameterSchema?: Record<string, DataSourceResourceParameterDecl>
  /**
   * Fail-closed for `query`: undeclared permissions refuse evaluation.
   * Checked as `resource.permissions ⊇ requiredPermissions`.
   */
  requiredPermissions?: string[]
  /** ADR-0024 §7 — type only; job `ctx.query` consumption is not implemented. */
  referencableByJob: boolean
  /** Present when `kind === 'job'`. */
  jobId?: WidgetDataJobId
  /** Present when `kind === 'query'`. Implementation is a later ticket. */
  queryName?: string
  createdAt: string
  updatedAt: string
}

export interface WidgetDataSnapshotRecord {
  widgetId: BoardWidgetId
  principalKey: string
  data: unknown
  capturedAt: string
}

/**
 * Job sandbox context (spec §7.4). `query` is reserved (ADR-0024 §7) and unused in v1.
 */
export interface JobContext {
  runId: string
  jobId: string
  now: Date
  timeZone: string
  runDir: string
  query?: (name: string, params: Record<string, unknown>) => Promise<unknown>
}

export const BOARD_WIDGET_LIMIT = 20
export const WIDGET_JOB_RUN_LIMIT = 10

export const DEFAULT_WIDGET_SPAN = {
  min: { w: 2, h: 2 },
  default: { w: 4, h: 4 },
  max: { w: 8, h: 8 },
} as const

export function isJobRunnable(job: WidgetDataJobRecord): boolean {
  return Boolean(job.approved?.code && job.approved.codeHash)
}

export function widgetStatusForRun(
  status: WidgetJobRunStatus,
): BoardWidgetStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'cancelled':
      return 'cancelled'
    case 'success':
      return 'idle'
    case 'error':
    case 'timeout':
      return 'error'
  }
}
