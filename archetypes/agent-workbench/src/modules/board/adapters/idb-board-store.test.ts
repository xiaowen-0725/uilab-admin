import { afterEach, describe, expect, it } from 'vitest'
import { deleteWorkbenchIdb, openWorkbenchIdb } from '@/app/persistence/workbench-idb'
import {
  createIdbBoardStore,
  type BoardPlacement,
  type BoardRecord,
  type BoardWidgetRecord,
  type WidgetDataJobRecord,
  type WidgetJobRunRecord,
} from '@/modules/board'

const NOW = '2026-08-16T00:00:00.000Z'

function uniqueDbName(suffix: string): string {
  return `test-board-store-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function board(overrides: Partial<BoardRecord> = {}): BoardRecord {
  return {
    id: 'board-1',
    title: '测试看板',
    isExample: false,
    placements: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function placement(overrides: Partial<BoardPlacement> = {}): BoardPlacement {
  return {
    mountId: 'mount-1',
    widgetId: 'widget-1',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    ...overrides,
  }
}

function widget(overrides: Partial<BoardWidgetRecord> = {}): BoardWidgetRecord {
  return {
    id: 'widget-1',
    title: '计数器',
    html: '<html></html>',
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function job(overrides: Partial<WidgetDataJobRecord> = {}): WidgetDataJobRecord {
  return {
    id: 'job-1',
    widgetId: 'widget-1',
    title: '取数',
    description: '拉取公开接口',
    enabled: true,
    trigger: { kind: 'manual' },
    approved: {
      code: 'export function run() { return {} }',
      codeHash: 'hash-approved',
      allowedHosts: ['example.com'],
      approvedAt: NOW,
      approvedInTaskId: 'task-1',
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function run(
  overrides: Partial<WidgetJobRunRecord> = {},
): WidgetJobRunRecord {
  return {
    id: 'run-1',
    jobId: 'job-1',
    widgetId: 'widget-1',
    startedAt: NOW,
    status: 'success',
    ...overrides,
  }
}

describe('IdbBoardStore', () => {
  const opened: string[] = []

  afterEach(async () => {
    for (const name of opened.splice(0)) {
      await deleteWorkbenchIdb(name)
    }
  })

  async function openStore() {
    const name = uniqueDbName('idb')
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    return { db, store: createIdbBoardStore(db) }
  }

  it('deleting a Board cascades its exclusive widget, job and runs', async () => {
    const { db, store } = await openStore()
    await store.putBoard(board({ placements: [placement()] }))
    await store.putWidget(
      widget({
        latestData: { ok: true },
        latestDataAt: NOW,
        lastRunId: 'run-old',
      }),
    )
    await store.putJob(job())
    await store.recordRun(run({ id: 'run-old', startedAt: '2026-08-15T00:00:00.000Z' }))
    await store.recordRun(run({ id: 'run-new', startedAt: NOW }))

    await store.deleteBoard('board-1')

    expect(await store.getBoard('board-1')).toBeNull()
    expect(await store.getWidget('widget-1')).toBeNull()
    expect(await store.getJob('job-1')).toBeNull()
    expect(await store.listRuns('job-1')).toEqual([])
    db.close()
  })

  it('deleting a job keeps the widget, its latestData, and resets status to idle', async () => {
    const { db, store } = await openStore()
    await store.putWidget(
      widget({
        status: 'running',
        latestData: { quote: 'still here' },
        latestDataAt: NOW,
        lastRunId: 'run-1',
      }),
    )
    await store.putJob(job())
    await store.recordRun(run({ status: 'running' }))

    await store.deleteJob('job-1')

    expect(await store.getJob('job-1')).toBeNull()
    expect(await store.listRuns('job-1')).toEqual([])
    expect(await store.getWidget('widget-1')).toMatchObject({
      id: 'widget-1',
      status: 'idle',
      latestData: { quote: 'still here' },
      latestDataAt: NOW,
    })
    db.close()
  })

  it('keeps only the 10 most recent runs when the 11th is written', async () => {
    const { db, store } = await openStore()
    await store.putWidget(widget())
    await store.putJob(job())

    for (let i = 1; i <= 11; i += 1) {
      const day = String(i).padStart(2, '0')
      await store.recordRun(
        run({
          id: `run-${i}`,
          startedAt: `2026-08-${day}T00:00:00.000Z`,
        }),
      )
    }

    const runs = await store.listRuns('job-1')
    expect(runs).toHaveLength(10)
    expect(runs.map((row) => row.id)).toEqual([
      'run-2',
      'run-3',
      'run-4',
      'run-5',
      'run-6',
      'run-7',
      'run-8',
      'run-9',
      'run-10',
      'run-11',
    ])
    db.close()
  })

  it('appends a placement without replacing existing ones', async () => {
    const { db, store } = await openStore()
    await store.putBoard(board({ placements: [placement()] }))
    await store.appendPlacement(
      'board-1',
      placement({ mountId: 'mount-2', widgetId: 'widget-2', x: 4 }),
    )
    expect(await store.getBoard('board-1')).toMatchObject({
      placements: [
        { mountId: 'mount-1', widgetId: 'widget-1' },
        { mountId: 'mount-2', widgetId: 'widget-2', x: 4 },
      ],
    })
    db.close()
  })

  it('refuses to record a run when the job has no approved snapshot', async () => {
    const { db, store } = await openStore()
    await store.putWidget(widget())
    await store.putJob(job({ approved: undefined }))

    await expect(store.recordRun(run())).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(await store.listRuns('job-1')).toEqual([])
    db.close()
  })

  it('does not write latestData unless the run succeeded', async () => {
    const { db, store } = await openStore()
    await store.putWidget(
      widget({ latestData: { quote: 'kept' }, latestDataAt: NOW }),
    )
    await store.putJob(job())

    await store.recordRun(run({ id: 'run-fail', status: 'error' }), {
      quote: 'should-not-land',
    })

    expect(await store.getWidget('widget-1')).toMatchObject({
      latestData: { quote: 'kept' },
      lastRunId: 'run-fail',
      status: 'error',
    })

    await store.recordRun(run({ id: 'run-ok', status: 'success' }), {
      quote: 'fresh',
    })
    expect(await store.getWidget('widget-1')).toMatchObject({
      latestData: { quote: 'fresh' },
      lastRunId: 'run-ok',
      status: 'idle',
    })
    db.close()
  })
})
