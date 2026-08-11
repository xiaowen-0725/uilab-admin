/**
 * Workbench Session — selection pointers + per-task layout chrome only.
 * Project/Task directory arrays live in modules/project.
 */

export type TaskId = string
export type ProjectId = string
export type WorkSurfaceTabId = string
/** Registered surface type id (document / browser / test / …). */
export type SurfaceKind = string

/**
 * One open Work Surface tab for a Task.
 * Dedup key within a Task: (kind, resourceKey).
 */
export interface WorkSurfaceTabRecord {
  tabId: WorkSurfaceTabId
  kind: SurfaceKind
  resourceKey: string
  title: string
}

/**
 * Host chrome tab shape (id + label). Derived from openTabs for Host display.
 * Not the session truth source for "what is open".
 */
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
  /** Task-scoped open Work Surface tabs (truth for "what is open"). */
  openTabs: WorkSurfaceTabRecord[]
  /** Active tab among openTabs; null only when openTabs is empty. */
  activeTabId: WorkSurfaceTabId | null
  workSurfaceMaximized: boolean
}

export interface WorkbenchSessionState {
  selectedProjectId: ProjectId
  /** null when cold-start empty shell or all tasks deleted. */
  selectedTaskId: TaskId | null
  /** Last selected task per project (for switch restore). */
  lastTaskByProject: Record<ProjectId, TaskId | null>
  navigatorOpen: boolean
  taskLayouts: Record<TaskId, TaskLayoutState>
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
  /**
   * Host chrome tabs derived from layout.openTabs.
   * Not a global seed — empty when the selected task has no open tabs.
   */
  workSurfaceTabs: WorkSurfaceTab[]
  workSurfaceMinWidth: number
  workSurfaceMaxWidth: number
  /** True when Work Surface is closed (or no task). */
  isTaskOnly: boolean
  lastTaskByProject: Record<ProjectId, TaskId | null>
}

export type WorkSurfaceOpenFocus = 'pane' | 'tab' | 'none'
export type WorkSurfaceOpenSource = 'user' | 'runtime'

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
  | {
      type: 'openWorkSurfaceTab'
      kind?: SurfaceKind
      resourceKey: string
      title?: string
      focus?: WorkSurfaceOpenFocus
      source: WorkSurfaceOpenSource
    }
  | { type: 'closeWorkSurfaceTab'; tabId: WorkSurfaceTabId }
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
  openWorkSurfaceTab: (input: {
    kind?: SurfaceKind
    resourceKey: string
    title?: string
    focus?: WorkSurfaceOpenFocus
    source: WorkSurfaceOpenSource
  }) => void
  closeWorkSurfaceTab: (tabId: WorkSurfaceTabId) => void
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

/** Seed for session chrome only — no project/tasks arrays, no global open tabs. */
export interface WorkbenchSessionSeed {
  selectedProjectId: ProjectId
  selectedTaskId?: TaskId | null
  lastTaskByProject?: Record<ProjectId, TaskId | null>
  workSurfaceMinWidth?: number
  workSurfaceMaxWidth?: number
  defaultWorkSurfaceWidth?: number
  navigatorOpen?: boolean
}
