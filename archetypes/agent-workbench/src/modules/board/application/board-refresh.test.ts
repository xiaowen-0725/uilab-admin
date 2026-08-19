import { describe, expect, it, vi } from 'vitest'
import { createHttpBoardJobRuntime } from '../adapters/http-board-job-runtime'
import { createMemoryIdentityScope } from '@/modules/identity'
import {
  createControllableBoardJobRuntime,
  createMemoryBoardJobRuntime,
  createUnavailableBoardJobRuntime,
} from '../adapters/memory-board-job-runtime'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import {
  BOARD_REFRESH_CONCURRENCY,
  isWidgetDataStale,
  mapJobRuntimeHint,
  parseJobResult,
} from '../model/refresh-policy'
import { resolveWidgetRenderState } from '../model/widget-render-state'
import type {
  BoardRecord,
  BoardWidgetRecord,
  WidgetDataJobRecord,
  WidgetDataSourceRecord,
} from '../model/types'
import {
  createBoardRefreshController,
  executeJobRun,
} from './board-refresh'

const NOW = '2026-08-17T06:00:00.000Z'

function board(): BoardRecord {
  return {
    id: 'board-1',
    title: '刷新板',
    isExample: false,
    placements: [
      { mountId: 'm1', widgetId: 'w1', x: 0, y: 0, w: 4, h: 4 },
      { mountId: 'm2', widgetId: 'w2', x: 4, y: 0, w: 4, h: 4 },
      { mountId: 'm3', widgetId: 'w3', x: 8, y: 0, w: 4, h: 4 },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function widget(
  id: string,
  overrides: Partial<BoardWidgetRecord> = {},
): BoardWidgetRecord {
  return {
    id,
    title: id,
    html: '<html></html>',
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function job(id: string, widgetId: string): WidgetDataJobRecord {
  return {
    id,
    widgetId,
    title: `作业 ${id}`,
    description: '',
    enabled: true,
    trigger: { kind: 'manual' },
    approved: {
      code: 'export function run() { return {} }',
      codeHash: `hash-${id}`,
      allowedHosts: ['example.com'],
      approvedAt: NOW,
      approvedInTaskId: 'task-1',
    },
    createdAt: NOW,
    updatedAt: NOW,
  }
}

async function seedThreeJobs(store: ReturnType<typeof createMemoryBoardStore>) {
  await store.putBoard(board())
  for (const [index, id] of ['w1', 'w2', 'w3'].entries()) {
    await store.putWidget(widget(id, { latestData: { n: index }, latestDataAt: NOW }))
    await store.putJob(job(`j${index + 1}`, id))
  }
}

describe('parseJobResult', () => {
  it('rejects a non-JSON string and does not treat it as data', () => {
    expect(parseJobResult('not-json')).toMatchObject({
      ok: false,
      error: 'invalid_job_result',
    })
    expect(parseJobResult('{"quote":42}')).toEqual({
      ok: true,
      data: { quote: 42 },
    })
    expect(parseJobResult({ quote: 42 })).toEqual({
      ok: true,
      data: { quote: 42 },
    })
  })
})

describe('mapJobRuntimeHint', () => {
  it('maps deno_not_found to a readable install hint', () => {
    expect(mapJobRuntimeHint('deno_not_found')).toMatch(/未安装 Deno/)
    expect(
      mapJobRuntimeHint(
        'deno_not_found',
        '未安装 Deno，无法执行取数作业。请安装 Deno 后重试',
      ),
    ).toMatch(/未安装 Deno/)
  })

  it('maps a disconnected sidecar to 运行时未连接', () => {
    expect(mapJobRuntimeHint('runtime_unavailable')).toBe('运行时未连接')
    expect(
      mapJobRuntimeHint(
        'runtime_unavailable',
        '作业执行端点不可达，侧车未连接或网络错误',
      ),
    ).toBe('运行时未连接')
  })
})

describe('isWidgetDataStale', () => {
  it('treats a missing latestDataAt as stale', () => {
    expect(isWidgetDataStale(undefined, Date.parse(NOW))).toBe(true)
    expect(isWidgetDataStale(NOW, Date.parse(NOW))).toBe(false)
    expect(
      isWidgetDataStale(NOW, Date.parse(NOW) + 15 * 60 * 1000),
    ).toBe(true)
  })
})

describe('executeJobRun', () => {
  it('records error and keeps latestData when the job returns illegal JSON', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    await store.putWidget(widget('w1', { latestData: { quote: 1 }, latestDataAt: NOW }))
    await store.putJob(job('j1', 'w1'))

    const result = await executeJobRun({
      store,
      runtime: createMemoryBoardJobRuntime('not-json'),
      jobId: 'j1',
      widgetId: 'w1',
      nowIso: () => NOW,
    })

    expect(result.kind).toBe('finished')
    expect(await store.getWidget('w1')).toMatchObject({
      latestData: { quote: 1 },
      status: 'error',
    })
    expect((await store.listRuns('j1')).at(-1)).toMatchObject({
      status: 'error',
      errorMessage: expect.stringMatching(/合法 JSON/),
    })
  })

  it('skips first-run when the runtime is explicitly unavailable', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    await store.putWidget(widget('w1'))
    await store.putJob(job('j1', 'w1'))

    const result = await executeJobRun({
      store,
      runtime: createUnavailableBoardJobRuntime(),
      jobId: 'j1',
      widgetId: 'w1',
      mode: 'first-run',
      nowIso: () => NOW,
    })

    expect(result.kind).toBe('unavailable')
    expect(await store.listRuns('j1')).toEqual([])
    expect(await store.getWidget('w1')).toMatchObject({ status: 'idle' })
  })
})

describe('createBoardRefreshController', () => {
  it('does not start a second run while the same job is running', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    const runtime = createControllableBoardJobRuntime()
    const controller = createBoardRefreshController({
      store,
      runtime,
      now: () => new Date(NOW),
    })

    const first = controller.refreshJob('j1')
    await expect
      .poll(async () => (await store.getWidget('w1'))?.status)
      .toBe('running')

    const second = await controller.refreshJob('j1')
    expect(second.kind).toBe('already_running')
    expect(runtime.calls).toEqual(['j1'])

    runtime.complete('j1', { ok: true, payload: { quote: 9 } })
    await first
    expect(await store.getWidget('w1')).toMatchObject({
      latestData: { quote: 9 },
      status: 'idle',
    })
  })

  it('keeps old data when a run fails', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    const controller = createBoardRefreshController({
      store,
      runtime: {
        async runJob() {
          return { ok: false, error: 'runtime_unavailable', hint: 'boom' }
        },
      },
      now: () => new Date(NOW),
    })

    await controller.refreshJob('j1')
    expect(await store.getWidget('w1')).toMatchObject({
      latestData: { n: 0 },
      status: 'error',
    })
  })

  it('caps concurrent board refreshes at 2', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    const runtime = createControllableBoardJobRuntime()
    const controller = createBoardRefreshController({
      store,
      runtime,
      now: () => new Date(NOW),
    })

    const done = controller.refreshBoard('board-1')
    await expect.poll(() => runtime.active).toBe(BOARD_REFRESH_CONCURRENCY)
    expect(runtime.calls).toHaveLength(2)
    expect(runtime.maxActive).toBeLessThanOrEqual(2)

    runtime.complete(runtime.calls[0] ?? 'j1', { ok: true, payload: { n: 1 } })
    await expect.poll(() => runtime.calls.length).toBe(3)
    expect(runtime.maxActive).toBeLessThanOrEqual(2)

    runtime.completeAll({ ok: true, payload: { n: 1 } })
    await done
  })

  it('marks an orphaned running widget as error on open', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    await store.recordRun({
      id: 'run-orphan',
      jobId: 'j1',
      widgetId: 'w1',
      startedAt: NOW,
      status: 'running',
    })
    const runtime = createControllableBoardJobRuntime()
    const controller = createBoardRefreshController({
      store,
      runtime,
      now: () => new Date(NOW),
      staleMs: Number.POSITIVE_INFINITY,
    })

    await controller.refreshStaleOnOpen('board-1')
    expect(await store.getWidget('w1')).toMatchObject({ status: 'error' })
    expect(
      (await store.listRuns('j1')).find((run) => run.id === 'run-orphan'),
    ).toMatchObject({
      status: 'error',
      errorMessage: expect.stringMatching(/不可续/),
    })
    expect(runtime.calls).toEqual([])
  })

  it('refreshes stale jobs when opening a board', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    const runtime = createMemoryBoardJobRuntime({ fresh: true })
    const controller = createBoardRefreshController({
      store,
      runtime,
      now: () => new Date('2026-08-17T06:20:00.000Z'),
      staleMs: 15 * 60 * 1000,
    })

    await controller.refreshStaleOnOpen('board-1')
    expect(await store.getWidget('w1')).toMatchObject({
      latestData: { fresh: true },
      status: 'idle',
    })
  })

  it('does not overwrite a running record when the sidecar says already_running', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    const controller = createBoardRefreshController({
      store,
      runtime: {
        async runJob() {
          return {
            ok: false,
            error: 'already_running',
            hint: '该作业已在运行，请等待结束后再刷新',
          }
        },
      },
      now: () => new Date(NOW),
    })

    const result = await controller.refreshJob('j1')
    expect(result.kind).toBe('already_running')
    expect(await store.getWidget('w1')).toMatchObject({ status: 'running' })
    expect((await store.listRuns('j1')).at(-1)?.status).toBe('running')
  })

  it('returns 运行时未连接 when the sidecar is not available', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    const controller = createBoardRefreshController({
      store,
      runtime: createUnavailableBoardJobRuntime(),
      now: () => new Date(NOW),
    })

    const result = await controller.refreshJob('j1')
    expect(result).toMatchObject({
      kind: 'unavailable',
      hint: '运行时未连接',
    })
    expect(await store.getWidget('w1')).toMatchObject({
      latestData: { n: 0 },
      status: 'idle',
    })
  })
})

