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

export interface TaskSurfaceCallbacks {
  onToggleContext: () => void
  onOpenWorkSurface: () => void
}

export interface TaskSurfaceProps {
  view: TaskSurfaceView
  callbacks: TaskSurfaceCallbacks
}

export function TaskSurface({ view, callbacks }: TaskSurfaceProps) {
  return (
    <section
      className='task-container relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background'
      data-slot='task-surface'
      data-testid='task-surface'
      data-task-id={view.taskId}
      aria-label={`任务表面：${view.title}`}
    >
      <header className='flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2'>
        <div className='min-w-0'>
          <h1 className='truncate text-sm font-semibold'>{view.title}</h1>
          {view.subtitle ? (
            <p className='truncate text-xs text-muted-foreground'>
              {view.subtitle}
            </p>
          ) : null}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            type='button'
            data-testid='toggle-context'
            className='rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
            aria-pressed={view.contextPanelOpen}
            aria-label='切换任务上下文面板'
            onClick={callbacks.onToggleContext}
          >
            上下文
          </button>
          <button
            type='button'
            data-testid='open-work-surface'
            className='rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
            aria-label='打开工作面'
            onClick={callbacks.onOpenWorkSurface}
          >
            打开工作面
          </button>
        </div>
      </header>

      <div className='relative flex min-h-0 flex-1'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <ExecutionStream items={view.execution} />
          <Composer />
        </div>
        <ContextPanel
          open={view.contextPanelOpen}
          sections={view.contextSections}
          onClose={
            view.contextPanelOpen ? callbacks.onToggleContext : undefined
          }
        />
      </div>
    </section>
  )
}
