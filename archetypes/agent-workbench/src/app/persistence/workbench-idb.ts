/**
 * Shared IndexedDB shell — single open, version upgrade, TX helpers.
 * Composition Root owns open/close; modules receive ready adapters.
 */

import {
  ALL_STORE_NAMES,
  SESSION_ROW_ID,
  STORE_EVENTS,
  STORE_SESSION,
  STORE_SNAPSHOTS,
  STORE_TASKS,
  WORKBENCH_IDB_NAME,
  WORKBENCH_IDB_VERSION,
  upgradeWorkbenchIdb,
  type SessionPointerRecord,
  type WorkbenchStoreName,
} from './workbench-idb-schema'

export type { SessionPointerRecord } from './workbench-idb-schema'
export {
  WORKBENCH_IDB_NAME,
  WORKBENCH_IDB_VERSION,
  SESSION_ROW_ID,
  STORE_PROJECTS,
  STORE_TASKS,
  STORE_EVENTS,
  STORE_SNAPSHOTS,
  STORE_COMMANDS,
  STORE_SESSION,
  STORE_METADATA,
  STORE_BOARDS,
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
  PROTOCOL_EVENT_STORE_NAMES,
} from './workbench-idb-schema'

export interface WorkbenchIdbError {
  code:
    | 'quota_exceeded'
    | 'transaction_failed'
    | 'blocked'
    | 'open_failed'
    | 'unknown'
  message: string
  retriable: boolean
}

export class WorkbenchIdbOpenError extends Error {
  readonly code: WorkbenchIdbError['code']
  readonly retriable: boolean

  constructor(error: WorkbenchIdbError) {
    super(error.message)
    this.name = 'WorkbenchIdbOpenError'
    this.code = error.code
    this.retriable = error.retriable
  }
}

export interface OpenWorkbenchIdbOptions {
  /** Override DB name (tests isolation). */
  name?: string
  version?: number
}

/**
 * Open the unified Workbench IDB. Only Composition should call this.
 */
export function openWorkbenchIdb(
  options: OpenWorkbenchIdbOptions = {},
): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new WorkbenchIdbOpenError({
        code: 'open_failed',
        message: '当前环境不支持 IndexedDB',
        retriable: false,
      }),
    )
  }

  const name = options.name ?? WORKBENCH_IDB_NAME
  const version = options.version ?? WORKBENCH_IDB_VERSION

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(name, version)
    } catch (err) {
      reject(
        new WorkbenchIdbOpenError({
          code: 'open_failed',
          message: err instanceof Error ? err.message : 'IndexedDB 打开失败',
          retriable: false,
        }),
      )
      return
    }

    request.onupgradeneeded = (event) => {
      const db = request.result
      const versionEvent = event as IDBVersionChangeEvent
      upgradeWorkbenchIdb(db, versionEvent.oldVersion, versionEvent.newVersion)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(
        new WorkbenchIdbOpenError({
          code: 'open_failed',
          message: request.error?.message ?? 'IndexedDB 打开失败',
          retriable: true,
        }),
      )
    }

    request.onblocked = () => {
      reject(
        new WorkbenchIdbOpenError({
          code: 'blocked',
          message: 'IndexedDB 被其他标签页阻塞，请关闭后重试',
          retriable: true,
        }),
      )
    }
  })
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        mapIdbError(request.error, 'transaction_failed', 'IndexedDB 请求失败'),
      )
  })
}

export function runTransaction<T>(
  db: IDBDatabase,
  storeNames: readonly WorkbenchStoreName[] | WorkbenchStoreName,
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const names = Array.isArray(storeNames) ? [...storeNames] : [storeNames]
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(names, mode)
    } catch (err) {
      reject(
        mapIdbError(
          err instanceof Error ? err : null,
          'transaction_failed',
          '无法开启 IndexedDB 事务',
        ),
      )
      return
    }

    let settled = false
    let result: T

    tx.oncomplete = () => {
      if (!settled) {
        settled = true
        resolve(result)
      }
    }
    tx.onerror = () => {
      if (!settled) {
        settled = true
        reject(
          mapIdbError(
            tx.error,
            'transaction_failed',
            'IndexedDB 事务失败',
          ),
        )
      }
    }
    tx.onabort = () => {
      if (!settled) {
        settled = true
        reject(
          mapIdbError(
            tx.error,
            'transaction_failed',
            'IndexedDB 事务已中止',
          ),
        )
      }
    }

    void (async () => {
      try {
        result = await fn(tx)
      } catch (err) {
        if (!settled) {
          settled = true
          try {
            tx.abort()
          } catch {
            // ignore
          }
          reject(
            err instanceof Error
              ? err
              : mapIdbError(null, 'transaction_failed', 'IndexedDB 操作失败'),
          )
        }
      }
    })()
  })
}