const SITE_READ = {
  type: 'site',
  id: 'site-1',
  name: 'North',
  permissions: ['read'],
}

function querySource(
  widgetId: string,
  overrides: Partial<WidgetDataSourceRecord> = {},
): WidgetDataSourceRecord {
  return {
    id: `source:${widgetId}`,
    widgetId,
    kind: 'query',
    trigger: { kind: 'manual' },
    referencableByJob: true,
    queryName: 'site_report',
    parameters: { siteIds: ['site-1'] },
    parameterSchema: {
      siteIds: { type: 'resource', resourceType: 'site' },
    },
    requiredPermissions: ['read'],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

async function seedAliceJob(
  store: ReturnType<typeof createMemoryBoardStore>,
) {
  await store.putBoard(board())
  await store.putWidget(
    widget('w1', { latestData: { n: 0 }, latestDataAt: NOW }),
    { principalKey: 'alice' },
  )
  await store.putJob(job('j1', 'w1'))
}

describe('data-source evaluator identity semantics', () => {
  it('keeps the snapshot on network, timeout, and cancel failures', async () => {
    const store = createMemoryBoardStore()
    await seedAliceJob(store)
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })

    for (const error of ['runtime_unavailable', 'timeout', 'cancelled'] as const) {
      const controller = createBoardRefreshController({
        store,
        runtime: {
          async runJob() {
            return { ok: false, error, hint: error }
          },
        },
        identityScope: scope,
        now: () => new Date(NOW),
      })
      await controller.refreshJob('j1')
      expect(
        await store.getWidget('w1', { principalKey: 'alice' }),
      ).toMatchObject({ latestData: { n: 0 } })
      controller.dispose()
    }
  })

  it('masks on session invalidation and restores the same snapshot after re-login', async () => {
    const store = createMemoryBoardStore()
    await seedAliceJob(store)
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const controller = createBoardRefreshController({
      store,
      runtime: createMemoryBoardJobRuntime({ n: 1 }),
      identityScope: scope,
      now: () => new Date(NOW),
    })

    scope.invalidateSession()
    const masked = await controller.refreshJob('j1')
    expect(masked).toEqual({ kind: 'masked', reason: 'needs_relogin' })
    expect(await store.getSnapshot('w1', 'alice')).toMatchObject({ data: { n: 0 } })
    expect(
      resolveWidgetRenderState({
        latestData: (await store.getWidget('w1', { principalKey: 'alice' }))
          ?.latestData,
        source: await store.getDataSourceByWidgetId('w1'),
        identity: scope.getSnapshot(),
      }),
    ).toMatchObject({ masked: true, chrome: 'needs_relogin', data: undefined })

    scope.signIn({ principalKey: 'alice', resources: [SITE_READ] })
    expect(
      resolveWidgetRenderState({
        latestData: (await store.getWidget('w1', { principalKey: 'alice' }))
          ?.latestData,
        source: await store.getDataSourceByWidgetId('w1'),
        identity: scope.getSnapshot(),
      }),
    ).toMatchObject({ masked: false, data: { n: 0 } })
    controller.dispose()
  })

  it('clears the snapshot and stops refresh when requiredPermissions are not met', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    await store.putWidget(
      widget('w1', { latestData: { revenue: 9 }, latestDataAt: NOW }),
      { principalKey: 'alice' },
    )
    await store.putDataSource(
      querySource('w1', { requiredPermissions: ['read', 'finance'] }),
    )
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const runtime = createMemoryBoardJobRuntime({ revenue: 10 })
    const controller = createBoardRefreshController({
      store,
      runtime,
      identityScope: scope,
      now: () => new Date(NOW),
    })

    expect(await controller.refreshWidget('w1')).toEqual({
      kind: 'cleared',
      reason: 'permission_revoked',
    })
    expect(await store.getSnapshot('w1', 'alice')).toBeNull()
    expect(await controller.refreshWidget('w1')).toEqual({
      kind: 'cleared',
      reason: 'permission_revoked',
    })
    await controller.refreshStaleOnOpen('board-1')
    expect(await store.getSnapshot('w1', 'alice')).toBeNull()
    controller.dispose()
  })

  it('lets the no-identity path keep public-job data after a network failure', async () => {
    const store = createMemoryBoardStore()
    await seedThreeJobs(store)
    const controller = createBoardRefreshController({
      store,
      runtime: {
        async runJob() {
          return { ok: false, error: 'timeout', hint: 'timeout' }
        },
      },
      now: () => new Date(NOW),
    })
    await controller.refreshJob('j1')
    expect(await store.getWidget('w1')).toMatchObject({
      latestData: { n: 0 },
      status: 'error',
    })
    controller.dispose()
  })

  it('discards a late success that finishes after sign-out', async () => {
    const store = createMemoryBoardStore()
    await seedAliceJob(store)
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const runtime = createControllableBoardJobRuntime()
    const controller = createBoardRefreshController({
      store,
      runtime,
      identityScope: scope,
      now: () => new Date(NOW),
    })

    const pending = controller.refreshJob('j1')
    await expect
      .poll(async () => (await store.getWidget('w1', { principalKey: 'alice' }))?.status)
      .toBe('running')

    scope.signOut()
    await expect.poll(async () => store.getSnapshot('w1', 'alice')).toBeNull()

    runtime.complete('j1', { ok: true, payload: { n: 99 } })
    expect(await pending).toEqual({ kind: 'rejected', reason: 'stale_commit' })
    expect(await store.getSnapshot('w1', 'alice')).toBeNull()
    expect(await store.getBoard('board-1')).toMatchObject({ id: 'board-1' })
    expect(await store.getWidget('w1')).toMatchObject({ id: 'w1' })
    controller.dispose()
  })

  it('rejects a late success that finishes after permission revoke', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    await store.putWidget(
      widget('w1', { latestData: { revenue: 9 }, latestDataAt: NOW }),
      { principalKey: 'alice' },
    )
    await store.putDataSource(querySource('w1'))
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const runtime = createControllableBoardJobRuntime()
    const controller = createBoardRefreshController({
      store,
      runtime,
      identityScope: scope,
      now: () => new Date(NOW),
    })

    const pending = controller.refreshWidget('w1')
    await expect.poll(() => runtime.calls).toContain('site_report')

    scope.setAuthorizedResources([])
    await expect.poll(async () => store.getSnapshot('w1', 'alice')).toBeNull()

    runtime.complete('site_report', { ok: true, payload: { revenue: 99 } })
    expect(await pending).toEqual({ kind: 'rejected', reason: 'stale_commit' })
    expect(await store.getSnapshot('w1', 'alice')).toBeNull()
    controller.dispose()
  })

  it('keeps per-identity snapshots isolated and deletes only the signed-out principal', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    await store.putWidget(
      widget('w1', { latestData: { owner: 'alice' }, latestDataAt: NOW }),
      { principalKey: 'alice' },
    )
    await store.putJob(job('j1', 'w1'))
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const controller = createBoardRefreshController({
      store,
      runtime: createMemoryBoardJobRuntime({ owner: 'bob' }),
      identityScope: scope,
      now: () => new Date(NOW),
    })

    scope.signIn({
      principalKey: 'bob',
      resources: [{ ...SITE_READ, id: 'site-2', name: 'South' }],
    })
    expect(
      (await store.getWidget('w1', { principalKey: 'bob' }))?.latestData,
    ).toBeUndefined()
    expect(await store.getSnapshot('w1', 'alice')).toMatchObject({
      data: { owner: 'alice' },
    })

    await controller.refreshJob('j1')
    expect(await store.getSnapshot('w1', 'bob')).toMatchObject({
      data: { owner: 'bob' },
    })
    expect(await store.getSnapshot('w1', 'alice')).toMatchObject({
      data: { owner: 'alice' },
    })

    scope.signIn({ principalKey: 'alice', resources: [SITE_READ] })
    expect(
      (await store.getWidget('w1', { principalKey: 'alice' }))?.latestData,
    ).toEqual({ owner: 'alice' })

    scope.signOut()
    await expect.poll(async () => store.getSnapshot('w1', 'alice')).toBeNull()
    expect(await store.getSnapshot('w1', 'bob')).toMatchObject({
      data: { owner: 'bob' },
    })
    expect(await store.getBoard('board-1')).toMatchObject({ title: '刷新板' })
    expect(await store.getWidget('w1')).toMatchObject({ id: 'w1' })
    controller.dispose()
  })

  it('does not mask or clear a preset source on logout', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard({ ...board(), isExample: true })
    await store.putWidget(
      widget('w1', { latestData: { value: 128 }, latestDataAt: NOW }),
    )
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const controller = createBoardRefreshController({
      store,
      runtime: createMemoryBoardJobRuntime({ value: 0 }),
      identityScope: scope,
      now: () => new Date(NOW),
    })

    expect(await store.getDataSourceByWidgetId('w1')).toMatchObject({
      kind: 'preset',
    })
    expect(await controller.refreshWidget('w1')).toEqual({
      kind: 'skipped',
      reason: 'preset',
    })
    scope.signOut()
    await expect
      .poll(async () => store.getSnapshot('w1', 'alice'))
      .toBeNull()
    expect(await store.getSnapshot('w1', 'anonymous')).toMatchObject({
      data: { value: 128 },
    })
    expect(
      resolveWidgetRenderState({
        latestData: (await store.getWidget('w1'))?.latestData,
        source: await store.getDataSourceByWidgetId('w1'),
        identity: scope.getSnapshot(),
      }),
    ).toMatchObject({ masked: false, data: { value: 128 } })
    controller.dispose()
  })

  it('writes a successful query payload into the identity snapshot', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    await store.putWidget(widget('w1'), { principalKey: 'alice' })
    await store.putDataSource(querySource('w1'))
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const controller = createBoardRefreshController({
      store,
      runtime: {
        async runJob() {
          return { ok: false, error: 'unused', hint: '' }
        },
        async evaluate(request) {
          expect(request).toMatchObject({
            kind: 'query',
            queryName: 'site_report',
            queryParams: { siteIds: ['site-1'] },
          })
          return { ok: true, payload: { occupancy: 0.42 } }
        },
      },
      identityScope: scope,
      now: () => new Date(NOW),
    })

    await expect(controller.refreshWidget('w1')).resolves.toMatchObject({
      kind: 'finished',
      status: 'success',
    })
    expect(await store.getSnapshot('w1', 'alice')).toMatchObject({
      data: { occupancy: 0.42 },
    })
    controller.dispose()
  })

  it('stores a sidecar query payload after HTTP evaluate', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    await store.putWidget(widget('w1'), { principalKey: 'alice' })
    await store.putDataSource(querySource('w1'))
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://sidecar/board/queries/site_report/run')
      expect(init?.body).toBe(JSON.stringify({ params: { siteIds: ['site-1'] } }))
      return new Response(
        JSON.stringify({ ok: true, payload: { occupancy: 0.42 } }),
        { status: 200 },
      )
    })
    const controller = createBoardRefreshController({
      store,
      runtime: createHttpBoardJobRuntime({
        baseUrl: 'http://sidecar',
        token: 'secret',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      identityScope: scope,
      now: () => new Date(NOW),
    })

    await expect(controller.refreshWidget('w1')).resolves.toMatchObject({
      kind: 'finished',
      status: 'success',
    })
    expect(await store.getSnapshot('w1', 'alice')).toMatchObject({
      data: { occupancy: 0.42 },
    })
    controller.dispose()
  })
})
