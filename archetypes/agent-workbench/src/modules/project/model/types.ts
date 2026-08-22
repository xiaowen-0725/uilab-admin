/**
 * Project Module domain — Project entity + Task catalog rows.
 * runStatus is never stored here (runtime projection only).
 */

export type ProjectId = string
export type TaskId = string

export type TitleSource = 'local' | 'runtime' | 'user'

/** Well-known default project (cold-start bootstrap, no-Host 降级夹具). */
export const DEFAULT_PROJECT_ID: ProjectId = 'project-default'
export const DEFAULT_PROJECT_NAME = '默认项目'
/** Initial title for a newly created conversation catalog row. */
export const NEW_TASK_TITLE = '新对话'

/** How a Project obtained its local root. null = 无根（测试/Web 降级）. */
export type ProjectRootSource = 'opened' | 'created' | 'auto'

export interface ProjectRecord {
  id: ProjectId
  name: string
  sortOrder: number
  pinned: boolean
  createdAt: string
  updatedAt: string
  /** 规范化后的绝对路径；null = 无根（仅测试/降级） */
  localRoot: string | null
  rootSource: ProjectRootSource | null
}

const ROOT_SOURCES: ReadonlySet<ProjectRootSource> = new Set([
  'opened',
  'created',
  'auto',
])

/**
 * Fill missing root fields for records written before Spec-α.
 * Catalog adapters must run this on read so old IDB rows surface as null.
 */
export function normalizeProjectRecord(
  row: Omit<ProjectRecord, 'localRoot' | 'rootSource'> & {
    localRoot?: string | null
    rootSource?: ProjectRootSource | null
  },
): ProjectRecord {
  const localRoot =
    typeof row.localRoot === 'string' && row.localRoot.trim()
      ? row.localRoot
      : null
  const rootSource =
    row.rootSource && ROOT_SOURCES.has(row.rootSource) ? row.rootSource : null
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    pinned: row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    localRoot,
    rootSource,
  }
}

/**
 * Navigator-authoritative Task directory row.
 * No subtitle, no runStatus, no soft-delete fields.
 */
export interface TaskCatalogRow {
  id: TaskId
  projectId: ProjectId
  title: string
  titleSource: TitleSource
  lastAcceptedSuggestionVersion: number
  createdAt: string
  updatedAt: string
}

/** Lightweight Navigator view of a project. */
export interface ProjectSummary {
  id: ProjectId
  name: string
  pinned: boolean
  sortOrder: number
}

/** Lightweight Navigator view of a task catalog row. */
export interface TaskSummary {
  id: TaskId
  projectId: ProjectId
  title: string
  updatedAt: string
}

export function toProjectSummary(project: ProjectRecord): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    pinned: project.pinned,
    sortOrder: project.sortOrder,
  }
}

export function toTaskSummary(row: TaskCatalogRow): TaskSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    updatedAt: row.updatedAt,
  }
}

export function createDefaultProject(now = new Date().toISOString()): ProjectRecord {
  return {
    id: DEFAULT_PROJECT_ID,
    name: DEFAULT_PROJECT_NAME,
    sortOrder: 0,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    localRoot: null,
    rootSource: null,
  }
}

export function createTaskCatalogRow(input: {
  id: TaskId
  projectId: ProjectId
  title?: string
  titleSource?: TitleSource
  now?: string
}): TaskCatalogRow {
  const now = input.now ?? new Date().toISOString()
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.title ?? NEW_TASK_TITLE,
    titleSource: input.titleSource ?? 'local',
    lastAcceptedSuggestionVersion: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Unused blank draft (Codex / WorkBuddy “new chat once”):
 * catalog title is still the default「新对话」until the first user turn renames it.
 * titleSource may be `local` or `runtime` after bind — only the title matters here.
 */
export function isBlankDraftTask(row: Pick<TaskCatalogRow, 'title'>): boolean {
  return row.title === NEW_TASK_TITLE
}

/**
 * User explicitly chose a work-project path (open folder / create).
 * Auto-created roots and the no-root Web fixture stay in the flat 任务 list.
 */
export function isSpecifiedWorkProject(
  project: Pick<ProjectRecord, 'localRoot' | 'rootSource'>,
): boolean {
  return (
    project.localRoot != null &&
    (project.rootSource === 'opened' || project.rootSource === 'created')
  )
}

/** Sort projects: pinned first, then sortOrder asc, then name. */
export function sortProjects(projects: readonly ProjectRecord[]): ProjectRecord[] {
  return [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name, 'zh')
  })
}

/** Sort tasks by updatedAt desc (most recent first). */
export function sortTasksByUpdatedAt(
  tasks: readonly TaskCatalogRow[],
): TaskCatalogRow[] {
  return [...tasks].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) {
      return a.updatedAt < b.updatedAt ? 1 : -1
    }
    return a.createdAt < b.createdAt ? 1 : -1
  })
}
