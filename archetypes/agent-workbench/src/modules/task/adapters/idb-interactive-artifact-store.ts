/**
 * IndexedDB adapter for InteractiveArtifactStorePort.
 * Requires a ready IDBDatabase from the shared shell (Composition open).
 */

import {
  idbRequest,
  runTransaction,
  STORE_INTERACTIVE_ARTIFACTS,
} from '@/app/persistence/workbench-idb'
import {
  cloneInteractiveArtifactRecord,
  compareInteractiveArtifactRecords,
  type InteractiveArtifactRecord,
} from '../model/interactive-artifact'
import type { InteractiveArtifactStorePort } from '../ports/interactive-artifact-store-port'

export class IdbInteractiveArtifactStore
  implements InteractiveArtifactStorePort
{
  constructor(private readonly db: IDBDatabase) {}

  get(
    taskId: string,
    artifactId: string,
  ): Promise<InteractiveArtifactRecord | null> {
    return withArtifacts(this.db, 'readonly', async (store) => {
      const row = await idbRequest(
        store.get([taskId, artifactId]) as IDBRequest<
          InteractiveArtifactRecord | undefined
        >,
      )
      return row ? cloneInteractiveArtifactRecord(row) : null
    })
  }

  list(taskId: string): Promise<readonly InteractiveArtifactRecord[]> {
    return withArtifacts(this.db, 'readonly', async (store) => {
      const rows = await rowsForTask(store, taskId)
      return rows
        .sort(compareInteractiveArtifactRecords)
        .map(cloneInteractiveArtifactRecord)
    })
  }

  findByContentHash(
    taskId: string,
    contentHash: string,
  ): Promise<InteractiveArtifactRecord | null> {
    return withArtifacts(this.db, 'readonly', async (store) => {
      const match = (await rowsForTask(store, taskId))
        .filter((row) => row.contentHash === contentHash)
        .sort(compareInteractiveArtifactRecords)[0]
      return match ? cloneInteractiveArtifactRecord(match) : null
    })
  }

  put(record: InteractiveArtifactRecord): Promise<void> {
    return withArtifacts(this.db, 'readwrite', async (store) => {
      await idbRequest(store.put(cloneInteractiveArtifactRecord(record)))
    })
  }

  deleteByTaskId(taskId: string): Promise<void> {
    return withArtifacts(this.db, 'readwrite', async (store) => {
      await deleteRowsForTask(store, taskId)
    })
  }
}

function withArtifacts<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return runTransaction(db, STORE_INTERACTIVE_ARTIFACTS, mode, (tx) =>
    fn(tx.objectStore(STORE_INTERACTIVE_ARTIFACTS)),
  )
}

function rowsForTask(
  store: IDBObjectStore,
  taskId: string,
): Promise<InteractiveArtifactRecord[]> {
  return idbRequest(
    store.index('taskId').getAll(IDBKeyRange.only(taskId)) as IDBRequest<
      InteractiveArtifactRecord[]
    >,
  )
}

async function deleteRowsForTask(
  store: IDBObjectStore,
  taskId: string,
): Promise<void> {
  const keys = await idbRequest(
    store.index('taskId').getAllKeys(IDBKeyRange.only(taskId)),
  )
  for (const key of keys) {
    await idbRequest(store.delete(key))
  }
}

export function createIdbInteractiveArtifactStore(
  db: IDBDatabase,
): IdbInteractiveArtifactStore {
  return new IdbInteractiveArtifactStore(db)
}
