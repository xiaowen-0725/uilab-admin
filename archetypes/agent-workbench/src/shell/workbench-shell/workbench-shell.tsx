import { useEffect, useRef } from 'react'
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

export interface WorkbenchShellProps {
  view: WorkbenchSessionView
  commands: WorkbenchSessionCommands
  /** Assembled Task view from Composition Root (Shell does not load fixtures). */
  taskView: TaskSurfaceView
}

/**
 * Shell owns geometry, Navigator, responsive layout, focus order, and shortcuts.
 * Consumes Module root Interfaces only. Task fixture assembly stays in Composition Root.
 */
export function WorkbenchShell({
  view,
  commands,
  taskView,
}: WorkbenchShellProps) {
  const viewport = useViewportMode()
  useWorkbenchShortcuts(view, commands)

  const stageRef = useRef<HTMLElement>(null)
  const stageWidth = useStageWidth(stageRef)
  // Tracks whether we already auto-closed Navigator for the current non-wide stretch.
  const autoClosedNavForNonWideRef = useRef(false)

  // Navigator reserved column only on wide; medium/narrow use overlay.
  const navigatorMode = viewport === 'wide' ? 'reserved' : 'overlay'

  // Entering medium/narrow (including first paint): auto-close Navigator once if open.
  // Afterwards the user may open overlay via 导航 without being re-closed.
  useEffect(() => {
    if (viewport === 'wide') {
      autoClosedNavForNonWideRef.current = false
      return
    }
    if (!autoClosedNavForNonWideRef.current && view.navigatorOpen) {
      autoClosedNavForNonWideRef.current = true
      commands.setNavigatorOpen(false)
    }
  }, [viewport, view.navigatorOpen, commands])

  const workFullStage =
    view.layout.workSurfaceMaximized ||
    (viewport === 'narrow' && view.layout.workSurfaceVisible)

  const showTaskBesideWork = !(
    view.layout.workSurfaceMaximized ||
    (viewport === 'narrow' && view.layout.workSurfaceVisible)
  )

  const sideBySide =
    view.layout.workSurfaceVisible && !workFullStage && showTaskBesideWork

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
      className='relative flex h-svh min-h-0 w-full overflow-hidden bg-background'
      data-slot='workbench-shell'
      data-testid='workbench-shell'
      data-viewport={viewport}
    >
      <a
        href='#workbench-main'
        className='sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50'
      >
        跳到主内容
      </a>

      {navigatorMode === 'reserved' && view.navigatorOpen ? (
        <Navigator
          project={view.project}
          tasks={view.tasks}
          selectedTaskId={view.selectedTaskId}
          open
          mode='reserved'
          onSelectTask={commands.selectTask}
        />
      ) : null}

      <div className='relative flex min-h-0 min-w-0 flex-1 flex-col'>
        <header className='flex items-center gap-2 border-b border-border px-3 py-2'>
          <button
            type='button'
            data-testid='toggle-navigator'
            className='rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
            aria-pressed={view.navigatorOpen}
            aria-label='切换导航'
            onClick={commands.toggleNavigator}
          >
            导航
          </button>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-semibold'>Agent Workbench</p>
            <p className='truncate text-xs text-muted-foreground'>
              静态 Shell 骨架 · 无 Runtime
            </p>
          </div>
          <button
            type='button'
            data-testid='toggle-work-surface-chrome'
            className='rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
            aria-pressed={view.layout.workSurfaceVisible}
            aria-label='切换工作面'
            onClick={commands.toggleWorkSurface}
          >
            工作面
          </button>
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
              style={
                sideBySide
                  ? {
                      minWidth: TASK_SURFACE_MIN_WIDTH,
                      // Cap Task so Work keeps its min when Stage is tight.
                      ...(stageWidth > 0
                        ? {
                            maxWidth: Math.max(
                              TASK_SURFACE_MIN_WIDTH,
                              stageWidth - WORK_SURFACE_MIN_WIDTH
                            ),
                          }
                        : {}),
                    }
                  : undefined
              }
            >
              <TaskSurface
                view={taskView}
                callbacks={{
                  onToggleContext: commands.toggleContextPanel,
                  onOpenWorkSurface: commands.openWorkSurface,
                }}
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

      {navigatorMode === 'overlay' ? (
        <Navigator
          project={view.project}
          tasks={view.tasks}
          selectedTaskId={view.selectedTaskId}
          open={view.navigatorOpen}
          mode='overlay'
          onSelectTask={(id) => {
            commands.selectTask(id)
            commands.setNavigatorOpen(false)
          }}
          onClose={() => commands.setNavigatorOpen(false)}
        />
      ) : null}
    </div>
  )
}
