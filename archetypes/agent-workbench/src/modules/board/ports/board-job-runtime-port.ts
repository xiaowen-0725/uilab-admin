/**
 * WidgetDataSourcePort — evaluate a widget data source (preset / job / query).
 * `BoardJobRuntimePort` is the historical name for the same port.
 */

import type { WidgetDataSourceKind } from '../model/types'

export type BoardJobRunOk = {
  ok: true
  payload: unknown
}

export type BoardJobRunFailure = {
  ok: false
  error: string
  hint: string
}

export type BoardJobRunResult = BoardJobRunOk | BoardJobRunFailure

export type WidgetDataSourceEvaluateRequest = {
  kind: WidgetDataSourceKind
  jobId?: string
  presetData?: unknown
  queryName?: string
  queryParams?: Record<string, unknown>
}

export const QUERY_SOURCE_NOT_IMPLEMENTED = '查询数据来源尚未接通'

export interface WidgetDataSourcePort {
  /** False skips first-run (tests / explicit unavailability). Omit on the live HTTP adapter. */
  readonly available?: boolean
  /** Optional startup probe so chrome can show a persistent unavailable icon. */
  probe?(): Promise<BoardJobRunResult>
  /** Job kind: existing sidecar Deno endpoint. */
  runJob(jobId: string): Promise<BoardJobRunResult>
  /** Best-effort cancel of an in-flight evaluate / runJob (logout / revoke). */
  cancelJob?(jobId: string): void
  /**
   * preset: return prefilled data; job: delegate to `runJob`; query: reserved.
   * Optional so existing runJob-only test doubles keep working.
   */
  evaluate?(request: WidgetDataSourceEvaluateRequest): Promise<BoardJobRunResult>
}

/** @deprecated Prefer WidgetDataSourcePort. Same contract. */
export type BoardJobRuntimePort = WidgetDataSourcePort

export async function evaluateWidgetDataSource(
  port: WidgetDataSourcePort,
  request: WidgetDataSourceEvaluateRequest,
): Promise<BoardJobRunResult> {
  if (port.evaluate) return port.evaluate(request)
  return defaultEvaluateDataSource(port, request)
}

export async function defaultEvaluateDataSource(
  port: Pick<WidgetDataSourcePort, 'runJob'>,
  request: WidgetDataSourceEvaluateRequest,
): Promise<BoardJobRunResult> {
  switch (request.kind) {
    case 'preset':
      return { ok: true, payload: request.presetData ?? null }
    case 'query':
      return {
        ok: false,
        error: 'not_implemented',
        hint: QUERY_SOURCE_NOT_IMPLEMENTED,
      }
    case 'job': {
      const jobId = request.jobId?.trim() ?? ''
      if (!jobId) return { ok: false, error: 'unknown_job', hint: '缺少 jobId' }
      return port.runJob(jobId)
    }
  }
}
