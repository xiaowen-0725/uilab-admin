/**
 * In-memory controller for Project catalog view + commands.
 * Persistence goes through ProjectCatalogPort; selection stays in session.
 */

import {
  createDefaultProject,
  createTaskCatalogRow,
  DEFAULT_PROJECT_ID,
  NEW_TASK_TITLE,
  sortProjects,
  sortTasksByUpdatedAt,
  toProjectSummary,
  toTaskSummary,
  type ProjectId,
  type ProjectRecord,
  type ProjectSummary,
  type TaskCatalogRow,
  type TaskId,
  type TaskSummary,
  type TitleSource,
} from '../model/types'
import type { ProjectCatalogPort } from '../ports/project-catalog-port'

export interface ProjectCatalogView {
  projects: ProjectSummary[]
  /** Tasks for the currently focused project (caller passes projectId). */
  tasks: TaskSummary[]
  ready: boolean
  error: string | null
}

export type ProjectCatalogListener = () => void

export class ProjectCatalogController {
  private projects: ProjectRecord[] = []
  private tasks: TaskCatalogRow[] = []
  private focusedProjectId: ProjectId | null = DEFAULT_PROJECT_ID
  private ready = false
  private error: string | null = null
  private readonly listeners = new Set<ProjectCatalogListener>()
  /** Monotonic revision for useSyncExternalStore. */
  private revision = 0
  private cachedView: ProjectCatalogView = {
    projects: [],
    tasks: [],
    ready: false,
    error: null,
  }

  constructor(private readonly catalog: ProjectCatalogPort) {}

