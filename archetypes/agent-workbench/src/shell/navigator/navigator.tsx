import { useMemo, useState } from 'react'
import {
  Bot,
  ChevronDown,
  Filter,
  FolderKanban,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeft,
  Puzzle,
  Search,
  Trash2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

/**
 * IA shell menu (no product backend yet except 新对话).
 * Layout aligned to WorkBuddy-style left rail: toolbar → brand → menu → lists.
 * Icons = lucide (project iconLibrary).
 */
type NavItemId =
  | 'new-chat'
  | 'assistant'
  | 'projects'
  | 'skills-connectors'
  | 'automation'
  | 'more'

type NavItem = {
  id: NavItemId
  label: string
  icon: LucideIcon
  action?: 'new-chat'
  shellOnly?: boolean
  /** Right-side meta (like WorkBuddy「更多 · 资料库」). */
  trailing?: string
}

const STATUS_FILTERS = [
  { value: 'all', label: '全部状态' },
  { value: 'running', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'pending', label: '待处理' },
  { value: 'planning', label: '规划中' },
] as const

const TIME_FILTERS = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]['value']
type TimeFilter = (typeof TIME_FILTERS)[number]['value']

const iconBtn =
  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40'

/** Left rail — clean WorkBuddy-like stack; no「工作区」chrome header. */
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
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [activeNav, setActiveNav] = useState<NavItemId>('projects')
  const [tasksExpanded, setTasksExpanded] = useState(true)

  const filterActive = statusFilter !== 'all' || timeFilter !== 'all'
  const projectName = project?.name ?? '…'

  const navItems: readonly NavItem[] = useMemo(
    () => [
      {
        id: 'new-chat',
        label: '新对话',
        icon: MessageSquarePlus,
        action: 'new-chat',
      },
      { id: 'assistant', label: '助理', icon: Bot, shellOnly: true },
      {
        id: 'projects',
        label: '项目',
        icon: FolderKanban,
        shellOnly: true,
        // Current project as quiet meta (tests: project-name)
        trailing: projectName,
      },
      {
        id: 'skills-connectors',
        label: '专家·技能·连接器',
        icon: Puzzle,
        shellOnly: true,
      },
      { id: 'automation', label: '自动化', icon: Workflow, shellOnly: true },
      {
        id: 'more',
        label: '更多',
        icon: MoreHorizontal,
        shellOnly: true,
        trailing: '资源库·灵感',
      },
    ],
    [projectName],
  )

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return tasks
    return tasks.filter((task) => task.title.toLowerCase().includes(normalized))
  }, [tasks, query])

  const tabIndex = open ? 0 : -1

  const handleNavClick = (item: NavItem) => {
    setActiveNav(item.id)
    if (item.action === 'new-chat') onNewChat?.()
  }

  const resetFilters = () => {
    setStatusFilter('all')
    setTimeFilter('all')
  }

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
      {/* 1) Top toolbar — icons only (align end, like reference) */}
      <div
        className='flex items-center justify-end gap-0.5 px-2.5 pt-2'
        data-testid='navigator-toolbar'
      >
        <button
          type='button'
          className={iconBtn}
          tabIndex={tabIndex}
          aria-label='导航布局（占位）'
          data-testid='navigator-layout'
          disabled
          title='布局切换尚未接入'
        >
          <PanelLeft className='size-3.5' aria-hidden />
        </button>

        <button
          type='button'
          className={cn(iconBtn, searchOpen && 'bg-sidebar-accent text-foreground')}
          tabIndex={tabIndex}
          aria-label={searchOpen ? '关闭搜索' : '搜索对话'}
          aria-pressed={searchOpen}
          data-testid='navigator-search-toggle'
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search className='size-3.5' aria-hidden />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type='button'
                className={cn(
                  iconBtn,
                  filterActive && 'bg-sidebar-accent text-foreground',
                )}
                tabIndex={tabIndex}
                aria-label='筛选'
                data-testid='navigator-filter'
                title='筛选'
              />
            }
          >
            <Filter className='size-3.5' aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            side='bottom'
            className='w-52'
            data-testid='navigator-filter-menu'
          >
            <p className='px-1.5 py-1 text-xs font-medium text-muted-foreground'>
              筛选状态
            </p>
            <DropdownMenuRadioGroup
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              {STATUS_FILTERS.map((opt) => (
                <DropdownMenuRadioItem
                  key={opt.value}
                  value={opt.value}
                  data-testid={`navigator-filter-status-${opt.value}`}
                >
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <p className='px-1.5 py-1 text-xs font-medium text-muted-foreground'>
              筛选时间
            </p>
            <DropdownMenuRadioGroup
              value={timeFilter}
              onValueChange={(v) => setTimeFilter(v as TimeFilter)}
            >
              {TIME_FILTERS.map((opt) => (
                <DropdownMenuRadioItem
                  key={opt.value}
                  value={opt.value}
                  data-testid={`navigator-filter-time-${opt.value}`}
                >
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={!filterActive}
                onClick={resetFilters}
                data-testid='navigator-filter-reset'
              >
                重置筛选条件
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {mode === 'overlay' && onClose ? (
          <button
            type='button'
            className='ms-1 h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
            aria-label='关闭导航'
            tabIndex={tabIndex}
            onClick={onClose}
          >
            关闭
          </button>
        ) : null}
      </div>

      {/* 2) Brand — product name only (no「工作区 / 项目区」) */}
      <div className='px-3.5 pb-2 pt-1'>
        <p className='truncate text-[13px] leading-5 tracking-tight text-foreground/90'>
          Workbench
          <span className='ms-1.5 text-muted-foreground'>本地</span>
        </p>
      </div>

      {searchOpen ? (
        <div className='px-2.5 pb-2'>
          <label className='sr-only' htmlFor='navigator-task-search'>
            搜索对话
          </label>
          <Input
            id='navigator-task-search'
            data-testid='navigator-search-input'
            placeholder='搜索对话…'
            value={query}
            tabIndex={tabIndex}
            className='h-8 bg-sidebar-accent/40 text-xs shadow-none'
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      ) : null}

      {/* 3) Primary IA menu */}
      <div className='px-2 pb-1' data-testid='navigator-menu'>
        <ul className='flex flex-col gap-0.5'>
          {navItems.map((item) => {
            const Icon = item.icon
            const selected = activeNav === item.id
            const isNewChat = item.id === 'new-chat'
            const isProjects = item.id === 'projects'
            return (
              <li key={item.id}>
                <button
                  type='button'
                  data-testid={
                    isNewChat
                      ? 'navigator-new-chat'
                      : `navigator-menu-${item.id}`
                  }
                  tabIndex={tabIndex}
                  aria-current={selected ? 'true' : undefined}
                  title={
                    item.shellOnly
                      ? `${item.label}（菜单占位，功能未接入）`
                      : item.label
                  }
                  className={cn(
                    // 13px + inherit body weight (445) — avoid font-medium (500) clash with CJK
                    'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] leading-5 outline-none',
                    'hover:bg-sidebar-accent/70 focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-foreground/85',
                  )}
                  onClick={() => handleNavClick(item)}
                >
                  <Icon
                    className='size-4 shrink-0 opacity-80'
                    aria-hidden
                  />
                  <span className='min-w-0 flex-1 truncate text-left'>
                    {item.label}
                  </span>
                  {item.trailing ? (
                    <span
                      className='max-w-[40%] truncate text-[12px] leading-4 text-muted-foreground'
                      data-testid={isProjects ? 'project-name' : undefined}
                    >
                      {item.trailing}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Multi-project switch — only when relevant, under menu */}
      {projects && projects.length > 1 && onSelectProject ? (
        <div className='px-2.5 pb-2' data-testid='navigator-project-list'>
          <label className='sr-only' htmlFor='navigator-project-select'>
            切换项目
          </label>
          <select
            id='navigator-project-select'
            data-testid='navigator-project-select'
            className='h-8 w-full rounded-md border border-border/60 bg-sidebar-accent/30 px-2 text-xs'
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

      {/* 4) Collapsible conversation list (like「任务(n)」) */}
      <ScrollArea className='min-h-0 flex-1 px-2 pb-2'>
        <section data-testid='navigator-tasks' className='pt-2'>
          <button
            type='button'
            className={cn(
              // Match WorkBuddy section headers: ~12px, regular weight (not 11px medium)
              'mb-0.5 flex h-7 w-full items-center gap-1 rounded-md px-2',
              'text-[12px] leading-4 text-muted-foreground outline-none',
              'hover:bg-sidebar-accent/50 hover:text-foreground',
            )}
            tabIndex={tabIndex}
            aria-expanded={tasksExpanded}
            data-testid='navigator-tasks-toggle'
            onClick={() => setTasksExpanded((v) => !v)}
          >
            <span>
              对话
              <span className='ms-0.5 tabular-nums text-muted-foreground/90'>
                ({filteredTasks.length})
              </span>
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform',
                !tasksExpanded && '-rotate-90',
              )}
              aria-hidden
            />
          </button>

          {tasksExpanded ? (
            <>
              {filterActive ? (
                <p
                  className='px-2 pb-1 text-[12px] leading-4 text-muted-foreground'
                  data-testid='navigator-filter-shell-note'
                >
                  筛选仅 UI 占位
                </p>
              ) : null}
              {filteredTasks.length === 0 ? (
                <p
                  className='px-2.5 py-2 text-[13px] leading-5 text-muted-foreground'
                  data-testid='navigator-tasks-empty'
                >
                  还没有对话
                </p>
              ) : (
                <ul className='flex flex-col gap-px'>
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
            </>
          ) : null}
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
      <button
        type='button'
        data-testid={`task-${task.id}`}
        aria-current={selected ? 'true' : undefined}
        aria-busy={busy || undefined}
        aria-label={busy ? `${task.title}，进行中` : task.title}
        tabIndex={tabIndex}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] leading-5 outline-none',
          'hover:bg-sidebar-accent/70 focus-visible:ring-3 focus-visible:ring-ring/50',
          selected
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-foreground/80',
        )}
        onClick={() => onSelect(task.id)}
      >
        {busy ? (
          <Loader2
            className='size-3 shrink-0 animate-spin text-muted-foreground'
            aria-hidden
            data-testid={`task-busy-${task.id}`}
          />
        ) : null}
        <span className='min-w-0 flex-1 truncate'>{task.title}</span>
      </button>
      {onDelete ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-testid={`task-delete-${task.id}`}
          className='absolute end-0.5 top-1/2 size-7 -translate-y-1/2 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
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
