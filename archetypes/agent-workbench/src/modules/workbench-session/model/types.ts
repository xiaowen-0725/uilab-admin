/**
 * Workbench Session — selection pointers + per-task layout chrome only.
 * Project/Task directory arrays live in modules/project.
 */

export type TaskId = string
export type ProjectId = string
export type WorkSurfaceTabId = string

/**
 * Per-Task layout state. Switching Task A → B → A must restore these values.
 */
export interface TaskLayoutState {
  contextPanelOpen: boolean
  workSurfaceVisible: boolean
  workSurfaceWidth: number
  activeTabId: WorkSurfaceTabId
  workSurfaceMaximized: boolean
}

export interface WorkSurfaceTab {
  id: WorkSurfaceTabId
  label: string
}

export interface WorkbenchSessionState {
  selectedProjectId: ProjectId
  /** null when cold-start empty shell or all tasks deleted. */
  selectedTaskId: TaskId | null
  /** Last selected task per project (for switch restore). */
  lastTaskByProject: Record<ProjectId, TaskId | null>
  navigatorOpen: boolean
  taskLayouts: Record<TaskId, TaskLayoutState>
  workSurfaceTabs: WorkSurfaceTab[]
  workSurfaceMinWidth: number
  workSurfaceMaxWidth: number
  /** Fallback layout when no task is selected. */
  emptyLayout: TaskLayoutState
}

/** Read-only view model consumed by Shell and Composition. */
export interface WorkbenchSessionView {
  selectedProjectId: ProjectId
  selectedTaskId: TaskId | null
  navigatorOpen: boolean
  layout: TaskLayoutState
  workSurfaceTabs: WorkSurfaceTab[]
  workSurfaceMinWidth: number
  workSurfaceMaxWidth: number
  /** True when Work Surface is closed (or no task). */
  isTaskOnly: boolean
  lastTaskByProject: Record<ProjectId, TaskId | null>
}

export type WorkbenchSessionCommand =
  | { type: 'selectProject'; projectId: ProjectId; taskId?: TaskId | null }
  | { type: 'selectTask'; taskId: TaskId | null }
  | { type: 'ensureTaskLayout'; taskId: TaskId }
  | { type: 'removeTaskLayout'; taskId: TaskId }
  | { type: 'toggleNavigator' }
  | { type: 'setNavigatorOpen'; open: boolean }
  | { type: 'toggleContextPanel' }
  | { type: 'openWorkSurface' }
  | { type: 'closeWorkSurface' }
  | { type: 'toggleWorkSurface' }
  | { type: 'activateTab'; tabId: WorkSurfaceTabId }
  | { type: 'resizeWorkSurface'; width: number }
  | { type: 'toggleMaximize' }
  | { type: 'exitMaximize' }
  | {
      type: 'hydratePointers'
      selectedProjectId: ProjectId
      selectedTaskId: TaskId | null
      lastTaskByProject?: Record<ProjectId, TaskId | null>
      navigatorOpen?: boolean
    }

export interface WorkbenchSessionCommands {
  selectProject: (projectId: ProjectId, taskId?: TaskId | null) => void
  selectTask: (taskId: TaskId | null) => void
  ensureTaskLayout: (taskId: TaskId) => void
  removeTaskLayout: (taskId: TaskId) => void
  toggleNavigator: () => void
  setNavigatorOpen: (open: boolean) => void
  toggleContextPanel: () => void
  openWorkSurface: () => void
  closeWorkSurface: () => void
  toggleWorkSurface: () => void
  activateTab: (tabId: WorkSurfaceTabId) => void
  resizeWorkSurface: (width: number) => void
  toggleMaximize: () => void
  exitMaximize: () => void
  hydratePointers: (input: {
    selectedProjectId: ProjectId
    selectedTaskId: TaskId | null
    lastTaskByProject?: Record<ProjectId, TaskId | null>
    navigatorOpen?: boolean
  }) => void
  dispatch: (command: WorkbenchSessionCommand) => void
}

export interface WorkbenchSessionController {
  view: WorkbenchSessionView
  commands: WorkbenchSessionCommands
}

/** Seed for session chrome only — no project/tasks arrays. */
export interface WorkbenchSessionSeed {
  selectedProjectId: ProjectId
  selectedTaskId?: TaskId | null
  lastTaskByProject?: Record<ProjectId, TaskId | null>
  workSurfaceTabs: WorkSurfaceTab[]
  workSurfaceMinWidth?: number
  workSurfaceMaxWidth?: number
  defaultWorkSurfaceWidth?: number
  navigatorOpen?: boolean
}
