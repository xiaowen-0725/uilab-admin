/**
 * BoardJobRuntimePort backed by sidecar POST /board/jobs/:id/run + poll.
 * Browser-safe. Same bearer surface as staging content.
 */

import {
  BOARD_JOB_MAX_TIMEOUT_MS,
  BOARD_REFRESH_POLL_INTERVAL_MS,
} from '../model/refresh-policy'
import {
  defaultEvaluateDataSource,
  type BoardJobRunFailure,
  type BoardJobRuntimePort,
  type BoardJobRunResult,
  type WidgetDataSourceEvaluateRequest,
} from '../ports/board-job-runtime-port'

const NETWORK_ERROR_RE =
  /failed to fetch|load failed|networkerror|network request failed/i

const POLL_BUDGET_MS = BOARD_JOB_MAX_TIMEOUT_MS + BOARD_REFRESH_POLL_INTERVAL_MS

export type HttpBoardJobRuntimeOptions = {
  baseUrl: string
  token?: string | null
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
  pollBudgetMs?: number
  sleep?: (ms: number) => Promise<void>
}

function authHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
  return headers
}

function isNetworkClassError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  const msg = err instanceof Error ? err.message : String(err)
  return NETWORK_ERROR_RE.test(msg)
}

function failure(error: string, hint: string): BoardJobRunFailure {
  return { ok: false, error, hint }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readErrorBody(
  res: Response,
): Promise<{ error?: string; hint?: string } | null> {
  try {
    return (await res.json()) as { error?: string; hint?: string }
  } catch {
    return null
  }
}

function failureFromStatus(
  status: number,
  body: { error?: string; hint?: string } | null,
): BoardJobRunFailure {
  if (status === 401 || status === 403) {
    return failure(
      body?.error ?? 'not_authorized',
      body?.hint ?? '缺少或无效的本机侧车凭据，无法执行作业',
    )
  }
  return failure(
    body?.error ?? 'runtime_unavailable',
    body?.hint ?? `作业执行端点不可达（HTTP ${status}）`,
  )
}

function failureFromCatch(
  err: unknown,
  channel: 'job' | 'query' = 'job',
): BoardJobRunFailure {
  const label = channel === 'query' ? '查询执行端点' : '作业执行端点'
  if (isNetworkClassError(err)) {
    return failure(
      'runtime_unavailable',
      `${label}不可达，侧车未连接或网络错误`,
    )
  }
  return failure(
    'runtime_unavailable',
    err instanceof Error ? err.message : `${label}不可达`,
  )
}

export function createHttpBoardJobRuntime(
  options: HttpBoardJobRuntimeOptions,
): BoardJobRuntimePort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const token = options.token
  const pollIntervalMs = options.pollIntervalMs ?? BOARD_REFRESH_POLL_INTERVAL_MS
  const pollBudgetMs = options.pollBudgetMs ?? POLL_BUDGET_MS
  const sleep = options.sleep ?? defaultSleep
  const headers = authHeaders(token)

  async function postRun(
    jobId: string,
  ): Promise<{ ok: true; runId: string } | BoardJobRunFailure> {
    const started = await fetchImpl(
      `${baseUrl}/board/jobs/${encodeURIComponent(jobId)}/run`,
      { method: 'POST', headers },
    )
    if (!started.ok) {
      return failureFromStatus(started.status, await readErrorBody(started))
    }
    const { runId } = (await started.json()) as { runId?: string }
    if (!runId) return failure('runtime_unavailable', '执行端点未返回 runId')
    return { ok: true, runId }
  }

  async function waitForRun(runId: string): Promise<BoardJobRunResult> {
    const deadline = Date.now() + pollBudgetMs
    while (Date.now() < deadline) {
      const polled = await fetchImpl(
        `${baseUrl}/board/runs/${encodeURIComponent(runId)}`,
        { headers },
      )
      if (!polled.ok) {
        return failureFromStatus(polled.status, await readErrorBody(polled))
      }
      const run = (await polled.json()) as {
        status: string
        result?: unknown
        error?: { code?: string; hint?: string }
      }
      if (run.status === 'running') {
        await sleep(pollIntervalMs)
        continue
      }
      if (run.status === 'success') {
        return { ok: true, payload: run.result }
      }
      return failure(
        run.error?.code ?? run.status,
        run.error?.hint ?? '作业执行失败',
      )
    }
    return failure('runtime_unavailable', '等待作业结果超时')
  }

  async function runJob(jobId: string): Promise<BoardJobRunResult> {
    const id = jobId.trim()
    if (!id) return failure('unknown_job', '缺少 jobId')
    try {
      const started = await postRun(id)
      if (!started.ok) return started
      return await waitForRun(started.runId)
    } catch (err) {
      return failureFromCatch(err)
    }
  }

  return {
    async probe(): Promise<BoardJobRunResult> {
      try {
        const res = await fetchImpl(`${baseUrl}/board/runs/_probe`, { headers })
        if (res.status === 401 || res.status === 403) {
          return failureFromStatus(res.status, await readErrorBody(res))
        }
        return { ok: true, payload: null }
      } catch (err) {
        return failureFromCatch(err)
      }
    },
    runJob,
    async evaluate(
      request: WidgetDataSourceEvaluateRequest,
    ): Promise<BoardJobRunResult> {
      if (request.kind !== 'query') {
        return defaultEvaluateDataSource({ runJob }, request)
      }
      const name = request.queryName?.trim() ?? ''
      if (!name) return failure('unknown_query', '缺少 queryName')
      try {
        const res = await fetchImpl(
          `${baseUrl}/board/queries/${encodeURIComponent(name)}/run`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ params: request.queryParams ?? {} }),
          },
        )
        const body = await readErrorBody(res)
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            return failure(
              body?.error ?? 'not_authorized',
              body?.hint ?? '缺少或无效的本机侧车凭据，无法执行查询',
            )
          }
          return failure(
            body?.error ?? 'runtime_unavailable',
            body?.hint ?? `查询执行端点不可达（HTTP ${res.status}）`,
          )
        }
        const parsed = body as { ok?: boolean; payload?: unknown; error?: string; hint?: string } | null
        if (parsed && parsed.ok === false) {
          return failure(parsed.error ?? 'runtime_unavailable', parsed.hint ?? '查询执行失败')
        }
        return { ok: true, payload: parsed && 'payload' in parsed ? parsed.payload : parsed }
      } catch (err) {
        return failureFromCatch(err, 'query')
      }
    },
  }
}
