import { describe, expect, it } from 'vitest'
import { validateWidgetSource } from '../../../../../../tooling/workbench-runtime-voltagent/src/tools/board-validation.ts'
import { resolveCapabilityFeatureIds } from './board-capability'
import { createBoardClientToolExecutor } from './board-client-tools'
import { createMemoryBoardContent } from '../adapters/memory-board-content'
import {
  createMemoryBoardJobRuntime,
  createUnavailableBoardJobRuntime,
} from '../adapters/memory-board-job-runtime'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import { createMemoryIdentityScope } from '@/modules/identity'
import { hashBoardContent } from '../model/content-hash'
import { createBoardRefreshController } from './board-refresh'
import type { BoardQueryCatalogEntry } from '../ports/board-query-catalog-port'
import { BOARD_WIDGET_LIMIT, type BoardRecord, type BoardWidgetRecord } from '../model/types'
import {
  commitBoardDraft,
  readBoardStatus,
  runCommittedJob,
} from './board-write-channel'

const NOW = '2026-08-17T04:00:00.000Z'
const WIDGET_HTML =
  '<!doctype html><html><body><div id="root"></div><script>widget.ready()</script></body></html>'
const JOB_CODE = 'export async function run(ctx) { return { quote: 42 } }\n'

function board(overrides: Partial<BoardRecord> = {}): BoardRecord {
  return {
    id: 'board-1',
    title: '已有板',
    isExample: false,
    placements: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function filledWidget(index: number): BoardWidgetRecord {
  return {
    id: `w-${index}`,
    title: `已有 ${index}`,
    html: '<html></html>',
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

async function seedReadyDrafts(content: ReturnType<typeof createMemoryBoardContent>) {
  const contentHash = await hashBoardContent(WIDGET_HTML)
  const codeHash = await hashBoardContent(JOB_CODE)
  content.seed({
    draftId: 'b-widget',
    kind: 'widget',
    status: 'ready',
    title: '汇率',
    widgetId: 'w-new',
    content: WIDGET_HTML,
    hash: contentHash,
    bytes: WIDGET_HTML.length,
    contentHash,
  })
  content.seed({
    draftId: 'b-job',
    kind: 'job',
    status: 'ready',
    title: '拉汇率',
    description: '公开接口',
    widgetId: 'w-new',
    jobId: 'j-new',
    content: JOB_CODE,
    hash: codeHash,
    bytes: JOB_CODE.length,
    contentHash: codeHash,
    allowedHosts: ['api.example.com'],
  })
  return { contentHash, codeHash }
}

describe('board agent recipe', () => {
  it('walks status to commit and leaves a renderable widget', async () => {
    const store = createMemoryBoardStore()
    const content = createMemoryBoardContent()
    const html = [
      '<!doctype html><html><body>',
      '<div id="root"></div>',
      '<script>widget.onDataChange(function () {});widget.ready();</script>',
      '</body></html>',
    ].join('')
    const contentHash = await hashBoardContent(html)
    content.seed({
      draftId: 'b-recipe',
      kind: 'widget',
      status: 'ready',
      title: '汇率',
      widgetId: 'w-recipe',
      content: html,
      hash: contentHash,
      bytes: html.length,
      contentHash,
    })

    const exec = createBoardClientToolExecutor({ store, content })
    const status = await exec({
      toolName: 'board_status',
      args: {},
      taskId: 'task-recipe',
      turnId: 'turn-recipe',
    })
    expect(status).toMatchObject({ ok: true, boards: [], committed: [] })

    const committed = await exec({
      toolName: 'board_commit',
      args: {
        newBoardTitle: '汇率板',
        widgetId: 'w-recipe',
        draftId: 'b-recipe',
        contentHash,
      },
      taskId: 'task-recipe',
      turnId: 'turn-recipe',
    })
    expect(committed).toMatchObject({ ok: true, widgetId: 'w-recipe' })
    if (!isBoardCommitOk(committed)) throw new Error('commit failed')
    const { boardId } = committed

    const widget = await store.getWidget('w-recipe')
    expect(widget?.html).toBe(html)
    expect(validateWidgetSource(widget?.html ?? '')).toEqual({ ok: true })
    const next = await readBoardStatus(store, content, { boardId })
    expect(next).toMatchObject({
      ok: true,
      targetExists: true,
      committed: [{ widgetId: 'w-recipe', boardId }],
    })
    expect(await resolveCapabilityFeatureIds(store, 'task-recipe')).toEqual([
      'board',
    ])
  })
})

describe('commitBoardDraft', () => {
  it('returns a scalar result without HTML or job source', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash, codeHash } = await seedReadyDrafts(content)

    const result = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        jobId: 'j-new',
        jobDraftId: 'b-job',
        codeHash,
        taskId: 'task-1',
      },
      () => NOW,
    )

    expect(result).toMatchObject({
      ok: true,
      boardId: 'board-1',
      widgetId: 'w-new',
    })
    expect(JSON.stringify(result)).not.toContain(WIDGET_HTML)
    expect(JSON.stringify(result)).not.toContain(JOB_CODE)
    expect(JSON.stringify(result)).not.toMatch(/<html|export async function run/)

    const job = await store.getJob('j-new')
    expect(job?.pendingChange).toBeUndefined()
    expect(job?.approved).toMatchObject({
      codeHash,
      approvedInTaskId: 'task-1',
      allowedHosts: ['api.example.com'],
    })
    expect(job?.approved?.code).toBe(JOB_CODE)
  })

  it('returns unknown_build when the draft has expired', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash } = await seedReadyDrafts(content)
    content.expire('b-widget')

    const result = await commitBoardDraft(store, content, {
      boardId: 'board-1',
      widgetId: 'w-new',
      draftId: 'b-widget',
      contentHash,
    })

    expect(result).toEqual({
      ok: false,
      error: 'unknown_build',
      hint: '草稿已过期或不存在，请重新 begin / finish',
    })
    expect(await store.getWidget('w-new')).toBeNull()
  })

  it('rejects the 21st widget on the target board', async () => {
    const store = createMemoryBoardStore()
    const placements = Array.from({ length: BOARD_WIDGET_LIMIT }, (_, index) => ({
      mountId: `m-${index + 1}`,
      widgetId: `w-${index + 1}`,
      x: 0,
      y: index * 4,
      w: 4,
      h: 4,
    }))
    await store.putBoard(board({ placements }))
    for (let i = 1; i <= BOARD_WIDGET_LIMIT; i += 1) {
      await store.putWidget(filledWidget(i))
    }
    const content = createMemoryBoardContent()
    const { contentHash } = await seedReadyDrafts(content)

    const result = await commitBoardDraft(store, content, {
      boardId: 'board-1',
      widgetId: 'w-new',
      draftId: 'b-widget',
      contentHash,
    })

    expect(result).toMatchObject({
      ok: false,
      error: 'widget_limit_reached',
    })
    expect(await store.getWidget('w-new')).toBeNull()
    expect((await store.getBoard('board-1'))?.placements).toHaveLength(20)
    expect(await content.listDrafts()).toEqual(
      expect.arrayContaining([expect.objectContaining({ draftId: 'b-widget' })]),
    )
  })

  it('returns unknown_board when the target board is missing', async () => {
    const store = createMemoryBoardStore()
    const content = createMemoryBoardContent()
    const { contentHash } = await seedReadyDrafts(content)

    const result = await commitBoardDraft(store, content, {
      boardId: 'missing',
      widgetId: 'w-new',
      draftId: 'b-widget',
      contentHash,
    })

    expect(result).toMatchObject({ ok: false, error: 'unknown_board' })
    expect(await content.listDrafts()).toEqual(
      expect.arrayContaining([expect.objectContaining({ draftId: 'b-widget' })]),
    )
  })

  it('is a no-op for the same widget and hashes and does not consume a re-seeded draft', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash, codeHash } = await seedReadyDrafts(content)
    const first = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        jobId: 'j-new',
        jobDraftId: 'b-job',
        codeHash,
      },
      () => NOW,
    )
    expect(first.ok).toBe(true)
    if (first.ok) expect(first.replayed).toBeUndefined()
    const mountId = first.ok ? first.mountId : ''

    await seedReadyDrafts(content)
    const second = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        jobId: 'j-new',
        jobDraftId: 'b-job',
        codeHash,
      },
      () => NOW,
    )
    expect(second).toMatchObject({
      ok: true,
      boardId: 'board-1',
      widgetId: 'w-new',
      mountId,
      replayed: true,
    })
    expect(await content.listDrafts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ draftId: 'b-widget' }),
        expect.objectContaining({ draftId: 'b-job' }),
      ]),
    )
  })

  it('appends a placement onto the live board instead of replacing the array', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(
      board({
        placements: [{ mountId: 'm-user', widgetId: 'w-1', x: 0, y: 0, w: 4, h: 4 }],
      }),
    )
    await store.putWidget(filledWidget(1))
    const content = createMemoryBoardContent()
    const { contentHash } = await seedReadyDrafts(content)

    const result = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
      },
      () => NOW,
    )
    expect(result.ok).toBe(true)
    const placements = (await store.getBoard('board-1'))?.placements ?? []
    expect(placements.map((item) => item.widgetId)).toEqual(['w-1', 'w-new'])
  })
})

