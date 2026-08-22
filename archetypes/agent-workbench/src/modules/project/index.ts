/**
 * Project Module — public Interface.
 *
 * Owns: Project entity, Task catalog rows, ProjectCatalogPort, HostPort,
 * and the local-root command face.
 * Does not own: Runtime, EventStore, session selection, layout chrome.
 */

export {
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_NAME,
  NEW_TASK_TITLE,
  createDefaultProject,
  createTaskCatalogRow,
  isBlankDraftTask,
  isSpecifiedWorkProject,
  normalizeProjectRecord,
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
  ProjectRootSource,
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
  HOST_IPC,
  isHostNativeTheme,
  HOST_UNAVAILABLE_MESSAGE,
  HostUnavailableError,
  isHostUnavailableError,
} from './ports/host-port'
export type {
  HostPort,
  HostCreateProjectDirectoryInput,
  HostIpcChannel,
  HostNativeTheme,
  HostProjectsHomePayload,
  HostRuntimeStatus,
  HostStartRuntimeResult,
  PickDirectoryResult,
  WorkbenchHostBridge,
} from './ports/host-port'

export {
  MemoryProjectCatalog,
  createMemoryProjectCatalog,
} from './adapters/memory-project-catalog'
export {
  IdbProjectCatalog,
  createIdbProjectCatalog,
} from './adapters/idb-project-catalog'
export {
  createFakeHostPort,
} from './adapters/fake-host-port'
export type {
  FakeHostPort,
  FakeHostPortOptions,
} from './adapters/fake-host-port'
export { createUnavailableHostPort } from './adapters/unavailable-host-port'
export {
  createElectronHostAdapter,
  createWorkbenchHostPort,
  isElectronHostBridgePresent,
} from './adapters/electron-host-adapter'

export {
  ProjectCatalogController,
} from './application/project-catalog-controller'
export type {
  ProjectCatalogView,
  ProjectCatalogListener,
} from './application/project-catalog-controller'
export { useProjectCatalog } from './application/use-project-catalog'
export { buildNavigatorTaskRail } from './application/navigator-task-rail'
export type {
  NavigatorProjectGroup,
  NavigatorTaskRail,
} from './application/navigator-task-rail'
export {
  createProjectLocalRootCommands,
} from './application/project-local-root-commands'
export type {
  ProjectLocalRootCommands,
  ProjectLocalRootCommandDeps,
  OpenFolderResult,
  WritableRuntimeGate,
} from './application/project-local-root-commands'
export {
  basenameOfRoot,
  expandHome,
  normalizeLocalRoot,
  resolveProjectsHomePath,
  sanitizeDirectoryName,
  uniqueChildDirectoryName,
} from './application/local-root-path'
export {
  fetchSidecarWorkspaceRoot,
  planSidecarStart,
  waitForSidecarWorkspaceRoot,
} from './application/sidecar-workspace-ready'
export type { SidecarStartPlan } from './application/sidecar-workspace-ready'
