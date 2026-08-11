import { useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Filter,
  Kanban,
  Loader2,
  MessageSquarePlus,
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
  busyTaskIds?: ReadonlySet<string>
  open: boolean
  mode: 'reserved' | 'overlay'
  onSelectTask: (taskId: string) => void
  onNewChat?: () => void
  onDeleteTask?: (taskId: string) => void
  onSelectProject?: (projectId: string) => void
  onRenameProject?: (projectId: string, name: string) => void
  onClose?: () => void
  /** Collapse / open left rail (control lives on the rail, not Task chrome). */
  onToggleNavigator?: () => void
  onOpenSettings?: () => void
}

type NavItemId = 'new-chat' | 'board' | 'skills-connectors' | 'automation'

type NavItem = {
  id: NavItemId
  label: string
  icon: LucideIcon
  /** Only 新对话 is wired today. */
  action?: 'new-chat'
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'new-chat', label: '新对话', icon: MessageSquarePlus, action: 'new-chat' },
  { id: 'board', label: '看板', icon: Kanban },
  { id: 'skills-connectors', label: '专家·技能·连接器', icon: Puzzle },
  { id: 'automation', label: '自动化', icon: Workflow },
]

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

const DISPLAY_VERSION = 'V1.0.0'

const iconBtnClass =
  'inline-flex size-7 items-center justify-center rounded-md text-foreground/70 outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40'

