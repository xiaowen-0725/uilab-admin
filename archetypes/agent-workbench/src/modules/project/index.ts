/**
 * Project Module — public Interface.
 *
 * Owns: Project entity, Task catalog rows, ProjectCatalogPort.
 * Does not own: Runtime, EventStore, session selection, layout chrome.
 */

export {
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_NAME,
  NEW_TASK_TITLE,
  createDefaultProject,
  createTaskCatalogRow,
  isBlankDraftTask,
  sortProjects,
  sortTasksByUpdatedAt,
  toProjectSummary,
  toTaskSummary,
} from './model/types'
export type {
  ProjectId,
  TaskId,
  TitleSource,
  ProjectRecord,
  TaskCatalogRow,
  ProjectSummary,
  TaskSummary,
} from './model/types'

export type {
  ProjectCatalogPort,
  ProjectCatalogError,
} from './ports/project-catalog-port'
export { ProjectCatalogPortError } from './ports/project-catalog-port'

export {
  MemoryProjectCatalog,
  createMemoryProjectCatalog,
} from './adapters/memory-project-catalog'
export {
  IdbProjectCatalog,
  createIdbProjectCatalog,
} from './adapters/idb-project-catalog'

export {
  ProjectCatalogController,
} from './application/project-catalog-controller'
export type {
  ProjectCatalogView,
  ProjectCatalogListener,
} from './application/project-catalog-controller'
export { useProjectCatalog } from './application/use-project-catalog'
