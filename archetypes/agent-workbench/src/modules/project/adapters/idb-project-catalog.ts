/**
 * IndexedDB adapter for ProjectCatalogPort.
 * Requires a ready IDBDatabase from the shared shell (Composition open).
 */

import {
  idbRequest,
  mapIdbError,
  runTransaction,
  STORE_PROJECTS,
  STORE_TASKS,
} from '@/app/persistence/workbench-idb'
import type {
  ProjectId,
  ProjectRecord,
  TaskCatalogRow,
  TaskId,
} from '../model/types'
import {
  normalizeProjectRecord,
  sortProjects,
  sortTasksByUpdatedAt,
} from '../model/types'
import {
  ProjectCatalogPortError,
  type ProjectCatalogPort,
} from '../ports/project-catalog-port'

export class IdbProjectCatalog implements ProjectCatalogPort {
  constructor(private readonly db: IDBDatabase) {}

  async listProjects(): Promise<readonly ProjectRecord[]> {
    try {
      const rows = await runTransaction(
        this.db,
        STORE_PROJECTS,
        'readonly',
        async (tx) => {
          const store = tx.objectStore(STORE_PROJECTS)
          return idbRequest(store.getAll() as IDBRequest<ProjectRecord[]>)
        },
      )
      return sortProjects(rows.map((row) => normalizeProjectRecord(row)))
    } catch (err) {
      throw toCatalogError(err)
    }
  }

  async getProject(projectId: ProjectId): Promise<ProjectRecord | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_PROJECTS,
        'readonly',
        async (tx) => {
          const store = tx.objectStore(STORE_PROJECTS)
          const row = await idbRequest(
            store.get(projectId) as IDBRequest<ProjectRecord | undefined>,
          )
          return row ? normalizeProjectRecord(row) : null
        },
      )
    } catch (err) {
      throw toCatalogError(err)
    }
  }

  async putProject(project: ProjectRecord): Promise<void> {
    try {
      await runTransaction(this.db, STORE_PROJECTS, 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_PROJECTS)
        await idbRequest(store.put(project))
      })
    } catch (err) {
      throw toCatalogError(err)
    }
  }

  async deleteProject(projectId: ProjectId): Promise<void> {
    try {
      await runTransaction(this.db, STORE_PROJECTS, 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_PROJECTS)
        await idbRequest(store.delete(projectId))
      })
    } catch (err) {
      throw toCatalogError(err)
    }
  }

  async listTasks(projectId?: ProjectId): Promise<readonly TaskCatalogRow[]> {
    try {
      const rows = await runTransaction(
        this.db,
        STORE_TASKS,
        'readonly',
        async (tx) => {
          const store = tx.objectStore(STORE_TASKS)
          if (projectId) {
            const index = store.index('projectId')
            return idbRequest(
              index.getAll(projectId) as IDBRequest<TaskCatalogRow[]>,
            )
          }
          return idbRequest(store.getAll() as IDBRequest<TaskCatalogRow[]>)
        },
      )
      return sortTasksByUpdatedAt(rows)
    } catch (err) {
      throw toCatalogError(err)
    }
  }

  async getTask(taskId: TaskId): Promise<TaskCatalogRow | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_TASKS,
        'readonly',
        async (tx) => {
          const store = tx.objectStore(STORE_TASKS)
          const row = await idbRequest(
            store.get(taskId) as IDBRequest<TaskCatalogRow | undefined>,
          )
          return row ?? null
        },
      )
    } catch (err) {
      throw toCatalogError(err)
    }
  }

  async putTask(task: TaskCatalogRow): Promise<void> {
    try {
      await runTransaction(this.db, STORE_TASKS, 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_TASKS)
        await idbRequest(store.put(task))
      })
    } catch (err) {
      throw toCatalogError(err)
    }
  }

  async deleteTaskRow(taskId: TaskId): Promise<void> {
    try {
      await runTransaction(this.db, STORE_TASKS, 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_TASKS)
        await idbRequest(store.delete(taskId))
      })
    } catch (err) {
      throw toCatalogError(err)
    }
  }
}

export function createIdbProjectCatalog(db: IDBDatabase): IdbProjectCatalog {
  return new IdbProjectCatalog(db)
}

function toCatalogError(err: unknown): ProjectCatalogPortError {
  if (err instanceof ProjectCatalogPortError) return err
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  ) {
    const e = err as { code: string; message?: string; retriable?: boolean }
    return new ProjectCatalogPortError({
      code: (e.code as ProjectCatalogPortError['code']) || 'unknown',
      message: e.message ?? '目录存储失败',
      retriable: e.retriable ?? false,
    })
  }
  const mapped = mapIdbError(
    err instanceof Error ? err : null,
    'unknown',
    '目录存储失败',
  )
  return new ProjectCatalogPortError({
    code: mapped.code === 'quota_exceeded' ? 'quota_exceeded' : mapped.code === 'blocked' ? 'blocked' : mapped.code === 'open_failed' ? 'open_failed' : 'transaction_failed',
    message: mapped.message,
    retriable: mapped.retriable,
  })
}
