import type { ContextSection, ExecutionItem } from '../../model/types'
import { Composer } from '../composer/composer'
import { ContextPanel } from '../context-panel/context-panel'
import { ExecutionStream } from '../execution-stream/execution-stream'

export interface TaskSurfaceView {
  taskId: string
  title: string
  subtitle?: string
  execution: ExecutionItem[]
  contextSections: ContextSection[]
  contextPanelOpen: boolean
}

/**
 * Content-only Task Surface (Phase 3A).
 * Chrome (title, Context / Work controls) lives in the Workspace top bar.
 */
export interface TaskSurfaceProps {
  view: TaskSurfaceView
  /** Close control on the Context card only — not a public header callback. */
  onCloseContextPanel?: () => void
}

export function TaskSurface({ view, onCloseContextPanel }: TaskSurfaceProps) {
  return (
    <section
      className='task-container relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background'
      data-slot='task-surface'
      data-testid='task-surface'
      data-task-id={view.taskId}
      aria-label={`任务表面：${view.title}`}
    >
      <div className='relative flex min-h-0 flex-1'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <ExecutionStream items={view.execution} />
          <Composer />
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
