/**
 * Board sidecar tool contracts (spec §5.2 / §5.3 / §5.6).
 * Return types are scalars and short strings only — never html / code / data.
 */

export const BOARD_WIDGET_MAX_BYTES = 256 * 1024
export const BOARD_JOB_MAX_BYTES = 64 * 1024
export const BOARD_STAGING_TTL_MS = 24 * 60 * 60 * 1000
export const BOARD_REPAIR_LIMIT = 2

export const BOARD_TOOL_ERROR_CODES = [
  'unknown_build',
  'build_not_ready',
  'hash_mismatch',
  'validation_failed',
  'csp_violation',
  'sdk_contract_violation',
  'widget_limit_reached',
  'board_limit_reached',
  'unknown_board',
  'unknown_widget',
  'unknown_job',
  'already_running',
  'runtime_unavailable',
  'not_authorized',
  'not_approved',
  'code_hash_mismatch',
  'deno_not_found',
  'output_too_large',
  'repair_budget_exhausted',
] as const

export type BoardToolErrorCode = (typeof BOARD_TOOL_ERROR_CODES)[number]

export type BoardToolError = {
  ok: false
  error: BoardToolErrorCode
  hint: string
}

export type BoardWidgetBeginResult = {
  widgetId: string
  buildId: string
}

export type BoardWidgetAppendResult = {
  received: number
  nextSeq: number
}

export type BoardWidgetFinishResult = {
  widgetId: string
  contentHash: string
  bytes: number
}

export type BoardJobBeginResult = {
  jobId: string
  buildId: string
}

export type BoardJobAppendResult = {
  received: number
  nextSeq: number
}

export type BoardJobFinishResult = {
  jobId: string
  codeHash: string
}

export type BoardStatusBoard = {
  id: string
  title: string
  widgetCount: number
  remaining: number
}

export type BoardStatusCommitted = {
  widgetId: string
  boardId: string
  contentHash: string
  jobId?: string
  codeHash?: string
}

export type BoardStatusStaging = {
  draftId: string
  kind: BoardDraftKind
  status: BoardDraftStatus
  title: string
  widgetId?: string
  jobId?: string
  contentHash?: string
}

export type BoardStatusResult = {
  boards: BoardStatusBoard[]
  targetExists?: boolean
  committed: BoardStatusCommitted[]
  staging: BoardStatusStaging[]
}

export type BoardCommitResult = {
  boardId: string
  widgetId: string
  mountId: string
  placement: { x: number; y: number; w: number; h: number }
  jobId?: string
}

export type BoardDraftKind = 'widget' | 'job'

export type BoardDraftStatus = 'open' | 'ready' | 'consumed'

export type BoardDraftMeta = {
  kind: BoardDraftKind
  buildId: string
  widgetId?: string
  jobId?: string
  title: string
  description?: string
  allowedHosts?: string[]
  nextSeq: number
  received: Record<string, string>
  validationFailures: number
  status: BoardDraftStatus
  contentHash?: string
  bytes?: number
  createdAt: string
  updatedAt: string
}

export function boardToolError(
  error: BoardToolErrorCode,
  hint: string,
): BoardToolError {
  return { ok: false, error, hint }
}

export function repairBudgetExhausted(): BoardToolError {
  return boardToolError(
    'repair_budget_exhausted',
    '同一草稿连续校验失败已达上限，请停止重试并向用户说明问题、换方案',
  )
}

export function isBoardToolError(value: unknown): value is BoardToolError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as BoardToolError).ok === false &&
    typeof (value as BoardToolError).error === 'string' &&
    typeof (value as BoardToolError).hint === 'string'
  )
}
