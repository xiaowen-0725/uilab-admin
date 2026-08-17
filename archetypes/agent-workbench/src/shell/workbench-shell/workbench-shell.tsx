import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject, ReactNode, TransitionEvent } from 'react'
import {
  BoardWorkspace,
  type BoardStorePort,
} from '@/modules/board'
import {
  CapabilityManagementSurface,
  type CapabilityController,
} from '@/modules/capabilities'
import type { NavigatorProjectGroup, TaskSummary } from '@/modules/project'
import type {
  LaunchAction,
  TaskSurfaceComposerRuntime,
  TaskSurfaceView,
  TimelineOpenFileRef,
} from '@/modules/task'
import { TaskSurface } from '@/modules/task'
import { WorkSurfaceHost, type SurfaceRegistry } from '@/modules/work-surface'
import type {
  WorkbenchSessionCommands,
  WorkbenchSessionView,
} from '@/modules/workbench-session'
import {
  FolderIcon,
  PanelBottom,
  PanelLeftIcon,
  SlidersHorizontal,
} from 'lucide-react'
import { ToolbarIconButton } from '@/components/toolbar-icon-button'
import { Navigator } from '../navigator/navigator'
import {
  TASK_SURFACE_MIN_WIDTH,
  WORK_SURFACE_MIN_WIDTH,
  computeEffectiveWorkMax,
} from '../responsive-layout/geometry'
import { useStageWidth } from '../responsive-layout/use-stage-width'
import { useViewportMode } from '../responsive-layout/use-viewport-mode'
import {
  SettingsDialog,
  type SettingsSectionId,
} from '../settings/settings-dialog'
import { useWorkbenchShortcuts } from './use-workbench-shortcuts'
import { useThemePreference } from '../theme/theme-provider'
import {
  TASK_DESTINATION,
  isTaskDestination,
  type ShellDestination,
} from '../destination'

/** Shell-owned motion modality — never stored in Session. */
export type MotionSource = 'animated' | 'instant'
export type NavMotionSource = MotionSource
export type ContextMotionSource = MotionSource
/** Phase 3B: animated vs instant only (data-pane-motion). */
export type PaneMotionSource = MotionSource

/**
 * Shell-owned Work drawer action — drives CSS duration/easing only
 * (data-pane-transition). Never stored in Session.
 */
export type PaneTransition =
  | 'open'
  | 'close'
  | 'maximize'
  | 'restore'
  | 'instant'

/**
 * Task flex constraints for split layout.
 * - No maxWidth: Work right edge is fixed; Task must fill left remainder during drawer growth.
 * - During width animation, minWidth is 0 so restore/maximize cannot push Stage.
 * - After width transition ends (instant), restore TASK_SURFACE_MIN_WIDTH; final geometry unchanged.
 * - full-stage / hidden: sideBySide false → no inline minWidth.
 */
function getTaskPaneStyle(
  sideBySide: boolean,
  widthAnimating: boolean
): CSSProperties | undefined {
  if (!sideBySide) return undefined
  return {
    minWidth: widthAnimating ? 0 : TASK_SURFACE_MIN_WIDTH,
  }
}

function workDrawerWidth(
  visible: boolean,
  fullStage: boolean,
  effectiveWorkWidth: number,
  stageWidth: number
): number | string {
  if (!visible) return 0
  if (fullStage) return stageWidth > 0 ? stageWidth : '100%'
  return effectiveWorkWidth
}