const QUERY_CATALOG: BoardQueryCatalogEntry[] = [
  {
    name: 'site_summary',
    title: '站点摘要',
    parameters: { siteIds: { type: 'resource', resourceType: 'site' } },
    requiredPermissions: ['read'],
    referencableByJob: true,
  },
  {
    name: 'site_finance',
    title: '站点财务',
    parameters: { siteIds: { type: 'resource', resourceType: 'site' } },
    requiredPermissions: ['read', 'finance'],
    referencableByJob: true,
  },
]

function queryCatalogPort(entries = QUERY_CATALOG) {
  return { listQueries: async () => entries }
}

describe('readBoardStatus', () => {
  it('reports board quota and whether the target exists', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(
      board({
        placements: [{ mountId: 'm-1', widgetId: 'w-1', x: 0, y: 0, w: 4, h: 4 }],
      }),
    )
    await store.putWidget(filledWidget(1))
    const content = createMemoryBoardContent()
    content.seed({
      draftId: 'open-1',
      kind: 'widget',
      status: 'open',
      title: '半成品',
      widgetId: 'w-draft',
      content: 'partial',
      hash: 'x',
      bytes: 7,
    })

    const result = await readBoardStatus(store, content, { boardId: 'board-1' })
    expect(result.ok).toBe(true)
    expect(result.targetExists).toBe(true)
    expect(result.boards[0]).toMatchObject({
      id: 'board-1',
      widgetCount: 1,
      remaining: 19,
    })
    expect(result.committed[0]?.widgetId).toBe('w-1')
    expect(result.staging).toEqual([
      expect.objectContaining({ draftId: 'open-1', title: '半成品' }),
    ])
    expect(JSON.stringify(result)).not.toContain('partial')
    expect(result.queries).toEqual([])
    expect(result.identity).toEqual({
      kind: 'unrestricted',
      valid: true,
      resources: [],
    })
  })

  it('returns the query catalog and identity resources without endpoints', async () => {
    const store = createMemoryBoardStore()
    const content = createMemoryBoardContent()
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [
        { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
        {
          type: 'site',
          id: 'site-2',
          name: 'South',
          permissions: ['read', 'finance'],
        },
      ],
    })
    const result = await readBoardStatus(
      store,
      content,
      {},
      { queries: QUERY_CATALOG, identity: scope.getSnapshot() },
    )
    expect(result.queries).toEqual(QUERY_CATALOG)
    expect(result.identity).toEqual({
      kind: 'resources',
      valid: true,
      resources: [
        { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
        {
          type: 'site',
          id: 'site-2',
          name: 'South',
          permissions: ['read', 'finance'],
        },
      ],
    })
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\//)
    const finance = result.queries.find((query) => query.name === 'site_finance')
    expect(finance?.requiredPermissions).toEqual(['read', 'finance'])
  })
})

