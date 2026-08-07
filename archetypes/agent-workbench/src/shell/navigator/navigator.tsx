import { useMemo, useState } from 'react'
import { Loader2, MessageSquarePlus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ProjectSummary, TaskSummary } from '@/modules/project'
import { cn } from '@/lib/utils'
import { NavigatorUserMenu } from './navigator-user-menu'

export interface NavigatorProps {
  project: ProjectSummary | null
  projects?: ProjectSummary[]
  tasks: TaskSummary[]
  selectedTaskId: string | null
  /** taskId → busy (queued|running|cancelling) */
  busyTaskIds?: ReadonlySet<string>
  open: boolean
  mode: 'reserved' | 'overlay'
  onSelectTask: (taskId: string) => void
  onNewChat?: () => void
  onDeleteTask?: (taskId: string) => void
  onSelectProject?: (projectId: string) => void
  onRenameProject?: (projectId: string, name: string) => void
  onClose?: () => void
  onOpenSettings?: () => void
}

/** Left rail: 新对话 + real Task catalog (no mock utilities). */
export function Navigator({
  project,
  projects,
  tasks,
  selectedTaskId,
  busyTaskIds,
  open,
  mode,
  onSelectTask,
  onNewChat,
  onDeleteTask,
  onSelectProject,
  onClose,
  onOpenSettings,
}: NavigatorProps) {
  const [filter, setFilter] = useState('')

  const filteredTasks = useMemo(() => {
    const normalized = filter.trim().toLowerCase()
    if (!normalized) return tasks
    return tasks.filter((task) =>
      task.title.toLowerCase().includes(normalized),
    )
  }, [tasks, filter])

  const tabIndex = open ? 0 : -1

  const panel = (
    <nav
      className='flex h-full flex-col bg-sidebar text-sidebar-foreground dark:bg-[color(srgb_0.129412_0.129412_0.129412_/_0.7)]'
      style={{
        width: 'var(--navigator-width)',
        maxWidth: 'none',
        paddingTop: 46,
      }}
      data-slot='navigator'
      data-testid='navigator'
      data-mode={mode}
      data-open={open ? 'true' : 'false'}
      aria-label='工作台导航'
      aria-hidden={!open}
      inert={!open}
    >
      <div className='flex items-center justify-between gap-2 px-3 pt-3 pb-2'>
        <div className='min-w-0'>
          <p className='truncate text-[11px] text-muted-foreground'>工作区</p>
          <h2
            className='truncate text-sm font-semibold tracking-tight'
            data-testid='project-name'
          >
            {project?.name ?? '…'}
          </h2>
        </div>
        {mode === 'overlay' && onClose ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-7 shrink-0 px-2 text-xs'
            aria-label='关闭导航'
            tabIndex={tabIndex}
            onClick={onClose}
          >
            关闭
          </Button>
        ) : null}
      </div>

      {projects && projects.length > 1 && onSelectProject ? (
        <div className='px-2 pb-2' data-testid='navigator-project-list'>
          <label className='sr-only' htmlFor='navigator-project-select'>
            切换项目
          </label>
          <select
            id='navigator-project-select'
            data-testid='navigator-project-select'
            className='h-8 w-full rounded-md border border-border/80 bg-sidebar-accent/30 px-2 text-xs'
            value={project?.id ?? ''}
            tabIndex={tabIndex}
            onChange={(e) => onSelectProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className='px-2 pb-2'>
        <Button
          type='button'
          variant='outline'
          data-testid='navigator-new-chat'
          tabIndex={tabIndex}
          className='h-auto w-full justify-start gap-2 rounded-xl border-border/80 bg-sidebar-accent/30 px-3 py-2 text-sm font-normal hover:bg-sidebar-accent'
          onClick={() => onNewChat?.()}
        >
          <MessageSquarePlus aria-hidden />
          <span className='flex-1 text-left'>新对话</span>
          <Search className='opacity-50' aria-hidden />
        </Button>
        <label className='sr-only' htmlFor='navigator-task-filter'>
          筛选任务
        </label>
        <Input
          id='navigator-task-filter'
          data-testid='navigator-filter'
          placeholder='筛选…'
          value={filter}
          tabIndex={tabIndex}
          className='mt-2 h-8 bg-sidebar-accent/30 text-xs shadow-none'
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <ScrollArea className='min-h-0 flex-1 px-2 pb-2'>
        <section data-testid='navigator-tasks'>
          <p className='px-2 py-1 text-[11px] font-medium text-muted-foreground'>
            对话
          </p>
          {filteredTasks.length === 0 ? (
            <p
              className='px-2.5 py-3 text-xs text-muted-foreground'
              data-testid='navigator-tasks-empty'
            >
              还没有对话
            </p>
          ) : (
            <ul className='flex flex-col gap-0.5'>
              {filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedTaskId}
                  busy={busyTaskIds?.has(task.id) ?? false}
                  tabIndex={tabIndex}
                  onSelect={onSelectTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </ul>
          )}
        </section>
      </ScrollArea>

      <NavigatorUserMenu
        interactive={open}
        onOpenSettings={onOpenSettings}
      />
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
          tabIndex={tabIndex}
          onClick={onClose}
        />
        <div className='navigator-overlay-panel shadow-xl'>{panel}</div>
      </div>
    )
  }

  return panel
}

function TaskRow({
  task,
  selected,
  busy,
  tabIndex,
  onSelect,
  onDelete,
}: {
  task: TaskSummary
  selected: boolean
  busy: boolean
  tabIndex: number
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <li className='group relative'>
      <Button
        type='button'
        variant='ghost'
        data-testid={`task-${task.id}`}
        aria-current={selected ? 'true' : undefined}
        aria-busy={busy || undefined}
        aria-label={busy ? `${task.title}，进行中` : task.title}
        tabIndex={tabIndex}
        className={cn(
          'h-auto w-full justify-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-normal',
          selected
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent'
            : 'hover:bg-sidebar-accent/70',
        )}
        onClick={() => onSelect(task.id)}
      >
        {busy ? (
          <Loader2
            className='size-3.5 shrink-0 animate-spin text-muted-foreground'
            aria-hidden
            data-testid={`task-busy-${task.id}`}
          />
        ) : null}
        <span className='block min-w-0 flex-1 truncate'>{task.title}</span>
      </Button>
      {onDelete ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-testid={`task-delete-${task.id}`}
          className='absolute end-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          tabIndex={tabIndex}
          aria-label={`删除 ${task.title}`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task.id)
          }}
        >
          <Trash2 className='size-3.5' aria-hidden />
        </Button>
      ) : null}
    </li>
  )
}