export interface WorkbenchShellProps {
  view: WorkbenchSessionView
  commands: WorkbenchSessionCommands
  /** Assembled Task view from Composition Root; null when no selected task. */
  taskView: TaskSurfaceView | null
  /** Unspecified-project conversations for the flat 任务 list. */
  looseTasks: TaskSummary[]
  /** User-specified work projects (opened/created) with nested tasks. */
  projectGroups: NavigatorProjectGroup[]
  busyTaskIds?: ReadonlySet<string>
  onLaunchAction?: (action: LaunchAction) => void
  onNewChat?: () => void
  onSelectTask?: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
  onRemoveProject?: (projectId: string) => void
  onNewProjectChat?: (projectId: string) => void
  projectActionError?: string | null
  /** Runtime composer props for product Runtime path. */
  composerRuntime?: TaskSurfaceComposerRuntime
  /** Capability catalog controller assembled by Composition Root. */
  capabilityController?: CapabilityController | null
  /**
   * Surface Registry from Composition Root only.
   * Shell/Host never register; Host only resolves render by kind.
   */
  surfaceRegistry: SurfaceRegistry
  /**
   * User channel: Timeline file chip/card → Composition → Session openWorkSurfaceTab.
   */
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  /**
   * Composition-owned empty Work Surface actions (e.g. bind local folder).
   * Shell/Host only pass-through; no folder policy in Shell.
   */
  workSurfaceEmptyExtra?: ReactNode
  /**
   * Composition-owned Work toolbar trailing chrome (e.g. restore demo docs when bound).
   * Shell/Host only pass-through.
   */
  workSurfaceToolbarTrailing?: ReactNode
  boardStore?: BoardStorePort | null
  taskExists?: (taskId: string) => boolean
  boardOpenerRef?: MutableRefObject<((boardId?: string) => void) | null>
}

/**
 * Shell owns geometry, Navigator, responsive layout, focus order, shortcuts,
 * and pointer vs keyboard motion source for Navigator / Context / Work chrome.
 * Consumes Module root Interfaces only. Task fixture assembly stays in Composition Root.
 */
