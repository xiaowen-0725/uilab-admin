/** Public view/command types for Workbench Session (Phase 3 static fixture). */

export type TaskId = string
export type WorkSurfaceTabId = string

export interface ProjectSummary {
  id: string
  name: string
}

export interface TaskSummary {
  id: TaskId
  title: string
  subtitle?: string
}

export interface WorkSurfaceTab {
  id: WorkSurfaceTabId
  label: string
}

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

export interface WorkbenchSessionState {
  project: ProjectSummary
  tasks: TaskSummary[]
  selectedTaskId: TaskId
  navigatorOpen: boolean
  taskLayouts: Record<TaskId, TaskLayoutState>
  workSurfaceTabs: WorkSurfaceTab[]
  workSurfaceMinWidth: number
  workSurfaceMaxWidth: number
}

/** Read-only view model consumed by Shell and Module UIs. */
export interface WorkbenchSessionView {
  project: ProjectSummary
  tasks: TaskSummary[]
  selectedTaskId: TaskId
  selectedTask: TaskSummary
  navigatorOpen: boolean
  layout: TaskLayoutState
  workSurfaceTabs: WorkSurfaceTab[]
  workSurfaceMinWidth: number
  workSurfaceMaxWidth: number
  /** True when the currently selected Task is Task-only (Work Surface closed). */
  isTaskOnly: boolean
}

export type WorkbenchSessionCommand =
  | { type: 'selectTask'; taskId: TaskId }
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

export interface WorkbenchSessionCommands {
  selectTask: (taskId: TaskId) => void
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
  dispatch: (command: WorkbenchSessionCommand) => void
}

export interface WorkbenchSessionController {
  view: WorkbenchSessionView
  commands: WorkbenchSessionCommands
}

export interface WorkbenchSessionSeed {
  project: ProjectSummary
  tasks: TaskSummary[]
  selectedTaskId: TaskId
  workSurfaceTabs: WorkSurfaceTab[]
  workSurfaceMinWidth?: number
  workSurfaceMaxWidth?: number
  defaultWorkSurfaceWidth?: number
}
