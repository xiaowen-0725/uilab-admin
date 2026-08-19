/**
 * Data-source evaluator — chrome / refresh-all / first-run / stale-on-open.
 * Four gates + failure semantics: ADR-0025. widget.status via recordRun is
 * the only loading source — UI must not keep its own.
 */

import { snapshotStorageKey } from '../model/data-source'
import {
  BOARD_REFRESH_CONCURRENCY,
  BOARD_REFRESH_STALE_MS,
  isWidgetDataStale,
  JOB_ORPHANED_RUN,
  JOB_RUNTIME_DISCONNECTED,
  mapJobRuntimeHint,
  parseJobResult,
} from '../model/refresh-policy'
import { authorizeDataSourceParameters } from '../model/source-authorization'
import {
  anonymousIdentitySnapshot,
} from '../model/widget-render-state'
import {
  isJobRunnable,
  type WidgetDataJobId,
  type WidgetDataJobRecord,
  type WidgetDataSourceRecord,
  type WidgetJobRunRecord,
  type WidgetJobRunStatus,
} from '../model/types'
import {
  evaluateWidgetDataSource,
  type BoardJobRuntimePort,
} from '../ports/board-job-runtime-port'
import type { BoardStorePort } from '../ports/board-store-port'
import type {
  IdentityInvalidationEvent,
  IdentityScopePort,
  IdentityScopeSnapshot,
} from '../ports/identity-scope-port'

export type RefreshMode = 'refresh' | 'first-run'

export type RefreshOutcome =
  | { kind: 'already_running'; runId?: string }
  | {
      kind: 'skipped'
      reason:
        | 'not_runnable'
        | 'no_job'
        | 'no_widget'
        | 'preset'
        | 'refresh_stopped'
    }
  | { kind: 'unavailable'; error: string; hint: string }
  | { kind: 'finished'; status: WidgetJobRunStatus; runId: string; hint?: string }
  | { kind: 'masked'; reason: 'needs_relogin' }
  | { kind: 'cleared'; reason: 'permission_revoked' }
  | { kind: 'rejected'; reason: 'stale_commit' }

export type BoardWriteClock = () => string

export interface EvaluationClaim {
  widgetId: string
  runtimeKey: string
  principalKey: string
  generation: number
  executionKey: string
  cancelled: boolean
}

export interface ExecuteJobRunInput {
  store: BoardStorePort
  runtime: BoardJobRuntimePort
  jobId: string
  widgetId: string
  mode?: RefreshMode
  nowIso?: BoardWriteClock
  onStatus?: () => void
  identityScope?: IdentityScopePort
  claims?: Map<string, EvaluationClaim>
  stoppedRefresh?: Set<string>
}

