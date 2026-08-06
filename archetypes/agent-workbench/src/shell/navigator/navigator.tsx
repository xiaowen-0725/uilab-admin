import { useMemo, useState } from 'react'
import {
  Clock,
  Folder,
  GitPullRequest,
  Globe,
  MessageSquarePlus,
  Puzzle,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type {
  NavigatorUtility,
  ProjectFolder,
  TaskNavMeta,
} from '@/config/fixtures'
import type { ProjectSummary, TaskSummary } from '@/modules/workbench-session'
import { cn } from '@/lib/utils'
import { NavigatorUserMenu } from './navigator-user-menu'

export interface NavigatorProps {
  project: ProjectSummary
  tasks: TaskSummary[]
  selectedTaskId: string
  open: boolean
  mode: 'reserved' | 'overlay'
  utilities: NavigatorUtility[]
  projectFolders: ProjectFolder[]
  taskNavMeta: Record<string, TaskNavMeta>
  onSelectTask: (taskId: string) => void
  onNewChat?: () => void
  onClose?: () => void
  onOpenSettings?: () => void
}

const UTILITY_ICONS = {
  'git-pull-request': GitPullRequest,
  globe: Globe,
  clock: Clock,
  puzzle: Puzzle,
} as const

/** Left rail: 新对话, utility rows, 置顶 sessions, 项目 folders. */
export function Navigator({
  project,
  tasks,
  selectedTaskId,
  open,
  mode,
  utilities,
  projectFolders,
  taskNavMeta,
  onSelectTask,
  onNewChat,
  onClose,
  onOpenSettings,
}: NavigatorProps) {
  const [filter, setFilter] = useState('')

  const { pinned, byFolder, ungrouped } = useMemo(() => {
    const normalized = filter.trim().toLowerCase()
    const match = (task: TaskSummary) => {
      if (!normalized) return true
      return (
        task.title.toLowerCase().includes(normalized) ||
        (task.subtitle?.toLowerCase().includes(normalized) ?? false)
      )
    }
    const pinnedList: TaskSummary[] = []
    const ungroupedList: TaskSummary[] = []
    const folderMap = new Map<string, TaskSummary[]>()
    for (const folder of projectFolders) folderMap.set(folder.id, [])

    for (const task of tasks) {
      if (!match(task)) continue
      const meta = taskNavMeta[task.id]
      if (meta?.pinned) {
        pinnedList.push(task)
        continue
      }
      const folderId = meta?.projectFolderId
      if (folderId && folderMap.has(folderId)) {
        folderMap.get(folderId)!.push(task)
      } else {
        ungroupedList.push(task)
      }
    }
    return { pinned: pinnedList, byFolder: folderMap, ungrouped: ungroupedList }
  }, [tasks, taskNavMeta, projectFolders, filter])

  const tabIndex = open ? 0 : -1

  const panel = (
    <nav
      className='flex h-full flex-col bg-sidebar text-sidebar-foreground dark:bg-[color(srgb_0.129412_0.129412_0.129412_/_0.7)]'
      style={{
        width: 'var(--navigator-width)',
        maxWidth: 'none',
        /* Codex full-width title bar sits above rail content (46px). */
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
            {project.name}
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
        <ul className='mb-3 flex flex-col gap-0.5' data-testid='navigator-utilities'>
          {utilities.map((item) => {
            const Icon = UTILITY_ICONS[item.icon]
            return (
              <li key={item.id}>
                <Button
                  type='button'
                  variant='ghost'
                  data-testid={`navigator-utility-${item.id}`}
                  tabIndex={tabIndex}
                  className='h-auto w-full justify-start gap-2 rounded-lg px-2.5 py-1.5 text-sm font-normal text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'
                >
                  <Icon aria-hidden />
                  <span className='truncate'>{item.label}</span>
                </Button>
              </li>
            )
          })}
        </ul>

        {pinned.length > 0 ? (
          <section className='mb-3' data-testid='navigator-pinned'>
            <p className='px-2 py-1 text-[11px] font-medium text-muted-foreground'>
              置顶
            </p>
            <ul className='flex flex-col gap-0.5'>
              {pinned.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedTaskId}
                  tabIndex={tabIndex}
                  onSelect={onSelectTask}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section data-testid='navigator-projects'>
          <p className='px-2 py-1 text-[11px] font-medium text-muted-foreground'>
            项目
          </p>
          <ul className='flex flex-col gap-1'>
            {projectFolders.map((folder) => {
              const folderTasks = byFolder.get(folder.id) ?? []
              return (
                <li key={folder.id} data-testid={`navigator-folder-${folder.id}`}>
                  <div className='flex items-center gap-2 px-2.5 py-1 text-sm text-muted-foreground'>
                    <Folder className='size-4 shrink-0' aria-hidden />
                    <span className='truncate'>{folder.name}</span>
                  </div>
                  {folderTasks.length > 0 ? (
                    <ul className='ms-2 flex flex-col gap-0.5 border-l border-sidebar-border ps-1'>
                      {folderTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          selected={task.id === selectedTaskId}
                          tabIndex={tabIndex}
                          onSelect={onSelectTask}
                        />
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
            {ungrouped.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedTaskId}
                tabIndex={tabIndex}
                onSelect={onSelectTask}
              />
            ))}
          </ul>
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
  tabIndex,
  onSelect,
}: {
  task: TaskSummary
  selected: boolean
  tabIndex: number
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <Button
        type='button'
        variant='ghost'
        data-testid={`task-${task.id}`}
        aria-current={selected ? 'true' : undefined}
        tabIndex={tabIndex}
        className={cn(
          'h-auto w-full justify-start rounded-lg px-2.5 py-2 text-left text-sm font-normal',
          selected
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent'
            : 'hover:bg-sidebar-accent/70'
        )}
        onClick={() => onSelect(task.id)}
      >
        <span className='block min-w-0 flex-1 truncate'>{task.title}</span>
      </Button>
    </li>
  )
}