export function WorkbenchShell({
  view,
  commands,
  taskView,
  looseTasks,
  projectGroups,
  busyTaskIds,
  onLaunchAction,
  onNewChat,
  onSelectTask,
  onDeleteTask,
  onRemoveProject,
  onNewProjectChat,
  projectActionError = null,
  composerRuntime,
  capabilityController,
  surfaceRegistry,
  onOpenFileRef,
  workSurfaceEmptyExtra,
  workSurfaceToolbarTrailing,
  boardStore = null,
  taskExists = () => false,
  boardOpenerRef,
}: WorkbenchShellProps) {
  const viewport = useViewportMode()
  const { resolvedDark } = useThemePreference()
  const boardTheme = resolvedDark ? 'dark' : 'light'
  const [navMotion, setNavMotion] = useState<NavMotionSource>('instant')
  const [contextMotion, setContextMotion] =
    useState<ContextMotionSource>('instant')
  const [paneMotionSource, setPaneMotionSource] =
    useState<PaneMotionSource>('instant')
  const [paneTransition, setPaneTransition] =
    useState<PaneTransition>('instant')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeDestination, setActiveDestination] =
    useState<ShellDestination>(TASK_DESTINATION)
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>('profile')

  const openSettings = useCallback(() => {
    setSettingsSection('profile')
    setSettingsOpen(true)
  }, [])

  const closeOverlayNav = useCallback(() => {
    if (viewport !== 'wide' && view.navigatorOpen) {
      setNavMotion('instant')
      commands.setNavigatorOpen(false)
    }
  }, [commands, viewport, view.navigatorOpen])

  const openCapabilities = useCallback(() => {
    setActiveDestination({ kind: 'capabilities' })
    closeOverlayNav()
  }, [closeOverlayNav])

  const showTask = useCallback(() => {
    setActiveDestination(TASK_DESTINATION)
  }, [])

  const openBoard = useCallback((boardId?: string) => {
    setActiveDestination({ kind: 'board', boardId })
    closeOverlayNav()
  }, [closeOverlayNav])

  useEffect(() => {
    if (!boardOpenerRef) return
    boardOpenerRef.current = openBoard
    return () => {
      boardOpenerRef.current = null
    }
  }, [boardOpenerRef, openBoard])

  const startNewChatFromShell = useCallback(() => {
    showTask()
    onNewChat?.()
  }, [onNewChat, showTask])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const setPaneInstant = useCallback(() => {
    setPaneMotionSource('instant')
    setPaneTransition('instant')
  }, [])

  const setPanePointerAction = useCallback(
    (action: Exclude<PaneTransition, 'instant'>) => {
      setPaneMotionSource('animated')
      setPaneTransition(action)
    },
    []
  )

  const toggleNavigatorFromPointer = useCallback(() => {
    setNavMotion('animated')
    commands.toggleNavigator()
  }, [commands])

  const toggleNavigatorFromKeyboard = useCallback(() => {
    setNavMotion('instant')
    commands.toggleNavigator()
  }, [commands])

  const toggleContextFromPointer = useCallback(() => {
    // Open: subtle entry; close: immediate (CSS has no exit transition).
    setContextMotion(view.layout.contextPanelOpen ? 'instant' : 'animated')
    commands.toggleContextPanel()
  }, [commands, view.layout.contextPanelOpen])

  const toggleContextFromKeyboard = useCallback(() => {
    setContextMotion('instant')
    commands.toggleContextPanel()
  }, [commands])

  const toggleWorkFromPointer = useCallback(() => {
    setPanePointerAction(view.layout.workSurfaceVisible ? 'close' : 'open')
    commands.toggleWorkSurface()
  }, [commands, setPanePointerAction, view.layout.workSurfaceVisible])

  const toggleWorkFromKeyboard = useCallback(() => {
    setPaneInstant()
    commands.toggleWorkSurface()
  }, [commands, setPaneInstant])

  const closeWorkFromPointer = useCallback(() => {
    setPanePointerAction('close')
    commands.closeWorkSurface()
  }, [commands, setPanePointerAction])

  const toggleMaximizeFromPointer = useCallback(() => {
    setPanePointerAction(
      view.layout.workSurfaceMaximized ? 'restore' : 'maximize'
    )
    commands.toggleMaximize()
  }, [commands, setPanePointerAction, view.layout.workSurfaceMaximized])

  const exitMaximizeFromKeyboard = useCallback(() => {
    setPaneInstant()
    commands.exitMaximize()
  }, [commands, setPaneInstant])

  const resizeWorkFromPointer = useCallback(
    (width: number) => {
      // Drag/keyboard resize must not inherit open/maximize transition duration.
      setPaneInstant()
      commands.resizeWorkSurface(width)
    },
    [commands, setPaneInstant]
  )

  /** Task select: mark context/pane instant so restored layout never plays entry. */
  const selectTaskFromShell = useCallback(
    (taskId: string) => {
      showTask()
      setContextMotion('instant')
      setPaneInstant()
      if (onSelectTask) onSelectTask(taskId)
      else commands.selectTask(taskId)
    },
    [commands, onSelectTask, setPaneInstant, showTask]
  )

  /** Slot width only — ignore bubbled child transitions. */
  const handleWorkDrawerTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) return
      if (event.propertyName !== 'width') return
      setPaneInstant()
    },
    [setPaneInstant]
  )

  useWorkbenchShortcuts(view, {
    onToggleNavigatorKeyboard: toggleNavigatorFromKeyboard,
    onToggleContextKeyboard: toggleContextFromKeyboard,
    onToggleWorkKeyboard: toggleWorkFromKeyboard,
    onExitMaximizeKeyboard: exitMaximizeFromKeyboard,
  })

  const stageRef = useRef<HTMLElement>(null)
  const stageWidth = useStageWidth(stageRef)
  const autoClosedNavForNonWideRef = useRef(false)

  const navigatorMode = viewport === 'wide' ? 'reserved' : 'overlay'

  // Entering medium/narrow: auto-close Navigator once if open (instant, not pointer).
  useEffect(() => {
    if (viewport === 'wide') {
      autoClosedNavForNonWideRef.current = false
      return
    }
    if (!autoClosedNavForNonWideRef.current && view.navigatorOpen) {
      autoClosedNavForNonWideRef.current = true
      setNavMotion('instant')
      commands.setNavigatorOpen(false)
    }
  }, [viewport, view.navigatorOpen, commands])

  const workFullStage =
    view.layout.workSurfaceMaximized ||
    (viewport === 'narrow' && view.layout.workSurfaceVisible)

  const sideBySide = view.layout.workSurfaceVisible && !workFullStage

  const sessionMax = view.workSurfaceMaxWidth
  const effectiveWorkMax = sideBySide
    ? computeEffectiveWorkMax(
        stageWidth,
        sessionMax,
        TASK_SURFACE_MIN_WIDTH,
        WORK_SURFACE_MIN_WIDTH
      )
    : sessionMax

  const effectiveWorkWidth = Math.min(
    view.layout.workSurfaceWidth,
    effectiveWorkMax
  )

  const showingTask = isTaskDestination(activeDestination)
  const drawerWidth = showingTask
    ? workDrawerWidth(
        view.layout.workSurfaceVisible,
        workFullStage,
        effectiveWorkWidth,
        stageWidth,
      )
    : 0

  const widthAnimating = paneMotionSource === 'animated'

  const navigatorShared = {
    looseTasks,
    projectGroups,
    selectedProjectId: view.selectedProjectId,
    selectedTaskId: view.selectedTaskId,
    busyTaskIds,
    open: view.navigatorOpen,
    onNewChat: startNewChatFromShell,
    onDeleteTask,
    onRemoveProject,
    onNewProjectChat,
    projectActionError,
    onOpenSettings: openSettings,
    activeDestination,
    onOpenCapabilities: openCapabilities,
    onOpenBoard: () => openBoard(),
    onToggleNavigator: toggleNavigatorFromPointer,
  }

  return (
    <div
      className='relative flex h-svh min-h-0 w-full overflow-hidden bg-[var(--wb-app-bg)]'
      data-slot='workbench-shell'
      data-testid='workbench-shell'
      data-destination={activeDestination.kind}
      data-viewport={viewport}
      data-nav-open={view.navigatorOpen ? 'true' : 'false'}
      data-nav-motion={navMotion}
      data-context-motion={contextMotion}
      data-pane-motion={paneMotionSource}
      data-pane-transition={paneTransition}
    >
      <a
        href='#workbench-main'
        className='sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50'
      >
        跳到主内容
      </a>

      {/* Wide: reserved Navigator stays mounted for interruptible collapse. */}
      {navigatorMode === 'reserved' ? (
        <div className='nav-reserved-gap' aria-hidden={!view.navigatorOpen}>
          <div className='nav-reserved-inner'>
            <Navigator
              {...navigatorShared}
              mode='reserved'
              onSelectTask={selectTaskFromShell}
            />
          </div>
        </div>
      ) : null}

      {/* Inset Workspace — sole foreground plane. */}
      <div
        className='workbench-workspace'
        data-testid='workbench-workspace'
        data-slot='workbench-workspace'
      >
        <main
          ref={stageRef}
          id='workbench-main'
          className='relative flex min-h-0 min-w-0 flex-1 overflow-hidden'
          data-testid='workbench-stage'
        >
          {activeDestination.kind === 'capabilities' ? (
            <CapabilityManagementSurface
              controller={capabilityController}
              taskId={view.selectedTaskId}
              onBack={showTask}
            />
          ) : activeDestination.kind === 'board' && boardStore ? (
            <BoardWorkspace
              store={boardStore}
              boardId={activeDestination.boardId}
              theme={boardTheme}
              taskExists={taskExists}
              onOpenList={() => openBoard()}
              onOpenBoard={(id) => openBoard(id)}
              onCreateByChat={startNewChatFromShell}
              onOpenSourceTask={selectTaskFromShell}
            />
          ) : (
            /* Task pane: full-stage Work shrinks it via the drawer width. */
            <div
              className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              style={getTaskPaneStyle(sideBySide, widthAnimating)}
              data-slot='task-pane'
              aria-hidden={workFullStage || undefined}
              inert={workFullStage || undefined}
            >
              {/* Task pane toolbar (44px) — was Workspace-wide header. */}
              <header
                className='flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'
                data-testid='workspace-top-bar'
                data-slot='task-pane-toolbar'
              >
                {/*
                Nav toggle lives on the left rail (WorkBuddy-style) when open.
                Only re-open here when the rail is collapsed (reserved gap is 0).
              */}
                {!view.navigatorOpen && !workFullStage ? (
                  <ToolbarIconButton
                    testId='toggle-navigator'
                    pressed={false}
                    label='打开导航'
                    onClick={toggleNavigatorFromPointer}
                  >
                    <PanelLeftIcon className='size-4' aria-hidden />
                  </ToolbarIconButton>
                ) : null}

                <FolderIcon
                  className='size-4 shrink-0 text-muted-foreground'
                  aria-hidden
                />

                <div className='min-w-0 flex-1'>
                  <h1 className='truncate text-sm leading-none font-semibold'>
                    {taskView?.title ?? '新对话'}
                  </h1>
                </div>

                <div className='flex shrink-0 items-center gap-0.5'>
                  <ToolbarIconButton
                    testId='toggle-context'
                    pressed={view.layout.contextPanelOpen}
                    label='切换任务上下文面板'
                    onClick={toggleContextFromPointer}
                  >
                    <SlidersHorizontal className='size-4' aria-hidden />
                  </ToolbarIconButton>
                  <ToolbarIconButton
                    testId='toggle-work-surface-chrome'
                    pressed={view.layout.workSurfaceVisible}
                    label='切换工作面'
                    onClick={toggleWorkFromPointer}
                  >
                    <PanelBottom className='size-4' aria-hidden />
                  </ToolbarIconButton>
                </div>
              </header>

              <div className='flex min-h-0 min-w-0 flex-1'>
                {taskView ? (
                  <TaskSurface
                    view={taskView}
                    onLaunchAction={onLaunchAction}
                    composerRuntime={
                      composerRuntime
                        ? {
                            ...composerRuntime,
                            onManageCapabilities: openCapabilities,
                          }
                        : undefined
                    }
                    onOpenFileRef={onOpenFileRef}
                    onCloseContextPanel={
                      taskView.contextPanelOpen
                        ? () => {
                            setContextMotion('instant')
                            commands.toggleContextPanel()
                          }
                        : undefined
                    }
                  />
                ) : (
                  <div
                    className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center'
                    data-testid='workspace-empty-shell'
                  >
                    <p className='text-sm text-muted-foreground'>
                      正在打开新对话…
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Always-mounted right-anchored Work drawer — width is the only moving boundary. */}
          <div
            className='work-drawer-slot'
            data-slot='work-drawer-slot'
            style={{ width: drawerWidth }}
            aria-hidden={
              !showingTask || !view.layout.workSurfaceVisible || undefined
            }
            onTransitionEnd={handleWorkDrawerTransitionEnd}
          >
            <WorkSurfaceHost
              view={{
                visible: showingTask && view.layout.workSurfaceVisible,
                maximized: showingTask && view.layout.workSurfaceMaximized,
                width: effectiveWorkWidth,
                minWidth: view.workSurfaceMinWidth,
                maxWidth: effectiveWorkMax,
                tabs: view.layout.openTabs.map((t) => ({
                  tabId: t.tabId,
                  kind: t.kind,
                  resourceKey: t.resourceKey,
                  title: t.title,
                })),
                activeTabId: view.layout.activeTabId ?? null,
              }}
              callbacks={{
                onClose: closeWorkFromPointer,
                onCloseTab: commands.closeWorkSurfaceTab,
                onActivateTab: commands.activateTab,
                onResize: resizeWorkFromPointer,
                onToggleMaximize: toggleMaximizeFromPointer,
                onExitMaximize: exitMaximizeFromKeyboard,
              }}
              registry={surfaceRegistry}
              taskId={view.selectedTaskId}
              fullStage={showingTask && workFullStage}
              emptyExtra={workSurfaceEmptyExtra}
              toolbarTrailing={workSurfaceToolbarTrailing}
              toolbarLeading={
                // Re-open only: when Work is full-stage and the rail is already open,
                // the toggle lives on the Navigator toolbar (not duplicated here).
                workFullStage &&
                view.layout.workSurfaceVisible &&
                !view.navigatorOpen ? (
                  <ToolbarIconButton
                    testId='toggle-navigator'
                    pressed={false}
                    label='打开导航'
                    onClick={toggleNavigatorFromPointer}
                  >
                    <PanelLeftIcon className='size-4' aria-hidden />
                  </ToolbarIconButton>
                ) : undefined
              }
            />
          </div>
        </main>
      </div>

      {/* Medium/narrow: overlay Navigator stays mounted for motion; closed is inert. */}
      {navigatorMode === 'overlay' ? (
        <Navigator
          {...navigatorShared}
          mode='overlay'
          onSelectTask={(id) => {
            selectTaskFromShell(id)
            setNavMotion('instant')
            commands.setNavigatorOpen(false)
          }}
          onClose={() => {
            setNavMotion('animated')
            commands.setNavigatorOpen(false)
          }}
        />
      ) : null}

      <SettingsDialog
        open={settingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={closeSettings}
      />
    </div>
  )
}
