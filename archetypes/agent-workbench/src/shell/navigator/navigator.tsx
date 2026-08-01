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

/**
 * Navigator remains mounted while open or closed so pointer motion can animate.
 * Closed: inert / aria-hidden / unfocusable; overlay also blocks pointer/focus.
 */
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
    const normalizedFilter = filter.trim().toLowerCase()
    if (!normalizedFilter) return tasks
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(normalizedFilter) ||
        (task.subtitle?.toLowerCase().includes(normalizedFilter) ?? false)
    )
  }, [filter, tasks])

  const panel = (
    <nav
      className='flex h-full flex-col bg-sidebar text-sidebar-foreground'
      style={{
        width: 'var(--navigator-width)',
        maxWidth: 'min(var(--navigator-width), 80vw)',
      }}
      data-slot='navigator'
      data-testid='navigator'
      data-mode={mode}
      data-open={open ? 'true' : 'false'}
      aria-label='工作台导航'
      aria-hidden={!open}
      inert={!open}
    >
      <div className='flex items-start justify-between gap-2 px-2 pt-2 pb-1'>
        <div className='min-w-0 rounded-lg px-2 py-1.5'>
          <p className='truncate text-[11px] font-medium text-muted-foreground'>
            项目
          </p>
          <h2
            className='truncate text-sm font-semibold tracking-tight'
            data-testid='project-name'
          >
            {project.name}
          </h2>
        </div>
        {mode === 'overlay' && onClose ? (
          <button
            type='button'
            className='mt-1 shrink-0 rounded-md px-2 py-1 text-xs hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50'
            aria-label='关闭导航'
            tabIndex={open ? 0 : -1}
            onClick={onClose}
          >
            关闭
          </button>
        ) : null}
      </div>

      <div className='px-2 pb-2'>
        <label className='sr-only' htmlFor='navigator-task-filter'>
          筛选任务
        </label>
        <Input
          id='navigator-task-filter'
          data-testid='navigator-filter'
          placeholder='筛选任务…'
          value={filter}
          tabIndex={open ? 0 : -1}
          className='h-8 bg-sidebar-accent/40 shadow-none'
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-2 pb-2'>
        <p className='px-2 py-1 text-[11px] font-medium text-muted-foreground'>
          任务
        </p>
        <ul className='flex flex-col gap-0.5' role='list'>
          {visibleTasks.map((task) => {
            const selected = task.id === selectedTaskId
            return (
              <li key={task.id}>
                <button
                  type='button'
                  data-testid={`task-${task.id}`}
                  aria-current={selected ? 'true' : undefined}
                  tabIndex={open ? 0 : -1}
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

      <footer className='px-4 py-2 text-[10px] text-muted-foreground'>
        Phase 3 · 静态 Shell
      </footer>
    </nav>
  )

  if (mode === 'overlay') {
    return (
      <div
        className='navigator-overlay-host'
        data-testid='navigator-overlay'
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
      >
        <button
          type='button'
          className='navigator-overlay-backdrop'
          aria-label='关闭导航遮罩'
          tabIndex={open ? 0 : -1}
          onClick={onClose}
        />
        <div className='navigator-overlay-panel shadow-xl'>{panel}</div>
      </div>
    )
  }

  return panel
}
