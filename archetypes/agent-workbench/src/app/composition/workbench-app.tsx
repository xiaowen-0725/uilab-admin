import { getTaskFixture, phase3SessionSeed } from '@/config/fixtures'
import type { TaskSurfaceView } from '@/modules/task'
import { useWorkbenchSession } from '@/modules/workbench-session'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'

/**
 * Composition Root — only place that creates the session controller
 * and wires static fixtures into the Shell. No production Adapter in Phase 3.
 */
export function WorkbenchApp() {
  const session = useWorkbenchSession(phase3SessionSeed)
  const fixture = getTaskFixture(session.view.selectedTaskId)

  const taskView: TaskSurfaceView = {
    taskId: session.view.selectedTaskId,
    title: session.view.selectedTask.title,
    subtitle: session.view.selectedTask.subtitle,
    execution: fixture.execution,
    contextSections: fixture.context,
    contextPanelOpen: session.view.layout.contextPanelOpen,
  }

  return (
    <WorkbenchShell
      view={session.view}
      commands={session.commands}
      taskView={taskView}
    />
  )
}
