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
  defaultWidth: number,
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
 * Build initial session state. selectedTaskId may be null (empty shell).
 */
export function createInitialSessionState(
  seed: WorkbenchSessionSeed,
): WorkbenchSessionState {
  const min = seed.workSurfaceMinWidth ?? WORK_SURFACE_MIN_WIDTH
  const max = seed.workSurfaceMaxWidth ?? WORK_SURFACE_MAX_WIDTH
  const defaultWidth = clampWidth(
    seed.defaultWorkSurfaceWidth ?? WORK_SURFACE_DEFAULT_WIDTH,
    min,
    max,
  )

  const emptyLayout = createDefaultLayout(seed.workSurfaceTabs, defaultWidth)
  const taskLayouts: Record<TaskId, TaskLayoutState> = {}
  const selectedTaskId = seed.selectedTaskId ?? null
  if (selectedTaskId) {
    taskLayouts[selectedTaskId] = createDefaultLayout(
      seed.workSurfaceTabs,
      defaultWidth,
    )
  }

  const lastTaskByProject: Record<string, string | null> = {
    ...(seed.lastTaskByProject ?? {}),
  }
  if (!(seed.selectedProjectId in lastTaskByProject)) {
    lastTaskByProject[seed.selectedProjectId] = selectedTaskId
  }

  return {
    selectedProjectId: seed.selectedProjectId,
    selectedTaskId,
    lastTaskByProject,
    navigatorOpen: seed.navigatorOpen ?? true,
    taskLayouts,
    workSurfaceTabs: seed.workSurfaceTabs,
    workSurfaceMinWidth: min,
    workSurfaceMaxWidth: max,
    emptyLayout,
  }
}

function requireSelectedLayout(
  state: WorkbenchSessionState,
): TaskLayoutState {
  const taskId = state.selectedTaskId
  if (!taskId) return state.emptyLayout
  return state.taskLayouts[taskId] ?? state.emptyLayout
}

function updateSelectedLayout(
  state: WorkbenchSessionState,
  patch: Partial<TaskLayoutState>,
): WorkbenchSessionState {
  const taskId = state.selectedTaskId
  if (!taskId) {
    return {
      ...state,
      emptyLayout: { ...state.emptyLayout, ...patch },
    }
  }
  const current = state.taskLayouts[taskId] ?? state.emptyLayout
  return {
    ...state,
    taskLayouts: {
      ...state.taskLayouts,
      [taskId]: { ...current, ...patch },
    },
  }
}

function ensureLayout(
  state: WorkbenchSessionState,
  taskId: TaskId,
): WorkbenchSessionState {
  if (state.taskLayouts[taskId]) return state
  const defaultWidth = clampWidth(
    WORK_SURFACE_DEFAULT_WIDTH,
    state.workSurfaceMinWidth,
    state.workSurfaceMaxWidth,
  )
  return {
    ...state,
    taskLayouts: {
      ...state.taskLayouts,
      [taskId]: createDefaultLayout(state.workSurfaceTabs, defaultWidth),
    },
  }
}

/**
 * Pure session reducer — layout + selection pointers only.
 */
export function workbenchSessionReducer(
  state: WorkbenchSessionState,
  command: WorkbenchSessionCommand,
): WorkbenchSessionState {
  switch (command.type) {
    case 'hydratePointers': {
      let next = { ...state }
      next.selectedProjectId = command.selectedProjectId
      next.selectedTaskId = command.selectedTaskId
      if (command.lastTaskByProject) {
        next.lastTaskByProject = { ...command.lastTaskByProject }
      }
      if (command.navigatorOpen != null) {
        next.navigatorOpen = command.navigatorOpen
      }
      if (command.selectedTaskId) {
        next = ensureLayout(next, command.selectedTaskId)
      }
      return next
    }

    case 'selectProject': {
      const projectId = command.projectId
      if (
        projectId === state.selectedProjectId &&
        command.taskId === undefined
      ) {
        return state
      }
      const taskId =
        command.taskId !== undefined
          ? command.taskId
          : (state.lastTaskByProject[projectId] ?? null)
      let next: WorkbenchSessionState = {
        ...state,
        selectedProjectId: projectId,
        selectedTaskId: taskId,
        lastTaskByProject: {
          ...state.lastTaskByProject,
          [projectId]: taskId,
        },
      }
      if (taskId) next = ensureLayout(next, taskId)
      return next
    }

    case 'selectTask': {
      const taskId = command.taskId
      if (taskId === state.selectedTaskId) return state
      let next: WorkbenchSessionState = {
        ...state,
        selectedTaskId: taskId,
        lastTaskByProject: {
          ...state.lastTaskByProject,
          [state.selectedProjectId]: taskId,
        },
      }
      if (taskId) next = ensureLayout(next, taskId)
      return next
    }

    case 'ensureTaskLayout':
      return ensureLayout(state, command.taskId)

    case 'removeTaskLayout': {
      if (!state.taskLayouts[command.taskId]) return state
      const { [command.taskId]: _, ...rest } = state.taskLayouts
      return { ...state, taskLayouts: rest }
    }

    case 'toggleNavigator':
      return { ...state, navigatorOpen: !state.navigatorOpen }

    case 'setNavigatorOpen':
      return { ...state, navigatorOpen: command.open }

    case 'toggleContextPanel': {
      const layout = requireSelectedLayout(state)
      return updateSelectedLayout(state, {
        contextPanelOpen: !layout.contextPanelOpen,
      })
    }

    case 'openWorkSurface': {
      const layout = requireSelectedLayout(state)
      if (layout.workSurfaceVisible) return state
      return updateSelectedLayout(state, {
        workSurfaceVisible: true,
        workSurfaceMaximized: false,
      })
    }

    case 'closeWorkSurface': {
      const layout = requireSelectedLayout(state)
      if (!layout.workSurfaceVisible) return state
      return updateSelectedLayout(state, {
        workSurfaceVisible: false,
        workSurfaceMaximized: false,
      })
    }

    case 'toggleWorkSurface': {
      const layout = requireSelectedLayout(state)
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
      return updateSelectedLayout(state, {
        activeTabId: command.tabId,
        workSurfaceVisible: true,
      })
    }

    case 'resizeWorkSurface': {
      const width = clampWidth(
        command.width,
        state.workSurfaceMinWidth,
        state.workSurfaceMaxWidth,
      )
      return updateSelectedLayout(state, { workSurfaceWidth: width })
    }

    case 'toggleMaximize': {
      const layout = requireSelectedLayout(state)
      if (!layout.workSurfaceVisible) {
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
      const layout = requireSelectedLayout(state)
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
  state: WorkbenchSessionState,
): WorkbenchSessionView {
  const layout = requireSelectedLayout(state)
  return {
    selectedProjectId: state.selectedProjectId,
    selectedTaskId: state.selectedTaskId,
    navigatorOpen: state.navigatorOpen,
    layout,
    workSurfaceTabs: state.workSurfaceTabs,
    workSurfaceMinWidth: state.workSurfaceMinWidth,
    workSurfaceMaxWidth: state.workSurfaceMaxWidth,
    isTaskOnly: !layout.workSurfaceVisible,
    lastTaskByProject: state.lastTaskByProject,
  }
}