describe('commitBoardDraft query binding', () => {
  const extras = {
    queries: QUERY_CATALOG,
    identity: createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [
        { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
      ],
    }).getSnapshot(),
  }

  it('commits a query source and first-runs data onto the widget', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash } = await seedReadyDrafts(content)
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: extras.identity.authorization.kind === 'resources'
        ? [...extras.identity.authorization.resources]
        : [],
    })
    const refresh = createBoardRefreshController({
      store,
      runtime: createMemoryBoardJobRuntime({ occupancy: 0.42 }),
      identityScope: scope,
    })
    const exec = createBoardClientToolExecutor({
      store,
      content,
      queryCatalog: queryCatalogPort(),
      identityScope: scope,
      effects: { refresh },
    })

    const status = await exec({
      toolName: 'board_status',
      args: {},
      taskId: 'task-query',
      turnId: 'turn-query',
    })
    expect(status).toMatchObject({
      ok: true,
      queries: QUERY_CATALOG,
    })

    const committed = await exec({
      toolName: 'board_commit',
      args: {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        queryName: 'site_summary',
        queryParams: { siteIds: ['site-1'] },
      },
      taskId: 'task-query',
      turnId: 'turn-query',
    })
    expect(committed).toMatchObject({
      ok: true,
      widgetId: 'w-new',
      queryName: 'site_summary',
    })
    expect(await store.getDataSourceByWidgetId('w-new')).toMatchObject({
      kind: 'query',
      queryName: 'site_summary',
      requiredPermissions: ['read'],
    })
    expect(await store.getWidget('w-new', { principalKey: 'alice' })).toMatchObject({
      latestData: { occupancy: 0.42 },
    })
  })

  it('rejects unknown metrics, extra params, unauthorized resources, and missing permissions', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash } = await seedReadyDrafts(content)
    const cases = [
      {
        queryName: 'made_up',
        queryParams: { siteIds: ['site-1'] },
        error: 'unknown_query',
      },
      {
        queryName: 'site_summary',
        queryParams: { siteIds: ['site-1'], extra: 1 },
        error: 'validation_failed',
      },
      {
        queryName: 'site_summary',
        queryParams: { siteIds: ['site-9'] },
        error: 'resource_not_authorized',
      },
      {
        queryName: 'site_finance',
        queryParams: { siteIds: ['site-1'] },
        error: 'permission_denied',
      },
    ]
    for (const item of cases) {
      await seedReadyDrafts(content)
      const result = await commitBoardDraft(
        store,
        content,
        {
          boardId: 'board-1',
          widgetId: 'w-new',
          draftId: 'b-widget',
          contentHash,
          queryName: item.queryName,
          queryParams: item.queryParams,
        },
        () => NOW,
        extras,
      )
      expect(result).toMatchObject({ ok: false, error: item.error })
    }
    expect(await store.getWidget('w-new')).toBeNull()
  })

  it('rejects mixing a job and a query on the same commit', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash, codeHash } = await seedReadyDrafts(content)
    const result = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        jobId: 'j-new',
        jobDraftId: 'b-job',
        codeHash,
        queryName: 'site_summary',
        queryParams: { siteIds: ['site-1'] },
      },
      () => NOW,
      extras,
    )
    expect(result).toMatchObject({ ok: false, error: 'validation_failed' })
  })

  it('replaces an existing job source so the widget stays 1:1', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash, codeHash } = await seedReadyDrafts(content)
    const jobbed = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        jobId: 'j-new',
        jobDraftId: 'b-job',
        codeHash,
      },
      () => NOW,
    )
    expect(jobbed.ok).toBe(true)
    await seedReadyDrafts(content)
    const result = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        queryName: 'site_summary',
        queryParams: { siteIds: ['site-1'] },
      },
      () => NOW,
      extras,
    )
    expect(result).toMatchObject({ ok: true, queryName: 'site_summary' })
    expect(await store.getJob('j-new')).toBeNull()
    expect(await store.getDataSourceByWidgetId('w-new')).toMatchObject({
      kind: 'query',
      queryName: 'site_summary',
    })
    const status = await readBoardStatus(store, content, { boardId: 'board-1' })
    expect(status.committed[0]?.jobId).toBeUndefined()
    expect(status.committed[0]?.queryName).toBe('site_summary')
    expect(status.committed[0]?.queryParams).toEqual({ siteIds: ['site-1'] })
  })

  it('updates query params on an installed widget without a new draft', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(
      board({
        placements: [{ mountId: 'm-1', widgetId: 'w-1', x: 0, y: 0, w: 6, h: 4 }],
      }),
    )
    await store.putWidget({ ...filledWidget(1), html: WIDGET_HTML })
    await store.putDataSource({
      id: 'source:w-1',
      widgetId: 'w-1',
      kind: 'query',
      trigger: { kind: 'onOpen' },
      referencableByJob: true,
      queryName: 'site_summary',
      parameters: {},
      parameterSchema: {
        siteIds: { type: 'resource', resourceType: 'site' },
      },
      requiredPermissions: ['read'],
      createdAt: NOW,
      updatedAt: NOW,
    })
    const content = createMemoryBoardContent()
    const contentHash = await hashBoardContent(WIDGET_HTML)
    const status = await readBoardStatus(store, content, { boardId: 'board-1' })
    expect(status.committed[0]).toMatchObject({
      widgetId: 'w-1',
      queryName: 'site_summary',
      queryParams: {},
      contentHash,
    })

    const result = await commitBoardDraft(
      store,
      content,
      {
        widgetId: 'w-1',
        contentHash,
        queryName: 'site_summary',
        queryParams: { siteIds: ['site-1'] },
      },
      () => NOW,
      extras,
    )
    expect(result).toMatchObject({
      ok: true,
      widgetId: 'w-1',
      queryName: 'site_summary',
    })
    expect((result as { replayed?: true }).replayed).toBeUndefined()
    expect(await store.getDataSourceByWidgetId('w-1')).toMatchObject({
      kind: 'query',
      queryName: 'site_summary',
      parameters: { siteIds: ['site-1'] },
    })
  })

  it('leaves the job recipe unchanged when no query is bound', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash, codeHash } = await seedReadyDrafts(content)
    const result = await commitBoardDraft(
      store,
      content,
      {
        boardId: 'board-1',
        widgetId: 'w-new',
        draftId: 'b-widget',
        contentHash,
        jobId: 'j-new',
        jobDraftId: 'b-job',
        codeHash,
      },
      () => NOW,
      extras,
    )
    expect(result).toMatchObject({ ok: true, widgetId: 'w-new', jobId: 'j-new' })
    expect((result as { queryName?: string }).queryName).toBeUndefined()
    expect(await store.getJob('j-new')).toMatchObject({ widgetId: 'w-new' })
  })
})

