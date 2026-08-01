import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, TransitionEvent } from 'react'
import type { TaskSurfaceView } from '@/modules/task'
import { TaskSurface } from '@/modules/task'
import { WorkSurfaceHost } from '@/modules/work-surface'
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
import { Navigator } from '../navigator/navigator'
import {
  SettingsDialog,
  type SettingsSectionId,
} from '../settings/settings-dialog'
import {
  TASK_SURFACE_MIN_WIDTH,
  WORK_SURFACE_MIN_WIDTH,
  computeEffectiveWorkMax,
} from '../responsive-layout/geometry'
import { useStageWidth } from '../responsive-layout/use-stage-width'
import { useViewportMode } from '../responsive-layout/use-viewport-mode'
import { useWorkbenchShortcuts } from './use-workbench-shortcuts'

/** Shell-owned motion modality — never stored in Session. */
export type NavMotionSource = 'animated' | 'instant'
export type ContextMotionSource = 'animated' | 'instant'

/**
 * Phase 3B contract: animated vs instant source only (data-pane-motion).
 * Never stored in Session.
 */
export type PaneMotionSource = 'animated' | 'instant'

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

const TOOLBAR_CONTROL_CLASS =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted'

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
  /** Assembled Task view from Composition Root (Shell does not load fixtures). */
  taskView: TaskSurfaceView
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
}: WorkbenchShellProps) {
  const viewport = useViewportMode()
  const [navMotion, setNavMotion] = useState<NavMotionSource>('instant')
  const [contextMotion, setContextMotion] =
    useState<ContextMotionSource>('instant')
  const [paneMotionSource, setPaneMotionSource] =
    useState<PaneMotionSource>('instant')
  const [paneTransition, setPaneTransition] =
    useState<PaneTransition>('instant')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>('profile')

  const openSettings = useCallback(() => {
    setSettingsSection('profile')
    setSettingsOpen(true)
  }, [])

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
      setContextMotion('instant')
      setPaneInstant()
      commands.selectTask(taskId)
    },
    [commands, setPaneInstant]
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

  const drawerWidth = workDrawerWidth(
    view.layout.workSurfaceVisible,
    workFullStage,
    effectiveWorkWidth,
    stageWidth
  )

  const widthAnimating = paneMotionSource === 'animated'

  return (
    <div
      className='relative flex h-svh min-h-0 w-full overflow-hidden bg-sidebar'
      data-slot='workbench-shell'
      data-testid='workbench-shell'
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
              project={view.project}
              tasks={view.tasks}
              selectedTaskId={view.selectedTaskId}
              open={view.navigatorOpen}
              mode='reserved'
              onSelectTask={selectTaskFromShell}
              onOpenSettings={openSettings}
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
          {/* Task stays mounted; full-stage Work shrinks it via the drawer width. */}
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
              <button
                type='button'
                data-testid={workFullStage ? undefined : 'toggle-navigator'}
                className={TOOLBAR_CONTROL_CLASS}
                aria-pressed={view.navigatorOpen}
                aria-label='切换导航'
                title='切换导航'
                onClick={toggleNavigatorFromPointer}
              >
                <PanelLeftIcon className='size-4' aria-hidden />
              </button>

              <FolderIcon
                className='size-4 shrink-0 text-muted-foreground'
                aria-hidden
              />

              <div className='min-w-0 flex-1'>
                <h1 className='truncate text-sm leading-none font-semibold'>
                  {taskView.title}
                </h1>
              </div>

              <div className='flex shrink-0 items-center gap-0.5'>
                <button
                  type='button'
                  data-testid='toggle-context'
                  className={TOOLBAR_CONTROL_CLASS}
                  aria-pressed={view.layout.contextPanelOpen}
                  aria-label='切换任务上下文面板'
                  title='切换任务上下文面板'
                  onClick={toggleContextFromPointer}
                >
                  <SlidersHorizontal className='size-4' aria-hidden />
                </button>
                <button
                  type='button'
                  data-testid='toggle-work-surface-chrome'
                  className={TOOLBAR_CONTROL_CLASS}
                  aria-pressed={view.layout.workSurfaceVisible}
                  aria-label='切换工作面'
                  title='切换工作面'
                  onClick={toggleWorkFromPointer}
                >
                  <PanelBottom className='size-4' aria-hidden />
                </button>
              </div>
            </header>

            <div className='flex min-h-0 min-w-0 flex-1'>
              <TaskSurface
                view={taskView}
                onCloseContextPanel={
                  taskView.contextPanelOpen
                    ? () => {
                        setContextMotion('instant')
                        commands.toggleContextPanel()
                      }
                    : undefined
                }
              />
            </div>
          </div>

          {/* Always-mounted right-anchored Work drawer — width is the only moving boundary. */}
          <div
            className='work-drawer-slot'
            data-slot='work-drawer-slot'
            style={{ width: drawerWidth }}
            aria-hidden={!view.layout.workSurfaceVisible || undefined}
            onTransitionEnd={handleWorkDrawerTransitionEnd}
          >
            <WorkSurfaceHost
              view={{
                visible: view.layout.workSurfaceVisible,
                maximized: view.layout.workSurfaceMaximized,
                width: effectiveWorkWidth,
                minWidth: view.workSurfaceMinWidth,
                maxWidth: effectiveWorkMax,
                tabs: view.workSurfaceTabs,
                activeTabId: view.layout.activeTabId,
              }}
              callbacks={{
                onClose: closeWorkFromPointer,
                onActivateTab: commands.activateTab,
                onResize: resizeWorkFromPointer,
                onToggleMaximize: toggleMaximizeFromPointer,
                onExitMaximize: exitMaximizeFromKeyboard,
              }}
              fullStage={workFullStage}
              toolbarLeading={
                workFullStage && view.layout.workSurfaceVisible ? (
                  <button
                    type='button'
                    data-testid='toggle-navigator'
                    className={TOOLBAR_CONTROL_CLASS}
                    aria-pressed={view.navigatorOpen}
                    aria-label='切换导航'
                    title='切换导航'
                    onClick={toggleNavigatorFromPointer}
                  >
                    <PanelLeftIcon className='size-4' aria-hidden />
                  </button>
                ) : undefined
              }
            />
          </div>
        </main>
      </div>

      {/* Medium/narrow: overlay Navigator stays mounted for motion; closed is inert. */}
      {navigatorMode === 'overlay' ? (
        <Navigator
          project={view.project}
          tasks={view.tasks}
          selectedTaskId={view.selectedTaskId}
          open={view.navigatorOpen}
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
          onOpenSettings={openSettings}
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
