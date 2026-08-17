import { describe, expect, it } from 'vitest'
import { createMemoryBoardContent } from '../adapters/memory-board-content'
import {
  createMemoryBoardJobRuntime,
  createUnavailableBoardJobRuntime,
} from '../adapters/memory-board-job-runtime'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import { hashBoardContent } from '../model/content-hash'
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
