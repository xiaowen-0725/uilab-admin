/**
 * Single refresh pipeline for chrome / refresh-all / first-run / stale-on-open.
 * widget.status via recordRun is the only loading source — UI must not keep its own.
 */

import {
  BOARD_REFRESH_CONCURRENCY,
  BOARD_REFRESH_STALE_MS,
  isWidgetDataStale,
  JOB_ORPHANED_RUN,
  JOB_RUNTIME_DISCONNECTED,
  mapJobRuntimeHint,
  parseJobResult,
} from '../model/refresh-policy'
import {
  isJobRunnable,
  type WidgetDataJobId,
  type WidgetDataJobRecord,
  type WidgetJobRunRecord,
  type WidgetJobRunStatus,
} from '../model/types'
import type { BoardJobRuntimePort } from '../ports/board-job-runtime-port'
import type { BoardStorePort } from '../ports/board-store-port'

export type RefreshMode = 'refresh' | 'first-run'

export type RefreshOutcome =
  | { kind: 'already_running'; runId?: string }
  | { kind: 'skipped'; reason: 'not_runnable' | 'no_job' | 'no_widget' }
  | { kind: 'unavailable'; error: string; hint: string }
  | { kind: 'finished'; status: WidgetJobRunStatus; runId: string; hint?: string }

export type BoardWriteClock = () => string

export interface ExecuteJobRunInput {
  store: BoardStorePort
  runtime: BoardJobRuntimePort
  jobId: string
  widgetId: string
  mode?: RefreshMode
  nowIso?: BoardWriteClock
  onStatus?: () => void
}

