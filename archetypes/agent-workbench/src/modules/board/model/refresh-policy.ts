/**
 * Board refresh policy — calibrated in #140, written back to spec §8 / §14.
 *
 * Poll 1 s: jobs last 60–120 s; sub-second polls only load the dev-server proxy.
 * Timeout stays with the sidecar (60 s default, 120 s hard cap, ADR-0023).
 * Stale 15 min: shorter than 5 min re-hits the sidecar when flipping list/detail;
 * longer than 1 h leaves morning data hanging through the afternoon.
 * Never-run widgets (no latestDataAt) count as stale. No scheduled refresh in v1.
 */

export const BOARD_REFRESH_POLL_INTERVAL_MS = 1_000
export const BOARD_REFRESH_STALE_MS = 15 * 60 * 1_000
export const BOARD_REFRESH_CONCURRENCY = 2
/** Sidecar default / hard cap (ADR-0023). Renderer poll budget is the hard cap plus one extra tick. */
export const BOARD_JOB_DEFAULT_TIMEOUT_MS = 60_000
export const BOARD_JOB_MAX_TIMEOUT_MS = 120_000

export const JOB_RUNTIME_DISCONNECTED = '运行时未连接'
export const JOB_DENO_MISSING = '未安装 Deno，无法执行取数作业'
export const JOB_INVALID_RESULT = '作业返回的不是合法 JSON，未写入小组件'
export const JOB_ORPHANED_RUN = '运行中断，本机运行时已不可续'

const DISCONNECTED_HINT = /不可达|未连接|未接通|network|failed to fetch/i

export function mapJobRuntimeHint(error: string, hint?: string): string {
  const trimmed = hint?.trim()
  switch (error) {
    case 'deno_not_found':
      return trimmed || JOB_DENO_MISSING
    case 'runtime_unavailable':
      if (trimmed && !DISCONNECTED_HINT.test(trimmed)) return trimmed
      return JOB_RUNTIME_DISCONNECTED
    case 'invalid_job_result':
      return trimmed || JOB_INVALID_RESULT
    case 'already_running':
      return trimmed || '该作业已在运行'
    default:
      return trimmed || '作业执行失败'
  }
}

function invalidJobResult(): { ok: false; error: string; hint: string } {
  return { ok: false, error: 'invalid_job_result', hint: JOB_INVALID_RESULT }
}

export function parseJobResult(
  payload: unknown,
): { ok: true; data: unknown } | { ok: false; error: string; hint: string } {
  if (typeof payload === 'string') {
    try {
      return { ok: true, data: JSON.parse(payload) as unknown }
    } catch {
      return invalidJobResult()
    }
  }
  if (payload === undefined) return invalidJobResult()
  return { ok: true, data: payload }
}

export function isWidgetDataStale(
  latestDataAt: string | undefined,
  nowMs: number,
  staleMs: number = BOARD_REFRESH_STALE_MS,
): boolean {
  if (!latestDataAt) return true
  const at = Date.parse(latestDataAt)
  if (Number.isNaN(at)) return true
  return nowMs - at >= staleMs
}
