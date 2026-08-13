/**
 * In-memory ProjectCatalogPort for tests and non-IDB harnesses.
 */

import type {
  ProjectCatalogPort,
} from '../ports/project-catalog-port'
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

export class MemoryProjectCatalog implements ProjectCatalogPort {
  private readonly projects = new Map<ProjectId, ProjectRecord>()
  private readonly tasks = new Map<TaskId, TaskCatalogRow>()

  async listProjects(): Promise<readonly ProjectRecord[]> {
    return sortProjects(
      [...this.projects.values()].map((row) => normalizeProjectRecord(row)),
    )
  }

  async getProject(projectId: ProjectId): Promise<ProjectRecord | null> {
    const row = this.projects.get(projectId)
    return row ? normalizeProjectRecord(row) : null
  }

  async putProject(project: ProjectRecord): Promise<void> {
    this.projects.set(project.id, { ...project })
  }

  async listTasks(projectId?: ProjectId): Promise<readonly TaskCatalogRow[]> {
    const all = [...this.tasks.values()]
    const filtered = projectId
      ? all.filter((t) => t.projectId === projectId)
      : all
    return sortTasksByUpdatedAt(filtered)
  }

  async getTask(taskId: TaskId): Promise<TaskCatalogRow | null> {
    return this.tasks.get(taskId) ?? null
  }

  async putTask(task: TaskCatalogRow): Promise<void> {
    this.tasks.set(task.id, { ...task })
  }

  async deleteTaskRow(taskId: TaskId): Promise<void> {
    this.tasks.delete(taskId)
  }

  /** Test helper. */
  clear(): void {
    this.projects.clear()
    this.tasks.clear()
  }
}

export function createMemoryProjectCatalog(): MemoryProjectCatalog {
  return new MemoryProjectCatalog()
}
