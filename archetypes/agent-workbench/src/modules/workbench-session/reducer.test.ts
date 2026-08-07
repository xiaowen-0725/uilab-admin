import { describe, expect, it } from 'vitest'
import {
  createInitialSessionState,
  selectSessionView,
  workbenchSessionReducer,
} from './application/reducer'
import {
  WORK_SURFACE_MAX_WIDTH,
  WORK_SURFACE_MIN_WIDTH,
} from './model/constants'
import type { WorkbenchSessionSeed } from './model/types'

const seed: WorkbenchSessionSeed = {
  selectedProjectId: 'project-default',
  selectedTaskId: 'task-a',
  workSurfaceTabs: [
    { id: 'tab-layout', label: '布局规格.md' },
    { id: 'tab-browser', label: '浏览器预览' },
  ],
}

describe('workbenchSessionReducer (Module Implementation)', () => {
  it('allows null selectedTaskId on cold start', () => {
    const emptySeed: WorkbenchSessionSeed = {
      selectedProjectId: 'project-default',
      selectedTaskId: null,
      workSurfaceTabs: seed.workSurfaceTabs,
    }
    const state = createInitialSessionState(emptySeed)
    const view = selectSessionView(state)
    expect(view.selectedTaskId).toBeNull()
    expect(view.selectedProjectId).toBe('project-default')
    expect(view.isTaskOnly).toBe(true)
    expect(view.navigatorOpen).toBe(true)
  })

  it('selects a task and ensures layout', () => {
    const initial = createInitialSessionState({
      ...seed,
      selectedTaskId: null,
    })
    const next = workbenchSessionReducer(initial, {
      type: 'selectTask',
      taskId: 'task-new-1',
    })
    expect(next.selectedTaskId).toBe('task-new-1')
    expect(next.taskLayouts['task-new-1']).toBeDefined()
    expect(next.lastTaskByProject['project-default']).toBe('task-new-1')
  })

  it('starts Task-only with Context closed and Navigator open', () => {
    const state = createInitialSessionState(seed)
    const view = selectSessionView(state)

    expect(view.selectedTaskId).toBe('task-a')
    expect(view.isTaskOnly).toBe(true)
    expect(view.layout.workSurfaceVisible).toBe(false)
    expect(view.layout.contextPanelOpen).toBe(false)
    expect(view.layout.workSurfaceMaximized).toBe(false)
    expect(view.navigatorOpen).toBe(true)
  })

  it('restores independent per-Task layout when switching A → B → A', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'ensureTaskLayout',
      taskId: 'task-b',
    })

    state = workbenchSessionReducer(state, { type: 'openWorkSurface' })
    state = workbenchSessionReducer(state, {
      type: 'resizeWorkSurface',
      width: 640,
    })
    state = workbenchSessionReducer(state, { type: 'toggleContextPanel' })
    state = workbenchSessionReducer(state, {
      type: 'activateTab',
      tabId: 'tab-browser',
    })
    state = workbenchSessionReducer(state, { type: 'toggleMaximize' })

    const layoutA = selectSessionView(state).layout
    expect(layoutA.workSurfaceVisible).toBe(true)
    expect(layoutA.workSurfaceWidth).toBe(640)
    expect(layoutA.contextPanelOpen).toBe(true)
    expect(layoutA.activeTabId).toBe('tab-browser')
    expect(layoutA.workSurfaceMaximized).toBe(true)

    state = workbenchSessionReducer(state, {
      type: 'selectTask',
      taskId: 'task-b',
    })
    const layoutB = selectSessionView(state).layout
    expect(layoutB.workSurfaceVisible).toBe(false)
    expect(layoutB.contextPanelOpen).toBe(false)
    expect(layoutB.workSurfaceMaximized).toBe(false)
    expect(layoutB.activeTabId).toBe('tab-layout')

    state = workbenchSessionReducer(state, {
      type: 'selectTask',
      taskId: 'task-a',
    })
    const restored = selectSessionView(state).layout
    expect(restored.workSurfaceVisible).toBe(true)
    expect(restored.workSurfaceWidth).toBe(640)
    expect(restored.contextPanelOpen).toBe(true)
    expect(restored.activeTabId).toBe('tab-browser')
    expect(restored.workSurfaceMaximized).toBe(true)
  })

  it('clamps Work Surface width to declared min/max', () => {
    let state = createInitialSessionState(seed)

    state = workbenchSessionReducer(state, {
      type: 'resizeWorkSurface',
      width: 10,
    })
    expect(selectSessionView(state).layout.workSurfaceWidth).toBe(
      WORK_SURFACE_MIN_WIDTH,
    )

    state = workbenchSessionReducer(state, {
      type: 'resizeWorkSurface',
      width: 9999,
    })
    expect(selectSessionView(state).layout.workSurfaceWidth).toBe(
      WORK_SURFACE_MAX_WIDTH,
    )

    state = workbenchSessionReducer(state, {
      type: 'resizeWorkSurface',
      width: 500.7,
    })
    expect(selectSessionView(state).layout.workSurfaceWidth).toBe(501)
  })

  it('supports maximize and exitMaximize (Escape path)', () => {
    let state = createInitialSessionState(seed)

    state = workbenchSessionReducer(state, { type: 'openWorkSurface' })
    state = workbenchSessionReducer(state, { type: 'toggleMaximize' })
    expect(selectSessionView(state).layout.workSurfaceMaximized).toBe(true)

    state = workbenchSessionReducer(state, { type: 'exitMaximize' })
    expect(selectSessionView(state).layout.workSurfaceMaximized).toBe(false)

    state = workbenchSessionReducer(state, { type: 'exitMaximize' })
    expect(selectSessionView(state).layout.workSurfaceMaximized).toBe(false)
  })

  it('activates tabs and opens Work Surface if needed', () => {
    let state = createInitialSessionState(seed)
    expect(selectSessionView(state).layout.workSurfaceVisible).toBe(false)

    state = workbenchSessionReducer(state, {
      type: 'activateTab',
      tabId: 'tab-browser',
    })
    const view = selectSessionView(state)
    expect(view.layout.activeTabId).toBe('tab-browser')
    expect(view.layout.workSurfaceVisible).toBe(true)

    state = workbenchSessionReducer(state, {
      type: 'activateTab',
      tabId: 'missing',
    })
    expect(selectSessionView(state).layout.activeTabId).toBe('tab-browser')
  })

  it('toggles navigator and work surface visibility', () => {
    let state = createInitialSessionState(seed)

    state = workbenchSessionReducer(state, { type: 'toggleNavigator' })
    expect(selectSessionView(state).navigatorOpen).toBe(false)

    state = workbenchSessionReducer(state, { type: 'toggleWorkSurface' })
    expect(selectSessionView(state).layout.workSurfaceVisible).toBe(true)

    state = workbenchSessionReducer(state, { type: 'toggleMaximize' })
    state = workbenchSessionReducer(state, { type: 'toggleWorkSurface' })
    const closed = selectSessionView(state).layout
    expect(closed.workSurfaceVisible).toBe(false)
    expect(closed.workSurfaceMaximized).toBe(false)
  })

  it('switches project and restores lastTaskByProject', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'selectTask',
      taskId: 'task-a',
    })
    state = workbenchSessionReducer(state, {
      type: 'selectProject',
      projectId: 'project-b',
      taskId: 'task-x',
    })
    expect(state.selectedProjectId).toBe('project-b')
    expect(state.selectedTaskId).toBe('task-x')

    state = workbenchSessionReducer(state, {
      type: 'selectProject',
      projectId: 'project-default',
    })
    expect(state.selectedTaskId).toBe('task-a')
  })

  it('removes task layout on delete cleanup', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'removeTaskLayout',
      taskId: 'task-a',
    })
    expect(state.taskLayouts['task-a']).toBeUndefined()
  })
})
