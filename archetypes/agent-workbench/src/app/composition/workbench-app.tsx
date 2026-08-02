import { useCallback, useMemo, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  getStreamViewForTask,
  getTaskFixture,
  launchActions,
  navigatorUtilities,
  phase3SessionSeed,
  projectFolders,
  taskNavMeta,
} from '@/config/fixtures'
import type { LaunchAction, TaskSurfaceView } from '@/modules/task'
import { useWorkbenchSession } from '@/modules/workbench-session'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'

/**
 * Composition Root — session + fixtures + capture replay (no live Runtime).
 */
export function WorkbenchApp() {
  const session = useWorkbenchSession(phase3SessionSeed)
  const [captureOverride, setCaptureOverride] = useState<
    Record<string, string>
  >({})
  const [forceStream, setForceStream] = useState<Record<string, boolean>>({})

  const taskId = session.view.selectedTaskId
  const fixture = getTaskFixture(taskId)
  const overrideId = captureOverride[taskId]
  const showStream =
    Boolean(forceStream[taskId]) || fixture.contentMode === 'stream'
  const stream = showStream
    ? getStreamViewForTask(taskId, overrideId)
    : null
  const mode = showStream ? ('stream' as const) : ('empty' as const)

  const taskView: TaskSurfaceView = useMemo(
    () => ({
      taskId,
      title: session.view.selectedTask.title,
      subtitle: session.view.selectedTask.subtitle,
      projectName: session.view.project.name,
      mode,
      stream,
      launchActions,
      contextSections: fixture.context,
      contextPanelOpen: session.view.layout.contextPanelOpen,
    }),
    [
      taskId,
      session.view.selectedTask.title,
      session.view.selectedTask.subtitle,
      session.view.project.name,
      session.view.layout.contextPanelOpen,
      mode,
      stream,
      fixture.context,
    ]
  )

  const onLaunchAction = useCallback(
    (action: LaunchAction) => {
      if (!action.captureId) return
      const captureId = action.captureId
      setCaptureOverride((prev) => ({ ...prev, [taskId]: captureId }))
      setForceStream((prev) => ({ ...prev, [taskId]: true }))
    },
    [taskId]
  )

  const onNewChat = useCallback(() => {
    session.commands.selectTask('task-empty')
    setForceStream((prev) => ({ ...prev, 'task-empty': false }))
  }, [session.commands])

  return (
    <ThemeProvider>
      <TooltipProvider delay={400}>
        <WorkbenchShell
          view={session.view}
          commands={session.commands}
          taskView={taskView}
          navigatorUtilities={navigatorUtilities}
          projectFolders={projectFolders}
          taskNavMeta={taskNavMeta}
          onLaunchAction={onLaunchAction}
          onNewChat={onNewChat}
        />
      </TooltipProvider>
    </ThemeProvider>
  )
}
