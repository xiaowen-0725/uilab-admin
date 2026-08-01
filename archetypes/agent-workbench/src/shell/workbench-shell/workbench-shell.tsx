import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  AppWindowIcon,
  FolderIcon,
  PanelLeftIcon,
  PanelRightIcon,
} from 'lucide-react'
import type { TaskSurfaceView } from '@/modules/task'
import { TaskSurface } from '@/modules/task'
import type {
  WorkbenchSessionCommands,
  WorkbenchSessionView,
} from '@/modules/workbench-session'
import { WorkSurfaceHost } from '@/modules/work-surface'
import { Navigator } from '../navigator/navigator'
import {
  TASK_SURFACE_MIN_WIDTH,
  WORK_SURFACE_MIN_WIDTH,
  computeEffectiveWorkMax,
} from '../responsive-layout/geometry'
import { useStageWidth } from '../responsive-layout/use-stage-width'
import { useViewportMode } from '../responsive-layout/use-viewport-mode'
import {
  usePointerViewTransition,
  type PaneMotionSource,
} from './use-pointer-view-transition'
import { useWorkbenchShortcuts } from './use-workbench-shortcuts'

/** Shell-owned motion modality — never stored in Session. */
export type NavMotionSource = 'animated' | 'instant'
export type ContextMotionSource = 'animated' | 'instant'

const TOOLBAR_CONTROL_CLASS =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted'

function getTaskPaneStyle(
  sideBySide: boolean,
  stageWidth: number
): CSSProperties | undefined {
  if (!sideBySide) return undefined

  const style: CSSProperties = {
    minWidth: TASK_SURFACE_MIN_WIDTH,
  }

  if (stageWidth > 0) {
    style.maxWidth = Math.max(
      TASK_SURFACE_MIN_WIDTH,
      stageWidth - WORK_SURFACE_MIN_WIDTH
    )
  }

  return style
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
  const [paneMotion, setPaneMotion] = useState<PaneMotionSource>('instant')
  const { runPointerTransition } = usePointerViewTransition()

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
    const source = runPointerTransition(() => {
      commands.toggleWorkSurface()
    })
    setPaneMotion(source)
  }, [commands, runPointerTransition])

  const toggleWorkFromKeyboard = useCallback(() => {
    setPaneMotion('instant')
    commands.toggleWorkSurface()
  }, [commands])

  const closeWorkFromPointer = useCallback(() => {
    const source = runPointerTransition(() => {
      commands.closeWorkSurface()
    })
    setPaneMotion(source)
  }, [commands, runPointerTransition])

  const toggleMaximizeFromPointer = useCallback(() => {
    const source = runPointerTransition(() => {
      commands.toggleMaximize()
    })
    setPaneMotion(source)
  }, [commands, runPointerTransition])

  const exitMaximizeFromKeyboard = useCallback(() => {
    setPaneMotion('instant')
    commands.exitMaximize()
  }, [commands])

  /** Task select: mark context/pane instant so restored layout never plays entry. */
  const selectTaskFromShell = useCallback(
    (taskId: string) => {
      setContextMotion('instant')
      setPaneMotion('instant')
      commands.selectTask(taskId)
    },
    [commands]
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

  const showTaskBesideWork = !workFullStage

  const sideBySide = view.layout.workSurfaceVisible && showTaskBesideWork

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

  return (
    <div
      className='relative flex h-svh min-h-0 w-full overflow-hidden bg-sidebar'
      data-slot='workbench-shell'
      data-testid='workbench-shell'
      data-viewport={viewport}
      data-nav-open={view.navigatorOpen ? 'true' : 'false'}
      data-nav-motion={navMotion}
      data-context-motion={contextMotion}
      data-pane-motion={paneMotion}
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
          {showTaskBesideWork ? (
            <div
              className='flex min-h-0 min-w-0 flex-1 flex-col'
              style={getTaskPaneStyle(sideBySide, stageWidth)}
              data-slot='task-pane'
            >
              {/* Task pane toolbar (44px) — was Workspace-wide header. */}
              <header
                className='flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'
                data-testid='workspace-top-bar'
                data-slot='task-pane-toolbar'
              >
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

                <FolderIcon
                  className='size-4 shrink-0 text-muted-foreground'
                  aria-hidden
                />

                <div className='min-w-0 flex-1'>
                  <h1 className='truncate text-sm font-semibold leading-none'>
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
                    <PanelRightIcon className='size-4' aria-hidden />
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
                    <AppWindowIcon className='size-4' aria-hidden />
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
          ) : null}

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
              onResize: commands.resizeWorkSurface,
              onToggleMaximize: toggleMaximizeFromPointer,
              onExitMaximize: exitMaximizeFromKeyboard,
            }}
            fullStage={workFullStage}
            toolbarLeading={
              workFullStage ? (
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
        />
      ) : null}
    </div>
  )
}
