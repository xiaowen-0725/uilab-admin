import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AppWindowIcon, PanelLeftIcon, PanelRightIcon } from 'lucide-react'
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
import { useWorkbenchShortcuts } from './use-workbench-shortcuts'

/** Shell-owned motion modality — never stored in Session. */
export type NavMotionSource = 'animated' | 'instant'

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
 * and pointer vs keyboard motion source for Navigator toggle.
 * Consumes Module root Interfaces only. Task fixture assembly stays in Composition Root.
 */
export function WorkbenchShell({
  view,
  commands,
  taskView,
}: WorkbenchShellProps) {
  const viewport = useViewportMode()
  const [navMotion, setNavMotion] = useState<NavMotionSource>('instant')

  const toggleNavigatorFromPointer = useCallback(() => {
    setNavMotion('animated')
    commands.toggleNavigator()
  }, [commands])

  const toggleNavigatorFromKeyboard = useCallback(() => {
    setNavMotion('instant')
    commands.toggleNavigator()
  }, [commands])

  useWorkbenchShortcuts(view, commands, toggleNavigatorFromKeyboard)

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
              onSelectTask={commands.selectTask}
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
        {/* Single task-aware top bar (replaces Shell + Task double header). */}
        <header
          className='flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3'
          data-testid='workspace-top-bar'
        >
          <button
            type='button'
            data-testid='toggle-navigator'
            className='inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
            aria-pressed={view.navigatorOpen}
            aria-label='切换导航'
            onClick={toggleNavigatorFromPointer}
          >
            <PanelLeftIcon className='size-4' aria-hidden />
          </button>

          <div className='min-w-0 flex-1'>
            <h1 className='truncate text-sm font-semibold'>{taskView.title}</h1>
            {taskView.subtitle ? (
              <p className='truncate text-xs text-muted-foreground'>
                {taskView.subtitle}
              </p>
            ) : null}
          </div>

          <div className='flex shrink-0 items-center gap-1.5'>
            <button
              type='button'
              data-testid='toggle-context'
              className='inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
              aria-pressed={view.layout.contextPanelOpen}
              aria-label='切换任务上下文面板'
              onClick={commands.toggleContextPanel}
            >
              <PanelRightIcon className='size-3.5' aria-hidden />
              上下文
            </button>
            <button
              type='button'
              data-testid='toggle-work-surface-chrome'
              className='inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
              aria-pressed={view.layout.workSurfaceVisible}
              aria-label='切换工作面'
              onClick={commands.toggleWorkSurface}
            >
              <AppWindowIcon className='size-3.5' aria-hidden />
              工作面
            </button>
          </div>
        </header>

        <main
          ref={stageRef}
          id='workbench-main'
          className='relative flex min-h-0 min-w-0 flex-1 overflow-hidden'
          data-testid='workbench-stage'
        >
          {showTaskBesideWork ? (
            <div
              className='flex min-h-0 min-w-0 flex-1'
              style={getTaskPaneStyle(sideBySide, stageWidth)}
            >
              <TaskSurface
                view={taskView}
                onCloseContextPanel={
                  taskView.contextPanelOpen
                    ? commands.toggleContextPanel
                    : undefined
                }
              />
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
              onClose: commands.closeWorkSurface,
              onActivateTab: commands.activateTab,
              onResize: commands.resizeWorkSurface,
              onToggleMaximize: commands.toggleMaximize,
              onExitMaximize: commands.exitMaximize,
            }}
            fullStage={workFullStage}
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
            commands.selectTask(id)
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
