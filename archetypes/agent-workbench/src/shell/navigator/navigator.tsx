import { useMemo, useState } from 'react'
import { Input } from '@uilab/foundation/ui/input'
import type { ProjectSummary, TaskSummary } from '@/modules/workbench-session'

export interface NavigatorProps {
  project: ProjectSummary
  tasks: TaskSummary[]
  selectedTaskId: string
  open: boolean
  mode: 'reserved' | 'overlay'
  onSelectTask: (taskId: string) => void
  onClose?: () => void
}

export function Navigator({
  project,
  tasks,
  selectedTaskId,
  open,
  mode,
  onSelectTask,
  onClose,
}: NavigatorProps) {
  const [filter, setFilter] = useState('')

  const visibleTasks = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.subtitle?.toLowerCase().includes(q) ?? false)
    )
  }, [filter, tasks])

  if (!open) {
    return null
  }

  const panel = (
    <nav
      className='flex h-full w-[min(280px,80vw)] min-w-[240px] max-w-[280px] flex-col border-r border-border bg-sidebar text-sidebar-foreground'
      data-slot='navigator'
      data-testid='navigator'
      data-mode={mode}
      aria-label='工作台导航'
    >
      <div className='flex items-start justify-between gap-2 border-b border-sidebar-border px-3 py-3'>
        <div className='min-w-0'>
          <p className='text-[10px] font-medium tracking-wide text-muted-foreground uppercase'>
            项目
          </p>
          <h2 className='truncate text-sm font-semibold' data-testid='project-name'>
            {project.name}
          </h2>
        </div>
        {mode === 'overlay' && onClose ? (
          <button
            type='button'
            className='rounded-md px-2 py-1 text-xs hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50'
            aria-label='关闭导航'
            onClick={onClose}
          >
            关闭
          </button>
        ) : null}
      </div>

      <div className='border-b border-sidebar-border px-3 py-2'>
        <label className='sr-only' htmlFor='navigator-task-filter'>
          筛选任务
        </label>
        <Input
          id='navigator-task-filter'
          data-testid='navigator-filter'
          placeholder='筛选任务…'
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-2'>
        <p className='px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase'>
          任务
        </p>
        <ul className='flex flex-col gap-1' role='list'>
          {visibleTasks.map((task) => {
            const selected = task.id === selectedTaskId
            return (
              <li key={task.id}>
                <button
                  type='button'
                  data-testid={`task-${task.id}`}
                  aria-current={selected ? 'true' : undefined}
                  className={
                    selected
                      ? 'w-full rounded-lg bg-sidebar-accent px-2.5 py-2 text-left text-sm font-medium text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
                      : 'w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sidebar-accent/70 focus-visible:ring-3 focus-visible:ring-ring/50'
                  }
                  onClick={() => onSelectTask(task.id)}
                >
                  <span className='block truncate'>{task.title}</span>
                  {task.subtitle ? (
                    <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                      {task.subtitle}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <footer className='border-t border-sidebar-border px-3 py-2 text-[10px] text-muted-foreground'>
        Phase 3 · 静态 Shell
      </footer>
    </nav>
  )

  if (mode === 'overlay') {
    return (
      <div
        className='absolute inset-0 z-40 flex'
        data-testid='navigator-overlay'
      >
        <button
          type='button'
          className='absolute inset-0 bg-foreground/20'
          aria-label='关闭导航遮罩'
          onClick={onClose}
        />
        <div className='relative z-10 h-full shadow-xl'>{panel}</div>
      </div>
    )
  }

  return panel
}