/** Left rail: toolbar → brand → IA menu → task list. */
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
  onToggleNavigator,
  onOpenSettings,
}: NavigatorProps) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [activeNav, setActiveNav] = useState<NavItemId>('new-chat')
  const [tasksExpanded, setTasksExpanded] = useState(true)

  const filterActive = statusFilter !== 'all' || timeFilter !== 'all'
  const projectName = project?.name ?? '…'
  const tabIndex = open ? 0 : -1

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((task) => task.title.toLowerCase().includes(q))
  }, [tasks, query])

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
      className='flex h-full w-[var(--navigator-width)] max-w-none flex-col bg-sidebar text-sidebar-foreground dark:bg-[color(srgb_0.129412_0.129412_0.129412_/_0.7)]'
      data-slot='navigator'
      data-testid='navigator'
      data-mode={mode}
      data-open={open ? 'true' : 'false'}
      aria-label='工作台导航'
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className='flex h-11 shrink-0 items-center justify-end gap-0.5 border-b border-border/40 px-2.5'
        data-testid='navigator-toolbar'
      >
        <RailIconButton
          tabIndex={tabIndex}
          pressed={open}
          ariaLabel='切换导航'
          testId='toggle-navigator'
          title='切换导航'
          onClick={() => {
            if (onToggleNavigator) onToggleNavigator()
            else onClose?.()
          }}
        >
          <PanelLeft className='size-3.5' aria-hidden />
        </RailIconButton>

        <RailIconButton
          tabIndex={tabIndex}
          pressed={searchOpen}
          ariaLabel={searchOpen ? '关闭搜索' : '搜索任务'}
          testId='navigator-search-toggle'
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search className='size-3.5' aria-hidden />
        </RailIconButton>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type='button'
                className={cn(iconBtnClass, filterActive && 'bg-sidebar-accent text-foreground')}
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
            <FilterRadioSection
              title='筛选状态'
              value={statusFilter}
              options={STATUS_FILTERS}
              testIdPrefix='navigator-filter-status'
              onChange={(v) => setStatusFilter(v as StatusFilter)}
            />
            <DropdownMenuSeparator />
            <FilterRadioSection
              title='筛选时间'
              value={timeFilter}
              options={TIME_FILTERS}
              testIdPrefix='navigator-filter-time'
              onChange={(v) => setTimeFilter(v as TimeFilter)}
            />
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
            className='ms-1 h-7 rounded-md px-2 text-xs text-foreground/70 hover:bg-sidebar-accent hover:text-foreground'
            aria-label='关闭导航'
            tabIndex={tabIndex}
            onClick={onClose}
          >
            关闭
          </button>
        ) : null}
      </div>

      <div className='shrink-0 px-3.5 pb-2 pt-1'>
        <p className='truncate text-[13px] leading-5 tracking-tight text-foreground'>
          Workbench
          <span className='ms-1.5 text-foreground/60'>{DISPLAY_VERSION}</span>
        </p>
        <span className='sr-only' data-testid='project-name'>
          {projectName}
        </span>
      </div>

      {searchOpen ? (
        <div className='px-2.5 pb-2'>
          <label className='sr-only' htmlFor='navigator-task-search'>
            搜索任务
          </label>
          <Input
            id='navigator-task-search'
            data-testid='navigator-search-input'
            placeholder='搜索任务…'
            value={query}
            tabIndex={tabIndex}
            className='h-8 bg-sidebar-accent/40 text-xs shadow-none'
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      ) : null}

      <div className='shrink-0 px-2 pb-1' data-testid='navigator-menu'>
        <ul className='flex flex-col gap-0.5'>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const selected = activeNav === item.id
            const wired = item.action === 'new-chat'
            return (
              <li key={item.id}>
                <button
                  type='button'
                  data-testid={
                    wired ? 'navigator-new-chat' : `navigator-menu-${item.id}`
                  }
                  tabIndex={tabIndex}
                  aria-current={selected ? 'true' : undefined}
                  title={
                    wired ? item.label : `${item.label}（菜单占位，功能未接入）`
                  }
                  className={cn(
                    'flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-[13px] leading-5 outline-none',
                    'hover:bg-sidebar-accent/70 focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-foreground',
                  )}
                  onClick={() => handleNavClick(item)}
                >
                  <Icon className='size-4 shrink-0 opacity-90' aria-hidden />
                  <span className='min-w-0 flex-1 truncate text-left'>
                    {item.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

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

      <ScrollArea className='min-h-0 flex-1 px-2 pb-2'>
        <section data-testid='navigator-tasks' className='pt-2'>
          <button
            type='button'
            className='mb-0.5 flex h-7 w-full items-center gap-1 rounded-md px-2 text-[12px] leading-4 text-foreground/70 outline-none hover:bg-sidebar-accent/50 hover:text-foreground'
            tabIndex={tabIndex}
            aria-expanded={tasksExpanded}
            data-testid='navigator-tasks-toggle'
            onClick={() => setTasksExpanded((v) => !v)}
          >
            <span>
              任务
              <span className='ms-0.5 tabular-nums text-foreground/50'>
                ({filteredTasks.length})
              </span>
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 text-foreground/55 transition-transform',
                !tasksExpanded && '-rotate-90',
              )}
              aria-hidden
            />
          </button>

          {tasksExpanded ? (
            <>
              {filterActive ? (
                <p
                  className='px-2 pb-1 text-[12px] leading-4 text-foreground/55'
                  data-testid='navigator-filter-shell-note'
                >
                  筛选仅 UI 占位
                </p>
              ) : null}
              {filteredTasks.length === 0 ? (
                <p
                  className='px-2.5 py-2 text-[13px] leading-5 text-foreground/60'
                  data-testid='navigator-tasks-empty'
                >
                  还没有任务
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

      <NavigatorUserMenu interactive={open} onOpenSettings={onOpenSettings} />
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

function RailIconButton({
  tabIndex,
  pressed,
  ariaLabel,
  testId,
  title,
  onClick,
  children,
}: {
  tabIndex: number
  pressed?: boolean
  ariaLabel: string
  testId: string
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type='button'
      className={cn(iconBtnClass, pressed && 'bg-sidebar-accent text-foreground')}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      data-testid={testId}
      title={title ?? ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function FilterRadioSection({
  title,
  value,
  options,
  testIdPrefix,
  onChange,
}: {
  title: string
  value: string
  options: readonly { value: string; label: string }[]
  testIdPrefix: string
  onChange: (value: string) => void
}) {
  return (
    <>
      <p className='px-1.5 py-1 text-xs font-medium text-muted-foreground'>
        {title}
      </p>
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {options.map((opt) => (
          <DropdownMenuRadioItem
            key={opt.value}
            value={opt.value}
            data-testid={`${testIdPrefix}-${opt.value}`}
          >
            {opt.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
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
            : 'text-foreground/90',
        )}
        onClick={() => onSelect(task.id)}
      >
        {busy ? (
          <Loader2
            className='size-3 shrink-0 animate-spin text-foreground/55'
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
