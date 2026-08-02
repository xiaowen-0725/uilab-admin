import { useState } from 'react'
import type { ContextSection, LaunchAction, TaskContentMode } from '../../model/types'
import type { StreamViewModel } from '../../model/stream-events'
import { Composer } from '../composer/composer'
import { ContextPanel } from '../context-panel/context-panel'
import { EmptyHub } from '../empty-hub/empty-hub'
import { ExecutionStream } from '../execution-stream/execution-stream'

export interface TaskSurfaceView {
  taskId: string
  title: string
  subtitle?: string
  projectName: string
  mode: TaskContentMode
  stream: StreamViewModel | null
  launchActions: LaunchAction[]
  contextSections: ContextSection[]
  contextPanelOpen: boolean
}

export interface TaskSurfaceProps {
  view: TaskSurfaceView
  onCloseContextPanel?: () => void
  /** Fixture-honest: parent may switch to stream capture. */
  onLaunchAction?: (action: LaunchAction) => void
}

export function TaskSurface({
  view,
  onCloseContextPanel,
  onLaunchAction,
}: TaskSurfaceProps) {
  const [lastActionId, setLastActionId] = useState<string | null>(null)

  const handleLaunch = (action: LaunchAction) => {
    setLastActionId(action.id)
    onLaunchAction?.(action)
  }

  return (
    <section
      className='task-container relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background'
      data-slot='task-surface'
      data-testid='task-surface'
      data-task-id={view.taskId}
      data-content-mode={view.mode}
      data-last-launch-action={lastActionId ?? undefined}
      aria-label={`任务表面：${view.title}`}
    >
      <div className='relative flex min-h-0 flex-1'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {view.mode === 'stream' && view.stream ? (
            <ExecutionStream stream={view.stream} />
          ) : (
            <EmptyHub
              projectName={view.projectName}
              actions={view.launchActions}
              onSelectAction={handleLaunch}
            />
          )}
          <Composer projectLabel={view.projectName} branchLabel='main' />
        </div>
        <ContextPanel
          open={view.contextPanelOpen}
          sections={view.contextSections}
          onClose={onCloseContextPanel}
        />
      </div>
    </section>
  )
}
