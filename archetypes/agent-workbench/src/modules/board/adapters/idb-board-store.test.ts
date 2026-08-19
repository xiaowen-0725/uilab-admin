import { afterEach, describe, expect, it } from 'vitest'
import {
  STORE_BOARDS,
  STORE_BOARD_WIDGETS,
  STORE_COMMANDS,
  STORE_EVENTS,
  STORE_METADATA,
  STORE_PROJECTS,
  STORE_SESSION,
  STORE_SNAPSHOTS,
  STORE_TASKS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
  deleteWorkbenchIdb,
  openWorkbenchIdb,
} from '@/app/persistence/workbench-idb'
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

function createV3Stores(db: IDBDatabase): void {
  db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
  db.createObjectStore(STORE_TASKS, { keyPath: 'id' }).createIndex(
    'projectId',
    'projectId',
    { unique: false },
  )
  const events = db.createObjectStore(STORE_EVENTS, {
    keyPath: ['taskId', 'taskSequence'],
  })
  events.createIndex('eventId', 'eventId', { unique: true })
  events.createIndex('taskId', 'taskId', { unique: false })
  db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'taskId' })
  db.createObjectStore(STORE_COMMANDS, { keyPath: 'commandId' })
  db.createObjectStore(STORE_SESSION, { keyPath: 'id' })
  db.createObjectStore(STORE_METADATA, { keyPath: 'key' })
  db.createObjectStore(STORE_BOARDS, { keyPath: 'id' })
  db.createObjectStore(STORE_BOARD_WIDGETS, { keyPath: 'id' })
  db.createObjectStore(STORE_WIDGET_DATA_JOBS, { keyPath: 'id' }).createIndex(
    'widgetId',
    'widgetId',
    { unique: true },
  )
  db.createObjectStore(STORE_WIDGET_JOB_RUNS, { keyPath: 'id' }).createIndex(
    'jobId',
    'jobId',
    { unique: false },
  )
}

