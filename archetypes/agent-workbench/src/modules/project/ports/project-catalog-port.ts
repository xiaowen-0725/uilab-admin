/**
 * ProjectCatalogPort — durable Project/Task directory.
 * Owned by Project Module; Composition opens the shared DB and injects the adapter.
 */

import type { ProjectId, ProjectRecord, TaskCatalogRow, TaskId } from '../model/types'

export interface ProjectCatalogError {
  code:
    | 'quota_exceeded'
    | 'transaction_failed'
    | 'blocked'
    | 'open_failed'
    | 'not_found'
    | 'conflict'
    | 'unknown'
  message: string
  retriable: boolean
}

export class ProjectCatalogPortError extends Error {
  readonly code: ProjectCatalogError['code']
  readonly retriable: boolean

  constructor(error: ProjectCatalogError) {
    super(error.message)
    this.name = 'ProjectCatalogPortError'
    this.code = error.code
    this.retriable = error.retriable
  }
}

/**
 * Directory CRUD for projects and task catalog rows.
 * Does not own Runtime, EventStore, or session selection pointers.
 */
export interface ProjectCatalogPort {
  listProjects(): Promise<readonly ProjectRecord[]>

  getProject(projectId: ProjectId): Promise<ProjectRecord | null>

  putProject(project: ProjectRecord): Promise<void>

  listTasks(projectId?: ProjectId): Promise<readonly TaskCatalogRow[]>

  getTask(taskId: TaskId): Promise<TaskCatalogRow | null>

  putTask(task: TaskCatalogRow): Promise<void>

  /** Hard-delete catalog row only (cascade of events is Composition/shell TX). */
  deleteTaskRow(taskId: TaskId): Promise<void>
}