export interface BoardRefreshController {
  refreshJob(jobId: WidgetDataJobId): Promise<RefreshOutcome>
  refreshWidget(widgetId: string): Promise<RefreshOutcome>
  refreshBoard(boardId: string): Promise<RefreshOutcome[]>
  refreshStaleOnOpen(boardId: string): Promise<RefreshOutcome[]>
  reconcileOrphans(boardId?: string): Promise<void>
  isInFlight(jobId: WidgetDataJobId): boolean
  probe(): Promise<{ ok: true } | { ok: false; error: string; hint: string }>
  dispose(): void
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

function currentIdentity(scope?: IdentityScopePort): IdentityScopeSnapshot {
  return scope?.getSnapshot() ?? anonymousIdentitySnapshot()
}

function stopKey(widgetId: string, principalKey: string): string {
  return snapshotStorageKey(widgetId, principalKey)
}

function isClaimStale(
  claim: EvaluationClaim | undefined,
  live: IdentityScopeSnapshot,
): boolean {
  if (!claim || claim.cancelled || !live.valid) return true
  if (claim.principalKey !== live.principalKey) return true
  return claim.generation !== live.generation
}

function evaluationRuntimeKey(
  sourceKind: 'job' | 'query',
  jobId: string,
  source: WidgetDataSourceRecord | null,
): string {
  if (sourceKind === 'job') return jobId
  return source?.queryName ?? source?.id ?? jobId
}

function evaluationJobId(
  sourceKind: 'job' | 'query',
  jobId: string,
  source: WidgetDataSourceRecord | null,
): string {
  if (sourceKind === 'job') return jobId
  return source?.id ?? jobId
}

function isUnavailable(
  item: RefreshOutcome,
): item is Extract<RefreshOutcome, { kind: 'unavailable' }> {
  return item.kind === 'unavailable'
}

export function findUnavailable(
  outcomes: readonly RefreshOutcome[],
): Extract<RefreshOutcome, { kind: 'unavailable' }> | undefined {
  return outcomes.find(isUnavailable)
}

export async function executeJobRun(
  input: ExecuteJobRunInput,
): Promise<RefreshOutcome> {
  return evaluateBoundSource({
    ...input,
    sourceKind: 'job',
  })
}

async function evaluateBoundSource(
  input: ExecuteJobRunInput & { sourceKind: 'job' | 'query' },
): Promise<RefreshOutcome> {
  const nowIso = input.nowIso ?? defaultNowIso
  const identity = currentIdentity(input.identityScope)
  const principalKey = identity.principalKey
  const claims = input.claims ?? new Map<string, EvaluationClaim>()
  const stopped = input.stoppedRefresh ?? new Set<string>()
  const halted = stopKey(input.widgetId, principalKey)

  if (input.mode === 'first-run' && input.runtime.available === false) {
    return unavailable()
  }

  const widget = await input.store.getWidget(input.widgetId, { principalKey })
  if (!widget) return { kind: 'skipped', reason: 'no_widget' }

  const source =
    (await input.store.getDataSourceByWidgetId(input.widgetId)) ?? null
  if (source?.kind === 'preset') {
    return { kind: 'skipped', reason: 'preset' }
  }

  if (!identity.valid) {
    return { kind: 'masked', reason: 'needs_relogin' }
  }

  if (source) {
    const authorized = authorizeDataSourceParameters(
      source,
      identity.authorization,
    )
    if (!authorized.ok) {
      await input.store.deleteSnapshot(input.widgetId, principalKey)
      stopped.add(halted)
      input.onStatus?.()
      return { kind: 'cleared', reason: 'permission_revoked' }
    }
  }
  stopped.delete(halted)

  if (input.sourceKind === 'job') {
    const job = await input.store.getJob(input.jobId)
    if (!job || !isJobRunnable(job)) {
      return { kind: 'skipped', reason: job ? 'not_runnable' : 'no_job' }
    }
  }

  if (widget.status === 'running') {
    return { kind: 'already_running', runId: widget.lastRunId }
  }
  if (input.runtime.available === false) return unavailable()

  const runId = newId('run')
  const executionKey = newId('exec')
  const startedAt = nowIso()
  const runtimeKey = evaluationRuntimeKey(
    input.sourceKind,
    input.jobId,
    source,
  )
  const claim: EvaluationClaim = {
    widgetId: input.widgetId,
    runtimeKey,
    principalKey,
    generation: identity.generation,
    executionKey,
    cancelled: false,
  }
  claims.set(executionKey, claim)

  const runJobId = evaluationJobId(input.sourceKind, input.jobId, source)
  await input.store.recordRun(
    {
      id: runId,
      jobId: runJobId,
      widgetId: input.widgetId,
      startedAt,
      status: 'running',
    },
    undefined,
    {
      principalKey,
      executionKey,
      allowMissingJob: input.sourceKind === 'query',
    },
  )
  input.onStatus?.()

  const result =
    input.sourceKind === 'query'
      ? await evaluateWidgetDataSource(input.runtime, {
          kind: 'query',
          queryName: source?.queryName,
          queryParams: source?.parameters,
        })
      : await input.runtime.runJob(input.jobId)
  const finishedAt = nowIso()
  const live = currentIdentity(input.identityScope)
  const stale = isClaimStale(claims.get(executionKey), live)
  claims.delete(executionKey)

  async function settle(
    status: WidgetJobRunStatus,
    extra?: { data?: unknown; errorMessage?: string },
  ): Promise<RefreshOutcome> {
    const commitData = stale ? undefined : extra?.data
    const commitStatus = stale ? 'cancelled' : status
    await input.store.recordRun(
      {
        id: runId,
        jobId: runJobId,
        widgetId: input.widgetId,
        startedAt,
        finishedAt,
        status: commitStatus,
        errorMessage: stale ? undefined : extra?.errorMessage,
      },
      commitData,
      {
        principalKey,
        expectedGeneration: claim.generation,
        executionKey,
        allowMissingJob: input.sourceKind === 'query',
      },
    )
    input.onStatus?.()
    if (stale) return { kind: 'rejected', reason: 'stale_commit' }
    return { kind: 'finished', status, runId, hint: extra?.errorMessage }
  }

  if (!result.ok && result.error === 'already_running') {
    return { kind: 'already_running', runId }
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
  identityScope?: IdentityScopePort
  now?: () => Date
  onChange?: () => void
  concurrency?: number
  staleMs?: number
}): BoardRefreshController {
  const inFlight = new Set<string>()
  const claims = new Map<string, EvaluationClaim>()
  const stoppedRefresh = new Set<string>()
  const concurrency = input.concurrency ?? BOARD_REFRESH_CONCURRENCY
  const staleMs = input.staleMs ?? BOARD_REFRESH_STALE_MS

  function clock(): Date {
    return input.now ? input.now() : new Date()
  }

  function nowIso(): string {
    return clock().toISOString()
  }

  const unsubscribe = input.identityScope?.subscribeInvalidation((event) => {
    cancelStaleClaims(event.snapshot)
    void applyIdentityEvent(event)
  })

  function identity(): IdentityScopeSnapshot {
    return currentIdentity(input.identityScope)
  }

  function sharedEvaluateInput(): Pick<
    ExecuteJobRunInput,
    | 'store'
    | 'runtime'
    | 'nowIso'
    | 'onStatus'
    | 'identityScope'
    | 'claims'
    | 'stoppedRefresh'
  > {
    return {
      store: input.store,
      runtime: input.runtime,
      nowIso,
      onStatus: input.onChange,
      identityScope: input.identityScope,
      claims,
      stoppedRefresh,
    }
  }

  function cancelStaleClaims(snapshot: IdentityScopeSnapshot): void {
    for (const claim of claims.values()) {
      if (
        claim.principalKey !== snapshot.principalKey ||
        claim.generation !== snapshot.generation
      ) {
        claim.cancelled = true
        input.runtime.cancelJob?.(claim.runtimeKey)
      }
    }
  }

  async function applyIdentityEvent(
    event: IdentityInvalidationEvent,
  ): Promise<void> {
    const { reason, snapshot } = event
    await input.store.applyIdentityBarrier({
      principalKey: snapshot.principalKey,
      generation: snapshot.generation,
      deleteSnapshots: reason === 'signed_out',
    })
    if (reason === 'authorization_changed') {
      await clearUnauthorizedWidgets(snapshot)
    }
    if (reason === 'signed_in') {
      await restoreAuthorizedWidgets(snapshot)
    }
    input.onChange?.()
  }

  async function forEachWidgetSource(
    visit: (source: WidgetDataSourceRecord) => Promise<void>,
  ): Promise<void> {
    for (const board of await input.store.listBoards()) {
      for (const placement of board.placements) {
        const source = await input.store.getDataSourceByWidgetId(
          placement.widgetId,
        )
        if (source) await visit(source)
      }
    }
  }

  async function clearUnauthorizedWidgets(
    snapshot: IdentityScopeSnapshot,
  ): Promise<void> {
    await forEachWidgetSource(async (source) => {
      if (source.kind === 'preset') return
      if (authorizeDataSourceParameters(source, snapshot.authorization).ok) {
        return
      }
      await input.store.deleteSnapshot(source.widgetId, snapshot.principalKey)
      stoppedRefresh.add(stopKey(source.widgetId, snapshot.principalKey))
    })
  }

  async function restoreAuthorizedWidgets(
    snapshot: IdentityScopeSnapshot,
  ): Promise<void> {
    await forEachWidgetSource(async (source) => {
      if (!authorizeDataSourceParameters(source, snapshot.authorization).ok) {
        return
      }
      stoppedRefresh.delete(stopKey(source.widgetId, snapshot.principalKey))
    })
  }

  async function runExclusiveKey(
    key: string,
    run: () => Promise<RefreshOutcome>,
  ): Promise<RefreshOutcome> {
    if (inFlight.has(key)) return { kind: 'already_running' }
    inFlight.add(key)
    try {
      return await run()
    } finally {
      inFlight.delete(key)
    }
  }

  function runExclusive(job: WidgetDataJobRecord): Promise<RefreshOutcome> {
    return runExclusiveKey(job.id, () =>
      executeJobRun({
        ...sharedEvaluateInput(),
        jobId: job.id,
        widgetId: job.widgetId,
      }),
    )
  }

  function runQuery(source: WidgetDataSourceRecord): Promise<RefreshOutcome> {
    return runExclusiveKey(source.id, () =>
      evaluateBoundSource({
        ...sharedEvaluateInput(),
        jobId: source.id,
        widgetId: source.widgetId,
        sourceKind: 'query',
      }),
    )
  }

  async function runPool(
    work: Array<() => Promise<RefreshOutcome>>,
  ): Promise<RefreshOutcome[]> {
    const outcomes: RefreshOutcome[] = []
    let cursor = 0
    async function worker(): Promise<void> {
      while (cursor < work.length) {
        const index = cursor
        cursor += 1
        const task = work[index]
        if (!task) continue
        outcomes[index] = await task()
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, work.length) }, () => worker()),
    )
    return outcomes
  }

  async function collectOnBoard<T>(
    boardId: string,
    pick: (widgetId: string) => Promise<T | null | undefined>,
  ): Promise<T[]> {
    const board = await input.store.getBoard(boardId)
    if (!board) return []
    const items: T[] = []
    for (const placement of board.placements) {
      const item = await pick(placement.widgetId)
      if (item) items.push(item)
    }
    return items
  }

  function jobsOnBoard(boardId: string): Promise<WidgetDataJobRecord[]> {
    return collectOnBoard(boardId, async (widgetId) => {
      const job = await input.store.getJobByWidgetId(widgetId)
      if (!job || !isJobRunnable(job)) return null
      return job
    })
  }

  function querySourcesOnBoard(
    boardId: string,
  ): Promise<WidgetDataSourceRecord[]> {
    return collectOnBoard(boardId, async (widgetId) => {
      const source = await input.store.getDataSourceByWidgetId(widgetId)
      if (source?.kind !== 'query') return null
      return source
    })
  }

  function isRefreshStopped(widgetId: string): boolean {
    return stoppedRefresh.has(stopKey(widgetId, identity().principalKey))
  }

  async function isRunning(job: WidgetDataJobRecord): Promise<boolean> {
    if (inFlight.has(job.id)) return true
    const widget = await input.store.getWidget(job.widgetId, {
      principalKey: identity().principalKey,
    })
    return widget?.status === 'running'
  }

  async function markOrphaned(job: WidgetDataJobRecord): Promise<void> {
    const widget = await input.store.getWidget(job.widgetId, {
      principalKey: identity().principalKey,
    })
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
    await input.store.recordRun(run, undefined, {
      principalKey: identity().principalKey,
    })
    input.onChange?.()
  }

  return {
    isInFlight(jobId) {
      return inFlight.has(jobId)
    },
    dispose() {
      unsubscribe?.()
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
      const widget = await input.store.getWidget(job.widgetId, {
        principalKey: identity().principalKey,
      })
      if (inFlight.has(job.id) || widget?.status === 'running') {
        return { kind: 'already_running', runId: widget?.lastRunId }
      }
      return runExclusive(job)
    },
    async refreshWidget(widgetId) {
      const source = await input.store.getDataSourceByWidgetId(widgetId)
      if (source?.kind === 'preset') return { kind: 'skipped', reason: 'preset' }
      if (source?.kind === 'query') return runQuery(source)
      const job = await input.store.getJobByWidgetId(widgetId)
      if (!job) return { kind: 'skipped', reason: 'no_job' }
      return this.refreshJob(job.id)
    },
    async refreshBoard(boardId) {
      const work: Array<() => Promise<RefreshOutcome>> = []
      for (const job of await jobsOnBoard(boardId)) {
        if (isRefreshStopped(job.widgetId) || (await isRunning(job))) continue
        work.push(() => runExclusive(job))
      }
      for (const source of await querySourcesOnBoard(boardId)) {
        if (isRefreshStopped(source.widgetId) || inFlight.has(source.id)) continue
        work.push(() => runQuery(source))
      }
      return runPool(work)
    },
    async refreshStaleOnOpen(boardId) {
      const nowMs = clock().getTime()
      const work: Array<() => Promise<RefreshOutcome>> = []
      const principalKey = identity().principalKey
      for (const job of await jobsOnBoard(boardId)) {
        await markOrphaned(job)
        if (isRefreshStopped(job.widgetId) || (await isRunning(job))) continue
        const widget = await input.store.getWidget(job.widgetId, { principalKey })
        if (widget && isWidgetDataStale(widget.latestDataAt, nowMs, staleMs)) {
          work.push(() => runExclusive(job))
        }
      }
      for (const source of await querySourcesOnBoard(boardId)) {
        if (isRefreshStopped(source.widgetId) || inFlight.has(source.id)) continue
        const widget = await input.store.getWidget(source.widgetId, {
          principalKey,
        })
        if (widget && isWidgetDataStale(widget.latestDataAt, nowMs, staleMs)) {
          work.push(() => runQuery(source))
        }
      }
      return runPool(work)
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