export interface BoardRefreshController {
  refreshJob(jobId: WidgetDataJobId): Promise<RefreshOutcome>
  refreshBoard(boardId: string): Promise<RefreshOutcome[]>
  refreshStaleOnOpen(boardId: string): Promise<RefreshOutcome[]>
  reconcileOrphans(boardId?: string): Promise<void>
  isInFlight(jobId: WidgetDataJobId): boolean
  probe(): Promise<{ ok: true } | { ok: false; error: string; hint: string }>
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function defaultNowIso(): string {
  return new Date().toISOString()
}

function unavailable(): RefreshOutcome {
  return {
    kind: 'unavailable',
    error: 'runtime_unavailable',
    hint: JOB_RUNTIME_DISCONNECTED,
  }
}

function runStatusFromError(error: string): WidgetJobRunStatus {
  if (error === 'timeout') return 'timeout'
  if (error === 'cancelled') return 'cancelled'
  return 'error'
}

export function findUnavailable(
  outcomes: readonly RefreshOutcome[],
): Extract<RefreshOutcome, { kind: 'unavailable' }> | undefined {
  return outcomes.find(
    (item): item is Extract<RefreshOutcome, { kind: 'unavailable' }> =>
      item.kind === 'unavailable',
  )
}

export async function executeJobRun(
  input: ExecuteJobRunInput,
): Promise<RefreshOutcome> {
  const nowIso = input.nowIso ?? defaultNowIso
  if (input.mode === 'first-run' && input.runtime.available === false) {
    return unavailable()
  }

  const job = await input.store.getJob(input.jobId)
  if (!job || !isJobRunnable(job)) {
    return { kind: 'skipped', reason: job ? 'not_runnable' : 'no_job' }
  }
  const widget = await input.store.getWidget(input.widgetId)
  if (!widget) return { kind: 'skipped', reason: 'no_widget' }
  if (widget.status === 'running') {
    return { kind: 'already_running', runId: widget.lastRunId }
  }
  if (input.runtime.available === false) return unavailable()

  const runId = newId('run')
  const startedAt = nowIso()
  await input.store.recordRun({
    id: runId,
    jobId: input.jobId,
    widgetId: input.widgetId,
    startedAt,
    status: 'running',
  })
  input.onStatus?.()

  const result = await input.runtime.runJob(input.jobId)
  const finishedAt = nowIso()

  if (!result.ok && result.error === 'already_running') {
    return { kind: 'already_running', runId }
  }

  async function settle(
    status: WidgetJobRunStatus,
    extra?: { data?: unknown; errorMessage?: string },
  ): Promise<RefreshOutcome> {
    await input.store.recordRun(
      {
        id: runId,
        jobId: input.jobId,
        widgetId: input.widgetId,
        startedAt,
        finishedAt,
        status,
        errorMessage: extra?.errorMessage,
      },
      extra?.data,
    )
    input.onStatus?.()
    return { kind: 'finished', status, runId, hint: extra?.errorMessage }
  }

  if (result.ok) {
    const parsed = parseJobResult(result.payload)
    if (parsed.ok) return settle('success', { data: parsed.data })
    return settle('error', {
      errorMessage: mapJobRuntimeHint(parsed.error, parsed.hint),
    })
  }

  const status = runStatusFromError(result.error)
  return settle(status, {
    errorMessage: mapJobRuntimeHint(result.error, result.hint),
  })
}

export function createBoardRefreshController(input: {
  store: BoardStorePort
  runtime: BoardJobRuntimePort
  now?: () => Date
  onChange?: () => void
  concurrency?: number
  staleMs?: number
}): BoardRefreshController {
  const inFlight = new Set<string>()
  const concurrency = input.concurrency ?? BOARD_REFRESH_CONCURRENCY
  const staleMs = input.staleMs ?? BOARD_REFRESH_STALE_MS
  const clock = input.now ?? (() => new Date())
  const nowIso = () => clock().toISOString()

  async function runExclusive(job: WidgetDataJobRecord): Promise<RefreshOutcome> {
    if (inFlight.has(job.id)) {
      return { kind: 'already_running' }
    }
    inFlight.add(job.id)
    try {
      return await executeJobRun({
        store: input.store,
        runtime: input.runtime,
        jobId: job.id,
        widgetId: job.widgetId,
        nowIso,
        onStatus: input.onChange,
      })
    } finally {
      inFlight.delete(job.id)
    }
  }

  async function runPool(jobs: WidgetDataJobRecord[]): Promise<RefreshOutcome[]> {
    const outcomes: RefreshOutcome[] = []
    let cursor = 0
    async function worker() {
      while (cursor < jobs.length) {
        const index = cursor
        cursor += 1
        const job = jobs[index]
        if (!job) continue
        outcomes[index] = await runExclusive(job)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
    )
    return outcomes
  }

  async function jobsOnBoard(boardId: string): Promise<WidgetDataJobRecord[]> {
    const board = await input.store.getBoard(boardId)
    if (!board) return []
    const jobs: WidgetDataJobRecord[] = []
    for (const placement of board.placements) {
      const job = await input.store.getJobByWidgetId(placement.widgetId)
      if (job && isJobRunnable(job)) jobs.push(job)
    }
    return jobs
  }

  async function isRunning(job: WidgetDataJobRecord): Promise<boolean> {
    if (inFlight.has(job.id)) return true
    const widget = await input.store.getWidget(job.widgetId)
    return widget?.status === 'running'
  }

  async function markOrphaned(job: WidgetDataJobRecord): Promise<void> {
    const widget = await input.store.getWidget(job.widgetId)
    if (widget?.status !== 'running' || inFlight.has(job.id)) return
    const runs = await input.store.listRuns(job.id)
    const last = runs[runs.length - 1]
    const finishedAt = nowIso()
    const run: WidgetJobRunRecord = last
      ? { ...last, status: 'error', finishedAt, errorMessage: JOB_ORPHANED_RUN }
      : {
          id: newId('run'),
          jobId: job.id,
          widgetId: job.widgetId,
          startedAt: finishedAt,
          finishedAt,
          status: 'error',
          errorMessage: JOB_ORPHANED_RUN,
        }
    await input.store.recordRun(run)
    input.onChange?.()
  }

  return {
    isInFlight(jobId) {
      return inFlight.has(jobId)
    },
    async probe() {
      if (input.runtime.available === false) {
        return {
          ok: false,
          error: 'runtime_unavailable',
          hint: JOB_RUNTIME_DISCONNECTED,
        }
      }
      if (!input.runtime.probe) return { ok: true }
      const probed = await input.runtime.probe()
      if (probed.ok) return { ok: true }
      return {
        ok: false,
        error: probed.error,
        hint: mapJobRuntimeHint(probed.error, probed.hint),
      }
    },
    async refreshJob(jobId) {
      const job = await input.store.getJob(jobId)
      if (!job) return { kind: 'skipped', reason: 'no_job' }
      if (!isJobRunnable(job)) return { kind: 'skipped', reason: 'not_runnable' }
      const widget = await input.store.getWidget(job.widgetId)
      if (inFlight.has(job.id) || widget?.status === 'running') {
        return { kind: 'already_running', runId: widget?.lastRunId }
      }
      return runExclusive(job)
    },
    async refreshBoard(boardId) {
      const queued: WidgetDataJobRecord[] = []
      for (const job of await jobsOnBoard(boardId)) {
        if (await isRunning(job)) continue
        queued.push(job)
      }
      return runPool(queued)
    },
    async refreshStaleOnOpen(boardId) {
      const nowMs = clock().getTime()
      const stale: WidgetDataJobRecord[] = []
      for (const job of await jobsOnBoard(boardId)) {
        await markOrphaned(job)
        if (await isRunning(job)) continue
        const widget = await input.store.getWidget(job.widgetId)
        if (widget && isWidgetDataStale(widget.latestDataAt, nowMs, staleMs)) {
          stale.push(job)
        }
      }
      return runPool(stale)
    },
    async reconcileOrphans(boardId) {
      const boards = boardId
        ? [await input.store.getBoard(boardId)].filter(Boolean)
        : [...(await input.store.listBoards())]
      for (const board of boards) {
        if (!board) continue
        for (const job of await jobsOnBoard(board.id)) {
          await markOrphaned(job)
        }
      }
    },
  }
}