describe('runCommittedJob', () => {
  it('writes latestData from the first run', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash, codeHash } = await seedReadyDrafts(content)
    const committed = await commitBoardDraft(store, content, {
      boardId: 'board-1',
      widgetId: 'w-new',
      draftId: 'b-widget',
      contentHash,
      jobId: 'j-new',
      jobDraftId: 'b-job',
      codeHash,
    })
    expect(committed.ok).toBe(true)

    await runCommittedJob(
      store,
      createMemoryBoardJobRuntime({ quote: 42 }),
      { jobId: 'j-new', widgetId: 'w-new' },
      () => NOW,
    )

    expect(await store.getWidget('w-new')).toMatchObject({
      latestData: { quote: 42 },
      status: 'idle',
    })
  })

  it('does not record a run when the job runtime is not available', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board())
    const content = createMemoryBoardContent()
    const { contentHash, codeHash } = await seedReadyDrafts(content)
    const committed = await commitBoardDraft(store, content, {
      boardId: 'board-1',
      widgetId: 'w-new',
      draftId: 'b-widget',
      contentHash,
      jobId: 'j-new',
      jobDraftId: 'b-job',
      codeHash,
    })
    expect(committed.ok).toBe(true)

    await runCommittedJob(
      store,
      createUnavailableBoardJobRuntime(),
      { jobId: 'j-new', widgetId: 'w-new' },
      () => NOW,
    )

    expect(await store.listRuns('j-new')).toEqual([])
    expect(await store.getWidget('w-new')).toMatchObject({ status: 'idle' })
  })
})

function isBoardCommitOk(
  value: unknown,
): value is { ok: true; boardId: string; widgetId: string } {
  if (value == null || typeof value !== 'object') return false
  const rec = value as { ok?: unknown; boardId?: unknown }
  return rec.ok === true && typeof rec.boardId === 'string'
}
