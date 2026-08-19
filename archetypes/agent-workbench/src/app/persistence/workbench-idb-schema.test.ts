import { afterEach, describe, expect, it } from 'vitest'
import {
  ALL_STORE_NAMES,
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
  STORE_WIDGET_DATA_SNAPSHOTS,
  STORE_WIDGET_DATA_SOURCES,
  STORE_WIDGET_JOB_RUNS,
  WORKBENCH_IDB_VERSION,
  deleteTaskCascade,
  deleteWorkbenchIdb,
  idbRequest,
  openWorkbenchIdb,
  runTransaction,
} from '@/app/persistence/workbench-idb'

const V2_STORE_NAMES = [
  STORE_PROJECTS,
  STORE_TASKS,
  STORE_EVENTS,
  STORE_SNAPSHOTS,
  STORE_COMMANDS,
  STORE_SESSION,
  STORE_METADATA,
] as const

const BOARD_V3_STORE_NAMES = [
  STORE_BOARDS,
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
] as const

const BOARD_V4_STORE_NAMES = [
  ...BOARD_V3_STORE_NAMES,
  STORE_WIDGET_DATA_SOURCES,
  STORE_WIDGET_DATA_SNAPSHOTS,
] as const

function uniqueDbName(suffix: string): string {
  return `test-idb-v4-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function openNamed(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => {
      const db = request.result
      if (version === 2) {
        createV2Stores(db)
      }
      if (version === 3) {
        createV3Stores(db)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function createV2Stores(db: IDBDatabase): void {
  db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
  const tasks = db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
  tasks.createIndex('projectId', 'projectId', { unique: false })
  const events = db.createObjectStore(STORE_EVENTS, {
    keyPath: ['taskId', 'taskSequence'],
  })
  events.createIndex('eventId', 'eventId', { unique: true })
  events.createIndex('taskId', 'taskId', { unique: false })
  db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'taskId' })
  db.createObjectStore(STORE_COMMANDS, { keyPath: 'commandId' })
  db.createObjectStore(STORE_SESSION, { keyPath: 'id' })
  db.createObjectStore(STORE_METADATA, { keyPath: 'key' })
}

function createV3Stores(db: IDBDatabase): void {
  createV2Stores(db)
  db.createObjectStore(STORE_BOARDS, { keyPath: 'id' })
  db.createObjectStore(STORE_BOARD_WIDGETS, { keyPath: 'id' })
  const jobs = db.createObjectStore(STORE_WIDGET_DATA_JOBS, { keyPath: 'id' })
  jobs.createIndex('widgetId', 'widgetId', { unique: true })
  const runs = db.createObjectStore(STORE_WIDGET_JOB_RUNS, { keyPath: 'id' })
  runs.createIndex('jobId', 'jobId', { unique: false })
}

async function putInStore(
  db: IDBDatabase,
  storeName: string,
  value: unknown,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(storeName).put(value)
  })
}

async function getFromStore<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

describe('Workbench IDB v4', () => {
  const opened: string[] = []

  afterEach(async () => {
    for (const name of opened.splice(0)) {
      await deleteWorkbenchIdb(name)
    }
  })

  it('creates Board, source and snapshot stores on a fresh v4 database', async () => {
    const name = uniqueDbName('fresh')
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    expect(WORKBENCH_IDB_VERSION).toBe(4)
    expect(db.version).toBe(4)
    for (const store of ALL_STORE_NAMES) {
      expect(db.objectStoreNames.contains(store), store).toBe(true)
    }
    for (const store of BOARD_V4_STORE_NAMES) {
      expect(db.objectStoreNames.contains(store), store).toBe(true)
    }

    const jobs = db.transaction(STORE_WIDGET_DATA_JOBS, 'readonly').objectStore(
      STORE_WIDGET_DATA_JOBS,
    )
    expect(jobs.indexNames.contains('widgetId')).toBe(true)
    expect(jobs.index('widgetId').unique).toBe(true)

    const runs = db.transaction(STORE_WIDGET_JOB_RUNS, 'readonly').objectStore(
      STORE_WIDGET_JOB_RUNS,
    )
    expect(runs.indexNames.contains('jobId')).toBe(true)

    const sources = db
      .transaction(STORE_WIDGET_DATA_SOURCES, 'readonly')
      .objectStore(STORE_WIDGET_DATA_SOURCES)
    expect(sources.indexNames.contains('widgetId')).toBe(true)
    expect(sources.index('widgetId').unique).toBe(true)

    const snapshots = db
      .transaction(STORE_WIDGET_DATA_SNAPSHOTS, 'readonly')
      .objectStore(STORE_WIDGET_DATA_SNAPSHOTS)
    expect(snapshots.keyPath).toEqual(['widgetId', 'principalKey'])
    expect(snapshots.indexNames.contains('widgetId')).toBe(true)
    db.close()
  })

  it('keeps all seven v2 store rows after upgrading to v3', async () => {
    const name = uniqueDbName('upgrade')
    opened.push(name)
    const v2 = await openNamed(name, 2)
    await putInStore(v2, STORE_PROJECTS, {
      id: 'project-keep',
      name: '保留项目',
    })
    await putInStore(v2, STORE_TASKS, {
      id: 'task-keep',
      projectId: 'project-keep',
      title: '保留任务',
    })
    await putInStore(v2, STORE_EVENTS, {
      taskId: 'task-keep',
      taskSequence: 1,
      eventId: 'event-keep',
    })
    await putInStore(v2, STORE_SNAPSHOTS, {
      taskId: 'task-keep',
      kind: 'snapshot',
    })
    await putInStore(v2, STORE_COMMANDS, {
      commandId: 'command-keep',
      acknowledgement: { status: 'acked' },
    })
    await putInStore(v2, STORE_SESSION, {
      id: 'current',
      selectedTaskId: 'task-keep',
    })
    await putInStore(v2, STORE_METADATA, {
      key: 'seed',
      value: 'v2-row',
    })
    v2.close()

    const upgraded = await openWorkbenchIdb({ name })
    expect(upgraded.version).toBe(4)
    for (const store of V2_STORE_NAMES) {
      expect(upgraded.objectStoreNames.contains(store), store).toBe(true)
    }
    expect(await getFromStore(upgraded, STORE_PROJECTS, 'project-keep')).toMatchObject({
      id: 'project-keep',
      name: '保留项目',
    })
    expect(await getFromStore(upgraded, STORE_TASKS, 'task-keep')).toMatchObject({
      id: 'task-keep',
      title: '保留任务',
    })
    expect(
      await getFromStore(upgraded, STORE_EVENTS, ['task-keep', 1]),
    ).toMatchObject({ eventId: 'event-keep' })
    expect(await getFromStore(upgraded, STORE_SNAPSHOTS, 'task-keep')).toMatchObject({
      kind: 'snapshot',
    })
    expect(await getFromStore(upgraded, STORE_COMMANDS, 'command-keep')).toMatchObject({
      commandId: 'command-keep',
    })
    expect(await getFromStore(upgraded, STORE_SESSION, 'current')).toMatchObject({
      selectedTaskId: 'task-keep',
    })
    expect(await getFromStore(upgraded, STORE_METADATA, 'seed')).toMatchObject({
      value: 'v2-row',
    })
    for (const store of BOARD_V4_STORE_NAMES) {
      expect(upgraded.objectStoreNames.contains(store), store).toBe(true)
    }
    upgraded.close()
  })

  it('keeps all v3 Board rows after upgrading to v4', async () => {
    const name = uniqueDbName('v3-upgrade')
    opened.push(name)
    const v3 = await openNamed(name, 3)
    await putInStore(v3, STORE_PROJECTS, {
      id: 'project-keep',
      name: 'v3 项目',
    })
    await putInStore(v3, STORE_BOARDS, {
      id: 'board-keep',
      title: '旧看板',
      isExample: false,
      placements: [
        { mountId: 'mount-1', widgetId: 'widget-keep', x: 0, y: 0, w: 4, h: 4 },
      ],
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    })
    await putInStore(v3, STORE_BOARD_WIDGETS, {
      id: 'widget-keep',
      title: '旧组件',
      html: '<html></html>',
      span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
      latestData: { quote: 7 },
      latestDataAt: '2026-08-16T00:00:00.000Z',
      status: 'idle',
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    })
    await putInStore(v3, STORE_WIDGET_DATA_JOBS, {
      id: 'job-keep',
      widgetId: 'widget-keep',
      title: '旧作业',
      description: '',
      enabled: true,
      trigger: { kind: 'manual' },
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    })
    await putInStore(v3, STORE_WIDGET_JOB_RUNS, {
      id: 'run-keep',
      jobId: 'job-keep',
      widgetId: 'widget-keep',
      startedAt: '2026-08-16T00:00:00.000Z',
      status: 'success',
    })
    v3.close()

    const v4 = await openWorkbenchIdb({ name })
    expect(v4.version).toBe(4)
    for (const store of BOARD_V3_STORE_NAMES) {
      expect(v4.objectStoreNames.contains(store), store).toBe(true)
    }
    expect(await getFromStore(v4, STORE_PROJECTS, 'project-keep')).toMatchObject({
      name: 'v3 项目',
    })
    expect(await getFromStore(v4, STORE_BOARDS, 'board-keep')).toMatchObject({
      title: '旧看板',
    })
    expect(await getFromStore(v4, STORE_BOARD_WIDGETS, 'widget-keep')).toMatchObject({
      latestData: { quote: 7 },
      latestDataAt: '2026-08-16T00:00:00.000Z',
    })
    expect(await getFromStore(v4, STORE_WIDGET_DATA_JOBS, 'job-keep')).toMatchObject({
      widgetId: 'widget-keep',
      trigger: { kind: 'manual' },
    })
    expect(await getFromStore(v4, STORE_WIDGET_JOB_RUNS, 'run-keep')).toMatchObject({
      jobId: 'job-keep',
    })
    expect(v4.objectStoreNames.contains(STORE_WIDGET_DATA_SOURCES)).toBe(true)
    expect(v4.objectStoreNames.contains(STORE_WIDGET_DATA_SNAPSHOTS)).toBe(true)
    v4.close()
  })

  it('leaves Board rows in place when a Task is hard-deleted', async () => {
    const name = uniqueDbName('cascade')
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    await runTransaction(db, STORE_TASKS, 'readwrite', async (tx) => {
      await idbRequest(
        tx.objectStore(STORE_TASKS).put({
          id: 'task-gone',
          projectId: 'project-keep',
          title: '将被删除',
          titleSource: 'user',
          lastAcceptedSuggestionVersion: 0,
          createdAt: '2026-08-16T00:00:00.000Z',
          updatedAt: '2026-08-16T00:00:00.000Z',
        }),
      )
    })
    await runTransaction(db, STORE_BOARDS, 'readwrite', async (tx) => {
      await idbRequest(
        tx.objectStore(STORE_BOARDS).put({
          id: 'board-keep',
          title: '溯源任务可悬空',
          isExample: false,
          placements: [],
          createdAt: '2026-08-16T00:00:00.000Z',
          updatedAt: '2026-08-16T00:00:00.000Z',
          createdByTaskId: 'task-gone',
        }),
      )
    })

    await deleteTaskCascade(db, {
      taskId: 'task-gone',
      nextSelectedTaskId: null,
      selectedProjectId: 'project-keep',
      lastTaskByProject: {},
    })

    expect(await getFromStore(db, STORE_TASKS, 'task-gone')).toBeUndefined()
    expect(await getFromStore(db, STORE_BOARDS, 'board-keep')).toMatchObject({
      id: 'board-keep',
      createdByTaskId: 'task-gone',
    })
    db.close()
  })
})
