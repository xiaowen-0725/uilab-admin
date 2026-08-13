import {
  WORK_SURFACE_DEFAULT_WIDTH,
  WORK_SURFACE_MAX_WIDTH,
  WORK_SURFACE_MIN_WIDTH,
} from '../model/constants'
import type {
  SurfaceKind,
  TaskId,
  TaskLayoutState,
  WorkbenchSessionCommand,
  WorkbenchSessionSeed,
  WorkbenchSessionState,
  WorkbenchSessionView,
  WorkSurfaceOpenFocus,
  WorkSurfaceOpenSource,
  WorkSurfaceTabId,
  WorkSurfaceTabRecord,
} from '../model/types'

function clampWidth(width: number, min: number, max: number): number {
  if (Number.isNaN(width)) return min
  return Math.min(max, Math.max(min, Math.round(width)))
}

function createDefaultLayout(defaultWidth: number): TaskLayoutState {
  return {
    contextPanelOpen: false,
    workSurfaceVisible: false,
    workSurfaceWidth: defaultWidth,
    openTabs: [],
    activeTabId: null,
    workSurfaceMaximized: false,
  }
}

/** Stable tab id for a (kind, resourceKey) pair within a Task. */
export function workSurfaceTabIdFor(
  kind: SurfaceKind,
  resourceKey: string,
): WorkSurfaceTabId {
  return `ws:${kind}:${resourceKey}`
}

function findTabByResource(
  openTabs: WorkSurfaceTabRecord[],
  kind: SurfaceKind,
  resourceKey: string,
): WorkSurfaceTabRecord | undefined {
  return openTabs.find((t) => t.kind === kind && t.resourceKey === resourceKey)
}

function findTabById(
  openTabs: WorkSurfaceTabRecord[],
  tabId: WorkSurfaceTabId,
): WorkSurfaceTabRecord | undefined {
  return openTabs.find((t) => t.tabId === tabId)
}

function resolveOpenFocus(
  source: WorkSurfaceOpenSource,
  paneVisible: boolean,
  focus?: WorkSurfaceOpenFocus,
): WorkSurfaceOpenFocus {
  if (focus) return focus
  if (source === 'user') return 'pane'
  // runtime default: activate only when pane already visible
  return paneVisible ? 'tab' : 'none'
}

function defaultTitle(resourceKey: string, title?: string): string {
  if (title && title.trim()) return title
  const segments = resourceKey.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? resourceKey
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

  const emptyLayout = createDefaultLayout(defaultWidth)
  const taskLayouts: Record<TaskId, TaskLayoutState> = {}
  const selectedTaskId = seed.selectedTaskId ?? null
  if (selectedTaskId) {
    taskLayouts[selectedTaskId] = createDefaultLayout(defaultWidth)
  }

  const lastTaskByProject: Record<string, string | null> = {
    ...(seed.lastTaskByProject ?? {}),
  }
  if (
    seed.selectedProjectId != null &&
    !(seed.selectedProjectId in lastTaskByProject)
  ) {
    lastTaskByProject[seed.selectedProjectId] = selectedTaskId
  }

  return {
    selectedProjectId: seed.selectedProjectId,
    selectedTaskId,
    lastTaskByProject,
    navigatorOpen: seed.navigatorOpen ?? true,
    taskLayouts,
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
      [taskId]: createDefaultLayout(defaultWidth),
    },
  }
}

function applyOpenFocus(
  tabId: WorkSurfaceTabId,
  focus: WorkSurfaceOpenFocus,
): Partial<TaskLayoutState> {
  switch (focus) {
    case 'pane':
      return {
        activeTabId: tabId,
        workSurfaceVisible: true,
        workSurfaceMaximized: false,
      }
    case 'tab':
      return {
        activeTabId: tabId,
        // keep visibility as-is (runtime: only when already visible)
      }
    case 'none':
      // Write selection memory only — do not open the pane (runtime default).
      return { activeTabId: tabId }
    default: {
      const _exhaustive: never = focus
      return _exhaustive
    }
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
      const lastTaskByProject = { ...state.lastTaskByProject }
      if (state.selectedProjectId) {
        lastTaskByProject[state.selectedProjectId] = taskId
      }
      let next: WorkbenchSessionState = {
        ...state,
        selectedTaskId: taskId,
        lastTaskByProject,
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
      // Close pane only — retain openTabs / activeTabId for restore.
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

    case 'openWorkSurfaceTab': {
      // No selected Task → open is a no-op (spec §4.4).
      if (!state.selectedTaskId) return state

      // Without Registry (ticket 02), kind is required to open.
      const kind = command.kind
      if (!kind) return state

      const resourceKey = command.resourceKey
      if (!resourceKey) return state

      const layout = requireSelectedLayout(state)
      const existing = findTabByResource(layout.openTabs, kind, resourceKey)
      const title = defaultTitle(resourceKey, command.title)
      const focus = resolveOpenFocus(
        command.source,
        layout.workSurfaceVisible,
        command.focus,
      )

      if (existing) {
        // Re-open same resource → activate (dedup); refresh title if provided.
        const openTabs =
          command.title && command.title !== existing.title
            ? layout.openTabs.map((t) =>
                t.tabId === existing.tabId ? { ...t, title: command.title! } : t,
              )
            : layout.openTabs
        return updateSelectedLayout(state, {
          openTabs,
          ...applyOpenFocus(existing.tabId, focus),
        })
      }

      const tabId = workSurfaceTabIdFor(kind, resourceKey)
      const record: WorkSurfaceTabRecord = {
        tabId,
        kind,
        resourceKey,
        title,
      }
      return updateSelectedLayout(state, {
        openTabs: [...layout.openTabs, record],
        ...applyOpenFocus(tabId, focus),
      })
    }

    case 'closeWorkSurfaceTab': {
      const layout = requireSelectedLayout(state)
      const index = layout.openTabs.findIndex((t) => t.tabId === command.tabId)
      if (index < 0) return state

      const openTabs = layout.openTabs.filter((t) => t.tabId !== command.tabId)

      if (openTabs.length === 0) {
        // No remaining tabs → close pane.
        return updateSelectedLayout(state, {
          openTabs: [],
          activeTabId: null,
          workSurfaceVisible: false,
          workSurfaceMaximized: false,
        })
      }

      let activeTabId = layout.activeTabId
      if (activeTabId === command.tabId) {
        // Prefer next tab, else previous.
        const next = openTabs[index] ?? openTabs[index - 1] ?? openTabs[0]
        activeTabId = next.tabId
      }

      return updateSelectedLayout(state, {
        openTabs,
        activeTabId,
      })
    }

    case 'activateTab': {
      const layout = requireSelectedLayout(state)
      if (!findTabById(layout.openTabs, command.tabId)) {
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
    workSurfaceTabs: layout.openTabs.map((t) => ({
      id: t.tabId,
      label: t.title,
    })),
    workSurfaceMinWidth: state.workSurfaceMinWidth,
    workSurfaceMaxWidth: state.workSurfaceMaxWidth,
    isTaskOnly: !layout.workSurfaceVisible,
    lastTaskByProject: state.lastTaskByProject,
  }
}