  subscribe(listener: ProjectCatalogListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getRevision(): number {
    return this.revision
  }

  getView(): ProjectCatalogView {
    return this.cachedView
  }

  private rebuildView(): void {
    const tasksForFocus = this.focusedProjectId
      ? this.tasks.filter((t) => t.projectId === this.focusedProjectId)
      : []
    this.cachedView = {
      projects: sortProjects(this.projects).map(toProjectSummary),
      tasks: sortTasksByUpdatedAt(tasksForFocus).map(toTaskSummary),
      ready: this.ready,
      error: this.error,
    }
    this.revision += 1
  }

  getTaskRow(taskId: TaskId): TaskCatalogRow | null {
    return this.tasks.find((t) => t.id === taskId) ?? null
  }

  getProjectRecord(projectId: ProjectId): ProjectRecord | null {
    return this.projects.find((p) => p.id === projectId) ?? null
  }

  listTasksInProject(projectId: ProjectId): TaskCatalogRow[] {
    return sortTasksByUpdatedAt(
      this.tasks.filter((t) => t.projectId === projectId),
    )
  }

  setFocusedProject(projectId: ProjectId | null): void {
    if (this.focusedProjectId === projectId) return
    this.focusedProjectId = projectId
    this.emit()
  }

  /**
   * Load catalog from port.
   * `seedDefaultProject` (default true) writes the no-Host 降级夹具「默认项目」.
   * Desktop Host 产品路径应传 false：空目录保持未选。
   */
  async hydrate(options?: {
    focusedProjectId?: ProjectId | null
    seedDefaultProject?: boolean
  }): Promise<void> {
    try {
      let projects = [...(await this.catalog.listProjects())]
      const seedDefault = options?.seedDefaultProject !== false
      if (projects.length === 0 && seedDefault) {
        const defaults = createDefaultProject()
        await this.catalog.putProject(defaults)
        projects = [defaults]
      }
      const tasks = [...(await this.catalog.listTasks())]
      this.projects = projects
      this.tasks = tasks
      const requested = options?.focusedProjectId
      if (requested && projects.some((p) => p.id === requested)) {
        this.focusedProjectId = requested
      } else if (projects.length === 0) {
        this.focusedProjectId = null
      } else {
        this.focusedProjectId =
          projects.find((p) => p.id === DEFAULT_PROJECT_ID)?.id ??
          projects[0]!.id
      }
      this.ready = true
      this.error = null
      this.emit()
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : '无法加载项目目录'
      this.ready = true
      this.emit()
      throw err
    }
  }

  async createProject(
    name: string,
    extras?: {
      localRoot?: string | null
      rootSource?: ProjectRecord['rootSource']
    },
  ): Promise<ProjectRecord> {
    const trimmed = name.trim() || '未命名项目'
    const now = new Date().toISOString()
    const maxOrder = this.projects.reduce(
      (max, p) => Math.max(max, p.sortOrder),
      -1,
    )
    const project: ProjectRecord = {
      id: `project-${cryptoRandomId()}`,
      name: trimmed,
      sortOrder: maxOrder + 1,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      localRoot: extras?.localRoot ?? null,
      rootSource: extras?.rootSource ?? null,
    }
    await this.catalog.putProject(project)
    this.projects = [...this.projects, project]
    this.emit()
    return project
  }

  async renameProject(projectId: ProjectId, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = this.projects.find((p) => p.id === projectId)
    if (!existing) return
    const updated: ProjectRecord = {
      ...existing,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    }
    await this.catalog.putProject(updated)
    this.projects = this.projects.map((p) =>
      p.id === projectId ? updated : p,
    )
    this.emit()
  }

  /**
   * Create a catalog-only task row. Runtime createTask is Composition's job.
   */
  async createTask(input: {
    projectId: ProjectId
    taskId?: TaskId
    title?: string
  }): Promise<TaskCatalogRow> {
    const projectId = input.projectId
    if (!this.projects.some((p) => p.id === projectId)) {
      throw new Error(`项目不存在：${projectId}`)
    }
    const row = createTaskCatalogRow({
      id: input.taskId ?? `task-${cryptoRandomId()}`,
      projectId,
      title: input.title ?? NEW_TASK_TITLE,
      titleSource: 'local',
    })
    await this.catalog.putTask(row)
    this.tasks = [...this.tasks, row]
    this.emit()
    return row
  }

  async renameTask(
    taskId: TaskId,
    title: string,
    titleSource: TitleSource = 'user',
  ): Promise<void> {
    const trimmed = title.trim()
    if (!trimmed) return
    const existing = this.tasks.find((t) => t.id === taskId)
    if (!existing) return
    const updated: TaskCatalogRow = {
      ...existing,
      title: trimmed,
      titleSource,
      updatedAt: new Date().toISOString(),
    }
    await this.catalog.putTask(updated)
    this.tasks = this.tasks.map((t) => (t.id === taskId ? updated : t))
    this.emit()
  }

  /**
   * Drop a project and its catalog tasks. Does not touch the filesystem.
   * Returns removed task ids so Composition can cascade EventStore data.
   */
  async removeProject(projectId: ProjectId): Promise<TaskId[]> {
    if (!this.projects.some((row) => row.id === projectId)) return []
    const taskIds = this.tasks
      .filter((row) => row.projectId === projectId)
      .map((row) => row.id)
    for (const taskId of taskIds) {
      await this.catalog.deleteTaskRow(taskId)
    }
    await this.catalog.deleteProject(projectId)
    this.tasks = this.tasks.filter((row) => row.projectId !== projectId)
    this.projects = this.projects.filter((row) => row.id !== projectId)
    if (this.focusedProjectId === projectId) {
      this.focusedProjectId = this.projects[0]?.id ?? null
    }
    this.emit()
    return taskIds
  }

  /**
   * Remove catalog row from local state after durable cascade delete.
   * Prefer Composition calling deleteTaskCascade on IDB shell, then this.
   */
  async deleteTaskRow(taskId: TaskId): Promise<void> {
    await this.catalog.deleteTaskRow(taskId)
    this.tasks = this.tasks.filter((t) => t.id !== taskId)
    this.emit()
  }

  /** Drop task from in-memory view without touching port (after cascade TX). */
  forgetTaskLocally(taskId: TaskId): void {
    this.tasks = this.tasks.filter((t) => t.id !== taskId)
    this.emit()
  }

  private emit(): void {
    this.rebuildView()
    for (const listener of this.listeners) listener()
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