export function mapIdbError(
  error: DOMException | Error | null | undefined,
  fallbackCode: WorkbenchIdbError['code'],
  fallbackMessage: string,
): WorkbenchIdbOpenError {
  const name = error && 'name' in error ? error.name : ''
  const message = error?.message || fallbackMessage
  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return new WorkbenchIdbOpenError({
      code: 'quota_exceeded',
      message: '本地存储空间不足，无法继续写入',
      retriable: false,
    })
  }
  if (name === 'AbortError') {
    return new WorkbenchIdbOpenError({
      code: 'transaction_failed',
      message,
      retriable: true,
    })
  }
  return new WorkbenchIdbOpenError({
    code: fallbackCode,
    message,
    retriable: fallbackCode !== 'open_failed',
  })
}

/** Read session pointer row (may be null on cold start). */
export async function getSessionPointer(
  db: IDBDatabase,
): Promise<SessionPointerRecord | null> {
  return runTransaction(db, STORE_SESSION, 'readonly', async (tx) => {
    const store = tx.objectStore(STORE_SESSION)
    return idbRequest(store.get(SESSION_ROW_ID) as IDBRequest<SessionPointerRecord | undefined>).then(
      (row) => row ?? null,
    )
  })
}

/** Put session pointer row. */
export async function putSessionPointer(
  db: IDBDatabase,
  record: SessionPointerRecord,
): Promise<void> {
  await runTransaction(db, STORE_SESSION, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_SESSION)
    await idbRequest(store.put(record))
  })
}

export interface DeleteTaskCascadeInput {
  taskId: string
  /** Next selected task after delete (null = empty shell). */
  nextSelectedTaskId: string | null
  selectedProjectId: string
  lastTaskByProject: Record<string, string | null>
  /** Optional layout map JSON after removing deleted task. */
  taskLayoutsJson?: string
  navigatorOpen?: boolean
}

/**
 * Hard-delete catalog row + events + snapshot + retarget session in one TX.
 * Commands store is intentionally not scanned.
 */
export async function deleteTaskCascade(
  db: IDBDatabase,
  input: DeleteTaskCascadeInput,
): Promise<void> {
  const now = new Date().toISOString()
  await runTransaction(
    db,
    [STORE_TASKS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_SESSION],
    'readwrite',
    async (tx) => {
      const tasks = tx.objectStore(STORE_TASKS)
      const events = tx.objectStore(STORE_EVENTS)
      const snapshots = tx.objectStore(STORE_SNAPSHOTS)
      const session = tx.objectStore(STORE_SESSION)

      await idbRequest(tasks.delete(input.taskId))
      await idbRequest(snapshots.delete(input.taskId))

      const taskIndex = events.index('taskId')
      const eventKeys = await idbRequest(
        taskIndex.getAllKeys(IDBKeyRange.only(input.taskId)),
      )
      for (const key of eventKeys) {
        await idbRequest(events.delete(key))
      }

      const pointer: SessionPointerRecord = {
        id: SESSION_ROW_ID,
        selectedProjectId: input.selectedProjectId,
        selectedTaskId: input.nextSelectedTaskId,
        lastTaskByProject: input.lastTaskByProject,
        taskLayoutsJson: input.taskLayoutsJson,
        navigatorOpen: input.navigatorOpen,
        updatedAt: now,
      }
      await idbRequest(session.put(pointer))
    },
  )
}

/** Test helper: delete the named DB (ignore missing). */
export function deleteWorkbenchIdb(name = WORKBENCH_IDB_NAME): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(
        mapIdbError(request.error, 'unknown', '删除 IndexedDB 失败'),
      )
    request.onblocked = () => resolve()
  })
}

/** Expose store list for adapters that need full-store access checks. */
export { ALL_STORE_NAMES }
