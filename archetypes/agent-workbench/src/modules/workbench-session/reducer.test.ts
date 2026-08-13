import { describe, expect, it } from 'vitest'
import {
  createInitialSessionState,
  selectSessionView,
  workbenchSessionReducer,
  workSurfaceTabIdFor,
} from './application/reducer'
import {
  WORK_SURFACE_MAX_WIDTH,
  WORK_SURFACE_MIN_WIDTH,
} from './model/constants'
import type { WorkbenchSessionSeed } from './model/types'

const seed: WorkbenchSessionSeed = {
  selectedProjectId: 'project-default',
  selectedTaskId: 'task-a',
}

describe('workbenchSessionReducer (Module Implementation)', () => {
  it('allows null selectedTaskId on cold start', () => {
    const emptySeed: WorkbenchSessionSeed = {
      selectedProjectId: 'project-default',
      selectedTaskId: null,
    }
    const state = createInitialSessionState(emptySeed)
    const view = selectSessionView(state)
    expect(view.selectedTaskId).toBeNull()
    expect(view.selectedProjectId).toBe('project-default')
    expect(view.isTaskOnly).toBe(true)
    expect(view.navigatorOpen).toBe(true)
    expect(view.layout.openTabs).toEqual([])
    expect(view.workSurfaceTabs).toEqual([])
  })

  it('allows null selectedProjectId on Host cold start', () => {
    const emptySeed: WorkbenchSessionSeed = {
      selectedProjectId: null,
      selectedTaskId: null,
    }
    const state = createInitialSessionState(emptySeed)
    const view = selectSessionView(state)
    expect(view.selectedProjectId).toBeNull()
    expect(view.selectedTaskId).toBeNull()
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
    expect(next.taskLayouts['task-new-1']!.openTabs).toEqual([])
    expect(next.lastTaskByProject['project-default']).toBe('task-new-1')
  })

  it('starts Task-only with empty openTabs and Context closed', () => {
    const state = createInitialSessionState(seed)
    const view = selectSessionView(state)

    expect(view.selectedTaskId).toBe('task-a')
    expect(view.isTaskOnly).toBe(true)
    expect(view.layout.workSurfaceVisible).toBe(false)
    expect(view.layout.contextPanelOpen).toBe(false)
    expect(view.layout.workSurfaceMaximized).toBe(false)
    expect(view.layout.openTabs).toEqual([])
    expect(view.layout.activeTabId).toBeNull()
    expect(view.navigatorOpen).toBe(true)
  })

  it('opens a Work Surface tab (user): pane + activate, no maximize', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'docs/layout.md',
      title: '布局规格.md',
      source: 'user',
    })
    const view = selectSessionView(state)
    const tabId = workSurfaceTabIdFor('document', 'docs/layout.md')
    expect(view.layout.openTabs).toEqual([
      {
        tabId,
        kind: 'document',
        resourceKey: 'docs/layout.md',
        title: '布局规格.md',
      },
    ])
    expect(view.layout.activeTabId).toBe(tabId)
    expect(view.layout.workSurfaceVisible).toBe(true)
    expect(view.layout.workSurfaceMaximized).toBe(false)
    expect(view.workSurfaceTabs).toEqual([{ id: tabId, label: '布局规格.md' }])
  })

  it('dedupes (kind, resourceKey): re-open activates existing tab', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'docs/a.md',
      title: 'A',
      source: 'user',
    })
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'browser',
      resourceKey: 'https://example.com',
      title: '示例',
      source: 'user',
    })
    const browserId = workSurfaceTabIdFor('browser', 'https://example.com')
    expect(selectSessionView(state).layout.activeTabId).toBe(browserId)

    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'docs/a.md',
      source: 'user',
    })
    const layout = selectSessionView(state).layout
    expect(layout.openTabs).toHaveLength(2)
    expect(layout.activeTabId).toBe(
      workSurfaceTabIdFor('document', 'docs/a.md'),
    )
  })

  it('runtime open with hidden pane writes openTabs + active memory, not visible', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'secret.md',
      title: 'secret',
      source: 'runtime',
    })
    const tabId = workSurfaceTabIdFor('document', 'secret.md')
    const layout = selectSessionView(state).layout
    expect(layout.openTabs).toHaveLength(1)
    expect(layout.workSurfaceVisible).toBe(false)
    // activeTabId remembered so later openWorkSurface shows the right tab
    expect(layout.activeTabId).toBe(tabId)
  })

  it('runtime open with visible pane activates without maximizing', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, { type: 'openWorkSurface' })
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'test',
      resourceKey: 'fixture-1',
      title: 'Fixture',
      source: 'runtime',
    })
    const tabId = workSurfaceTabIdFor('test', 'fixture-1')
    const layout = selectSessionView(state).layout
    expect(layout.workSurfaceVisible).toBe(true)
    expect(layout.activeTabId).toBe(tabId)
    expect(layout.workSurfaceMaximized).toBe(false)
  })

  it('open is no-op when no selected Task', () => {
    let state = createInitialSessionState({
      selectedProjectId: 'project-default',
      selectedTaskId: null,
    })
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'x.md',
      source: 'user',
    })
    expect(selectSessionView(state).layout.openTabs).toEqual([])
    expect(state.emptyLayout.openTabs).toEqual([])
  })

  it('open is no-op without kind (Registry resolve is ticket 02)', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      resourceKey: 'x.md',
      source: 'user',
    })
    expect(selectSessionView(state).layout.openTabs).toEqual([])
  })

  it('closeWorkSurfaceTab removes tab; last tab closes pane', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'a.md',
      title: 'A',
      source: 'user',
    })
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'b.md',
      title: 'B',
      source: 'user',
    })
    const aId = workSurfaceTabIdFor('document', 'a.md')
    const bId = workSurfaceTabIdFor('document', 'b.md')
    expect(selectSessionView(state).layout.activeTabId).toBe(bId)

    state = workbenchSessionReducer(state, {
      type: 'closeWorkSurfaceTab',
      tabId: bId,
    })
    let layout = selectSessionView(state).layout
    expect(layout.openTabs.map((t) => t.tabId)).toEqual([aId])
    expect(layout.activeTabId).toBe(aId)
    expect(layout.workSurfaceVisible).toBe(true)

    state = workbenchSessionReducer(state, {
      type: 'closeWorkSurfaceTab',
      tabId: aId,
    })
    layout = selectSessionView(state).layout
    expect(layout.openTabs).toEqual([])
    expect(layout.activeTabId).toBeNull()
    expect(layout.workSurfaceVisible).toBe(false)
    expect(layout.workSurfaceMaximized).toBe(false)
  })

  it('close pane retains openTabs; re-open pane restores them', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'keep.md',
      title: 'Keep',
      source: 'user',
    })
    const tabId = workSurfaceTabIdFor('document', 'keep.md')
    state = workbenchSessionReducer(state, { type: 'closeWorkSurface' })
    let layout = selectSessionView(state).layout
    expect(layout.workSurfaceVisible).toBe(false)
    expect(layout.openTabs).toHaveLength(1)
    expect(layout.activeTabId).toBe(tabId)

    state = workbenchSessionReducer(state, { type: 'openWorkSurface' })
    layout = selectSessionView(state).layout
    expect(layout.workSurfaceVisible).toBe(true)
    expect(layout.openTabs[0]?.tabId).toBe(tabId)
    expect(layout.activeTabId).toBe(tabId)
  })

  it('restores independent per-Task openTabs when switching A → B → A', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'ensureTaskLayout',
      taskId: 'task-b',
    })

    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'browser',
      resourceKey: 'https://a.example',
      title: '浏览器预览',
      source: 'user',
    })
    state = workbenchSessionReducer(state, {
      type: 'resizeWorkSurface',
      width: 640,
    })
    state = workbenchSessionReducer(state, { type: 'toggleContextPanel' })
    state = workbenchSessionReducer(state, { type: 'toggleMaximize' })

    const layoutA = selectSessionView(state).layout
    const browserId = workSurfaceTabIdFor('browser', 'https://a.example')
    expect(layoutA.workSurfaceVisible).toBe(true)
    expect(layoutA.workSurfaceWidth).toBe(640)
    expect(layoutA.contextPanelOpen).toBe(true)
    expect(layoutA.activeTabId).toBe(browserId)
    expect(layoutA.openTabs).toHaveLength(1)
    expect(layoutA.workSurfaceMaximized).toBe(true)

    state = workbenchSessionReducer(state, {
      type: 'selectTask',
      taskId: 'task-b',
    })
    const layoutB = selectSessionView(state).layout
    expect(layoutB.workSurfaceVisible).toBe(false)
    expect(layoutB.contextPanelOpen).toBe(false)
    expect(layoutB.workSurfaceMaximized).toBe(false)
    expect(layoutB.openTabs).toEqual([])
    expect(layoutB.activeTabId).toBeNull()

    state = workbenchSessionReducer(state, {
      type: 'selectTask',
      taskId: 'task-a',
    })
    const restored = selectSessionView(state).layout
    expect(restored.workSurfaceVisible).toBe(true)
    expect(restored.workSurfaceWidth).toBe(640)
    expect(restored.contextPanelOpen).toBe(true)
    expect(restored.activeTabId).toBe(browserId)
    expect(restored.openTabs).toHaveLength(1)
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

  it('activates tabs only when present in openTabs; opens pane', () => {
    let state = createInitialSessionState(seed)
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'a.md',
      title: 'A',
      source: 'user',
    })
    state = workbenchSessionReducer(state, {
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'b.md',
      title: 'B',
      source: 'user',
    })
    const aId = workSurfaceTabIdFor('document', 'a.md')
    const bId = workSurfaceTabIdFor('document', 'b.md')

    state = workbenchSessionReducer(state, { type: 'closeWorkSurface' })
    expect(selectSessionView(state).layout.workSurfaceVisible).toBe(false)

    state = workbenchSessionReducer(state, {
      type: 'activateTab',
      tabId: aId,
    })
    const view = selectSessionView(state)
    expect(view.layout.activeTabId).toBe(aId)
    expect(view.layout.workSurfaceVisible).toBe(true)

    state = workbenchSessionReducer(state, {
      type: 'activateTab',
      tabId: 'missing',
    })
    expect(selectSessionView(state).layout.activeTabId).toBe(aId)

    state = workbenchSessionReducer(state, {
      type: 'activateTab',
      tabId: bId,
    })
    expect(selectSessionView(state).layout.activeTabId).toBe(bId)
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
      type: 'openWorkSurfaceTab',
      kind: 'document',
      resourceKey: 'gone.md',
      source: 'user',
    })
    expect(state.taskLayouts['task-a']!.openTabs).toHaveLength(1)

    state = workbenchSessionReducer(state, {
      type: 'removeTaskLayout',
      taskId: 'task-a',
    })
    expect(state.taskLayouts['task-a']).toBeUndefined()
  })
})