function openV3Database(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 3)
    request.onupgradeneeded = () => createV3Stores(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
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

  it('rolls back boards and widgets when the job write fails in the same transaction', async () => {
    const name = uniqueDbName('atomic')
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    const store = createIdbBoardStore(db, { failOnPutStore: 'widgetDataJobs' })

    await expect(
      store.commitAtomically({
        board: board({ placements: [placement()] }),
        widget: widget(),
        job: job(),
      }),
    ).rejects.toThrow(/injected widgetDataJobs write failure/)

    const clean = createIdbBoardStore(db)
    expect(await clean.getBoard('board-1')).toBeNull()
    expect(await clean.getWidget('widget-1')).toBeNull()
    expect(await clean.getJob('job-1')).toBeNull()
    db.close()
  })

  it('appends a placement onto the live board row', async () => {
    const name = uniqueDbName('append')
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    const store = createIdbBoardStore(db)
    const userPlacement = placement({
      mountId: 'mount-user',
      widgetId: 'widget-user',
      y: 4,
    })
    await store.putBoard(board({ placements: [userPlacement] }))

    await store.commitAtomically({
      board: board({
        placements: [placement()],
        updatedAt: '2026-08-17T00:00:00.000Z',
      }),
      widget: widget(),
      appendPlacement: placement(),
    })

    expect((await store.getBoard('board-1'))?.placements).toEqual([
      userPlacement,
      placement(),
    ])
    db.close()
  })

  it('migrates leftover latestData into the anonymous snapshot and keeps rendering it', async () => {
    const name = uniqueDbName('legacy-latest')
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('boardWidgets', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('boardWidgets').put(
        widget({ latestData: { quote: 7 }, latestDataAt: NOW }),
      )
    })

    const store = createIdbBoardStore(db)
    expect(await store.getWidget('widget-1')).toMatchObject({
      latestData: { quote: 7 },
      latestDataAt: NOW,
    })
    expect(await store.getWidget('widget-1', { principalKey: 'alice' })).toMatchObject({
      id: 'widget-1',
    })
    expect(
      (await store.getWidget('widget-1', { principalKey: 'alice' }))?.latestData,
    ).toBeUndefined()
    expect(await store.getSnapshot('widget-1', 'anonymous')).toMatchObject({
      data: { quote: 7 },
      capturedAt: NOW,
    })
    expect(await store.getDataSourceByWidgetId('widget-1')).toMatchObject({
      kind: 'preset',
      widgetId: 'widget-1',
    })
    db.close()
  })

  it('upgrades a v3 leftover latestData row into the anonymous snapshot', async () => {
    const name = uniqueDbName('v3-upgrade')
    opened.push(name)
    const v3 = await openV3Database(name)
    await new Promise<void>((resolve, reject) => {
      const tx = v3.transaction(STORE_BOARD_WIDGETS, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE_BOARD_WIDGETS).put(
        widget({ latestData: { quote: 7 }, latestDataAt: NOW }),
      )
    })
    v3.close()

    const db = await openWorkbenchIdb({ name })
    const store = createIdbBoardStore(db)
    expect(await store.getWidget('widget-1')).toMatchObject({
      latestData: { quote: 7 },
    })
    expect(await store.getSnapshot('widget-1', 'anonymous')).toMatchObject({
      data: { quote: 7 },
    })
    db.close()
  })

  it('replaces a leftover preset source when a job is written', async () => {
    const { db, store } = await openStore()
    await store.putWidget(widget({ latestData: { quote: 1 }, latestDataAt: NOW }))
    expect(await store.getDataSourceByWidgetId('widget-1')).toMatchObject({
      kind: 'preset',
    })
    await store.putJob(job())
    expect(await store.getDataSourceByWidgetId('widget-1')).toMatchObject({
      kind: 'job',
      jobId: 'job-1',
    })
    expect(await store.getWidget('widget-1')).toMatchObject({
      latestData: { quote: 1 },
    })
    db.close()
  })

  it('keeps two principal snapshots from overwriting each other and cascades them on delete', async () => {
    const { db, store } = await openStore()
    await store.putWidget(widget())
    await store.putSnapshot({
      widgetId: 'widget-1',
      principalKey: 'alice',
      data: { n: 1 },
      capturedAt: NOW,
    })
    await store.putSnapshot({
      widgetId: 'widget-1',
      principalKey: 'bob',
      data: { n: 2 },
      capturedAt: NOW,
    })

    expect(await store.getWidget('widget-1', { principalKey: 'alice' })).toMatchObject({
      latestData: { n: 1 },
    })
    expect(await store.getWidget('widget-1', { principalKey: 'bob' })).toMatchObject({
      latestData: { n: 2 },
    })
    expect(await store.getWidget('widget-1')).toMatchObject({
      id: 'widget-1',
    })
    expect((await store.getWidget('widget-1'))?.latestData).toBeUndefined()

    await store.deleteWidget('widget-1')
    expect(await store.getWidget('widget-1')).toBeNull()
    expect(await store.listSnapshots('widget-1')).toEqual([])
    db.close()
  })

  it('rejects a late success after the identity barrier deletes the snapshot', async () => {
    const { db, store } = await openStore()
    await store.putWidget(widget())
    await store.putJob(job())
    await store.putSnapshot({
      widgetId: 'widget-1',
      principalKey: 'alice',
      data: { n: 1 },
      capturedAt: NOW,
    })

    await store.applyIdentityBarrier({
      principalKey: 'alice',
      generation: 2,
      deleteSnapshots: true,
    })
    await store.recordRun(
      run({
        id: 'run-late',
        status: 'success',
        finishedAt: NOW,
      }),
      { n: 99 },
      { principalKey: 'alice', expectedGeneration: 1 },
    )

    expect(await store.getSnapshot('widget-1', 'alice')).toBeNull()
    expect(
      (await store.getWidget('widget-1', { principalKey: 'alice' }))?.latestData,
    ).toBeUndefined()
    db.close()
  })
})
