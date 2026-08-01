import {
  WORK_SURFACE_DEFAULT_WIDTH,
  WORK_SURFACE_MAX_WIDTH,
  WORK_SURFACE_MIN_WIDTH,
} from '../model/constants'
import type {
  TaskId,
  TaskLayoutState,
  WorkbenchSessionCommand,
  WorkbenchSessionSeed,
  WorkbenchSessionState,
  WorkbenchSessionView,
  WorkSurfaceTabId,
} from '../model/types'

function clampWidth(width: number, min: number, max: number): number {
  if (Number.isNaN(width)) return min
  return Math.min(max, Math.max(min, Math.round(width)))
}

function createDefaultLayout(
  tabs: { id: WorkSurfaceTabId }[],
  defaultWidth: number
): TaskLayoutState {
  const firstTab = tabs[0]?.id ?? 'tab-1'
  return {
    contextPanelOpen: false,
    workSurfaceVisible: false,
    workSurfaceWidth: defaultWidth,
    activeTabId: firstTab,
    workSurfaceMaximized: false,
  }
}

/**
 * Build initial session state from static fixture seed.
 * New tasks start Task-only (Work Surface closed, Context closed).
 */
export function createInitialSessionState(
  seed: WorkbenchSessionSeed
): WorkbenchSessionState {
  const min = seed.workSurfaceMinWidth ?? WORK_SURFACE_MIN_WIDTH
  const max = seed.workSurfaceMaxWidth ?? WORK_SURFACE_MAX_WIDTH
  const defaultWidth = clampWidth(
    seed.defaultWorkSurfaceWidth ?? WORK_SURFACE_DEFAULT_WIDTH,
    min,
    max
  )

  if (seed.tasks.length === 0) {
    throw new Error('Workbench Session seed requires at least one Task')
  }

  const selected =
    seed.tasks.find((t) => t.id === seed.selectedTaskId) ?? seed.tasks[0]

  const taskLayouts: Record<TaskId, TaskLayoutState> = {}
  for (const task of seed.tasks) {
    taskLayouts[task.id] = createDefaultLayout(seed.workSurfaceTabs, defaultWidth)
  }

  return {
    project: seed.project,
    tasks: seed.tasks,
    selectedTaskId: selected.id,
    navigatorOpen: true,
    taskLayouts,
    workSurfaceTabs: seed.workSurfaceTabs,
    workSurfaceMinWidth: min,
    workSurfaceMaxWidth: max,
  }
}

function requireLayout(
  state: WorkbenchSessionState,
  taskId: TaskId
): TaskLayoutState {
  const layout = state.taskLayouts[taskId]
  if (!layout) {
    throw new Error(`Missing layout for task ${taskId}`)
  }
  return layout
}

function updateSelectedLayout(
  state: WorkbenchSessionState,
  patch: Partial<TaskLayoutState>
): WorkbenchSessionState {
  const taskId = state.selectedTaskId
  const current = requireLayout(state, taskId)
  return {
    ...state,
    taskLayouts: {
      ...state.taskLayouts,
      [taskId]: { ...current, ...patch },
    },
  }
}

/**
 * Pure session reducer — primary unit-test surface for layout commands.
 */
export function workbenchSessionReducer(
  state: WorkbenchSessionState,
  command: WorkbenchSessionCommand
): WorkbenchSessionState {
  switch (command.type) {
    case 'selectTask': {
      if (!state.tasks.some((t) => t.id === command.taskId)) {
        return state
      }
      if (command.taskId === state.selectedTaskId) {
        return state
      }
      // Leaving a maximized task should not leave global UI stuck; layout is per-task.
      return {
        ...state,
        selectedTaskId: command.taskId,
      }
    }

    case 'toggleNavigator':
      return { ...state, navigatorOpen: !state.navigatorOpen }

    case 'setNavigatorOpen':
      return { ...state, navigatorOpen: command.open }

    case 'toggleContextPanel': {
      const layout = requireLayout(state, state.selectedTaskId)
      return updateSelectedLayout(state, {
        contextPanelOpen: !layout.contextPanelOpen,
      })
    }

    case 'openWorkSurface': {
      const layout = requireLayout(state, state.selectedTaskId)
      if (layout.workSurfaceVisible) return state
      return updateSelectedLayout(state, {
        workSurfaceVisible: true,
        workSurfaceMaximized: false,
      })
    }

    case 'closeWorkSurface': {
      const layout = requireLayout(state, state.selectedTaskId)
      if (!layout.workSurfaceVisible) return state
      return updateSelectedLayout(state, {
        workSurfaceVisible: false,
        workSurfaceMaximized: false,
      })
    }

    case 'toggleWorkSurface': {
      const layout = requireLayout(state, state.selectedTaskId)
      if (layout.workSurfaceVisible) {
        return updateSelectedLayout(state, {
          workSurfaceVisible: false,
          workSurfaceMaximized: false,
        })
      }
      return updateSelectedLayout(state, {
        workSurfaceVisible: true,
        workSurfaceMaximized: false,
      })
    }

    case 'activateTab': {
      if (!state.workSurfaceTabs.some((t) => t.id === command.tabId)) {
        return state
      }
      // Activating a tab implies Work Surface is open.
      return updateSelectedLayout(state, {
        activeTabId: command.tabId,
        workSurfaceVisible: true,
      })
    }

    case 'resizeWorkSurface': {
      const width = clampWidth(
        command.width,
        state.workSurfaceMinWidth,
        state.workSurfaceMaxWidth
      )
      return updateSelectedLayout(state, { workSurfaceWidth: width })
    }

    case 'toggleMaximize': {
      const layout = requireLayout(state, state.selectedTaskId)
      if (!layout.workSurfaceVisible) {
        // Maximize only applies when host is visible.
        return updateSelectedLayout(state, {
          workSurfaceVisible: true,
          workSurfaceMaximized: true,
        })
      }
      return updateSelectedLayout(state, {
        workSurfaceMaximized: !layout.workSurfaceMaximized,
      })
    }

    case 'exitMaximize': {
      const layout = requireLayout(state, state.selectedTaskId)
      if (!layout.workSurfaceMaximized) return state
      return updateSelectedLayout(state, { workSurfaceMaximized: false })
    }

    default: {
      const _exhaustive: never = command
      return _exhaustive
    }
  }
}

export function selectSessionView(
  state: WorkbenchSessionState
): WorkbenchSessionView {
  const selectedTask =
    state.tasks.find((t) => t.id === state.selectedTaskId) ?? state.tasks[0]
  const layout = requireLayout(state, selectedTask.id)

  return {
    project: state.project,
    tasks: state.tasks,
    selectedTaskId: selectedTask.id,
    selectedTask,
    navigatorOpen: state.navigatorOpen,
    layout,
    workSurfaceTabs: state.workSurfaceTabs,
    workSurfaceMinWidth: state.workSurfaceMinWidth,
    workSurfaceMaxWidth: state.workSurfaceMaxWidth,
    isTaskOnly: !layout.workSurfaceVisible,
  }
}
