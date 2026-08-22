import { useMemo, useState, type ReactNode } from 'react'
import type { NavigatorProjectGroup, TaskSummary } from '@/modules/project'
import {
  AlarmClock,
  ChevronDown,
  Filter,
  Folder,
  Kanban,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeft,
  Search,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NavigatorUserMenu } from './navigator-user-menu'
import type { ShellDestination } from '../destination'

export interface NavigatorProps {
  looseTasks: TaskSummary[]
  projectGroups: NavigatorProjectGroup[]
  selectedProjectId: string | null
  selectedTaskId: string | null
  busyTaskIds?: ReadonlySet<string>
  open: boolean
  mode: 'reserved' | 'overlay'
  onSelectTask: (taskId: string) => void
  onNewChat?: () => void
  onDeleteTask?: (taskId: string) => void
  onRemoveProject?: (projectId: string) => void
  onNewProjectChat?: (projectId: string) => void
  projectActionError?: string | null
  onClose?: () => void
  /** Collapse / open left rail (control lives on the rail, not Task chrome). */
  onToggleNavigator?: () => void
  onOpenSettings?: () => void
  activeDestination?: ShellDestination
  onOpenCapabilities?: () => void
  onOpenBoard?: () => void
}

type NavItemId = 'new-chat' | 'board' | 'skills-connectors' | 'automation'

type NavItem = {
  id: NavItemId
  label: string
  icon: LucideIcon
  action?: 'new-chat' | 'open-capabilities' | 'open-board'
}

const NAV_ACTION_KIND: Record<
  NonNullable<NavItem['action']>,
  ShellDestination['kind']
> = {
  'new-chat': 'task',
  'open-capabilities': 'capabilities',
  'open-board': 'board',
}

function isNavItemCurrent(
  item: NavItem,
  destination: ShellDestination,
): boolean {
  return item.action != null && NAV_ACTION_KIND[item.action] === destination.kind
}

function runNavItemAction(
  item: NavItem,
  handlers: {
    onNewChat?: () => void
    onOpenCapabilities?: () => void
    onOpenBoard?: () => void
  },
): void {
  if (item.action === 'new-chat') handlers.onNewChat?.()
  if (item.action === 'open-capabilities') handlers.onOpenCapabilities?.()
  if (item.action === 'open-board') handlers.onOpenBoard?.()
}

const NEW_CHAT_ITEM: NavItem = {
  id: 'new-chat',
  label: '新对话',
  icon: MessageSquarePlus,
  action: 'new-chat',
}

const NAV_DEST_ITEMS: readonly NavItem[] = [
  { id: 'board', label: '看板', icon: Kanban, action: 'open-board' },
  {
    id: 'skills-connectors',
    label: '专家·技能·连接器',
    icon: Sparkles,
    action: 'open-capabilities',
  },
  { id: 'automation', label: '自动化', icon: AlarmClock },
]

const NAV_ITEMS: readonly NavItem[] = [NEW_CHAT_ITEM, ...NAV_DEST_ITEMS]

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
  'inline-flex size-7 items-center justify-center rounded-lg text-black/60 outline-none transition-colors duration-200 ease-in-out hover:bg-black/[0.03] hover:text-black/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 dark:text-white/56 dark:hover:bg-white/[0.05] dark:hover:text-white/84'

const navRowClass =
  'flex h-10 w-full min-w-0 items-center gap-1.5 rounded-xl px-2 text-[14px] leading-5 outline-none transition-colors duration-200 ease-in-out focus-visible:ring-3 focus-visible:ring-ring/50'

const navIdleClass =
  'font-normal text-black/90 hover:bg-black/[0.03] dark:text-white/84 dark:hover:bg-white/[0.05]'

const navSelectedClass = 'bg-black/[0.05] text-black/90 dark:bg-white/[0.10] dark:text-white/84'

const sectionHeaderClass =
  'mb-1 flex min-h-[18px] w-full items-center gap-1 rounded-md px-2 text-[12px] font-normal leading-[18px] text-black/45 outline-none hover:text-black/60 focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-white/42 dark:hover:text-white/56'

/** Left rail: toolbar → primary action → destinations → catalog. */
export function Navigator({
  looseTasks,
  projectGroups,
  selectedProjectId,
  selectedTaskId,
  busyTaskIds,
  open,
  mode,
  onSelectTask,
  onNewChat,
  onDeleteTask,
  onRemoveProject,
  onNewProjectChat,
  onClose,
  onToggleNavigator,
  onOpenSettings,
  activeDestination = { kind: 'task' },
  onOpenCapabilities,
  onOpenBoard,
  projectActionError = null,
}: NavigatorProps) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const [projectFoldOverride, setProjectFoldOverride] = useState<
    Record<string, boolean>
  >({})

  const filterActive = statusFilter !== 'all' || timeFilter !== 'all'
  const tabIndex = open ? 0 : -1
  const taskQuery = query.trim().toLowerCase()

  const filteredLooseTasks = useMemo(() => {
    if (!taskQuery) return looseTasks
    return looseTasks.filter((task) =>
      task.title.toLowerCase().includes(taskQuery),
    )
  }, [looseTasks, taskQuery])

  const filteredProjectGroups = useMemo(() => {
    if (!taskQuery) return projectGroups
    return projectGroups
      .map((group) => ({
        ...group,
        tasks: group.tasks.filter((task) =>
          task.title.toLowerCase().includes(taskQuery),
        ),
      }))
      .filter((group) => group.tasks.length > 0)
  }, [projectGroups, taskQuery])

  const isProjectGroupExpanded = (projectId: string) => {
    if (projectId in projectFoldOverride) return projectFoldOverride[projectId]
    return projectId === selectedProjectId
  }

  const handleNavClick = (item: NavItem) => {
    runNavItemAction(item, { onNewChat, onOpenCapabilities, onOpenBoard })
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
        className='flex h-9 shrink-0 items-center justify-end gap-0.5 px-2'
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
                className={cn(
                  iconBtnClass,
                  filterActive && 'bg-black/[0.05] text-black/90 dark:bg-white/[0.10] dark:text-white/84'
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
            className='ms-1 h-7 rounded-lg px-2 text-xs text-black/60 hover:bg-black/[0.03] hover:text-black/90 dark:text-white/56 dark:hover:bg-white/[0.05] dark:hover:text-white/84'
            aria-label='关闭导航'
            tabIndex={tabIndex}
            onClick={onClose}
          >
            关闭
          </button>
        ) : null}
      </div>

      <div className='shrink-0 px-4 pt-1 pb-2'>
        <p className='truncate text-[14px] leading-5 tracking-tight text-black/90 dark:text-white/84'>
          Workbench
          <span className='ms-1.5 text-[12px] font-normal leading-[18px] text-black/45 dark:text-white/42'>
            {DISPLAY_VERSION}
          </span>
        </p>
      </div>

      {searchOpen ? (
        <div className='px-2 pb-2'>
          <label className='sr-only' htmlFor='navigator-task-search'>
            搜索任务
          </label>
          <Input
            id='navigator-task-search'
            data-testid='navigator-search-input'
            placeholder='搜索任务…'
            value={query}
            tabIndex={tabIndex}
            className='h-8 rounded-xl bg-black/[0.03] text-[13px] shadow-none dark:bg-white/[0.05]'
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      ) : null}

      <div className='shrink-0 px-2 pb-1' data-testid='navigator-menu'>
        <button
          type='button'
          data-testid='navigator-new-chat'
          tabIndex={tabIndex}
          title='新对话'
          className={cn(
            navRowClass,
            'mb-1.5 bg-black/[0.05] font-medium text-black/90 hover:bg-black/[0.06] dark:bg-white/[0.10] dark:text-white/84 dark:hover:bg-white/[0.12]',
          )}
          onClick={() => handleNavClick(NEW_CHAT_ITEM)}
        >
          <MessageSquarePlus className='size-[18px] shrink-0' aria-hidden />
          <span className='min-w-0 flex-1 truncate text-left'>
            {NEW_CHAT_ITEM.label}
          </span>
          <NewChatShortcutHint />
        </button>
        <ul className='flex flex-col gap-1.5'>
          {NAV_DEST_ITEMS.map((item) => {
            const Icon = item.icon
            const selected = isNavItemCurrent(item, activeDestination)
            const wired = item.action != null
            return (
              <li key={item.id}>
                <button
                  type='button'
                  data-testid={`navigator-menu-${item.id}`}
                  tabIndex={tabIndex}
                  aria-current={selected ? 'page' : undefined}
                  title={
                    wired ? item.label : `${item.label}（菜单占位，功能未接入）`
                  }
                  className={cn(
                    navRowClass,
                    selected ? navSelectedClass : navIdleClass,
                  )}
                  onClick={() => handleNavClick(item)}
                >
                  <Icon className='size-[18px] shrink-0' aria-hidden />
                  <span className='min-w-0 flex-1 truncate text-left'>
                    {item.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {projectActionError ? (
        <p
          className='px-2.5 pb-1 text-[11px] leading-4 text-destructive'
          data-testid='project-action-error'
        >
          {projectActionError}
        </p>
      ) : null}

      <ScrollArea className='min-h-0 flex-1 px-2 pb-2'>
        <section data-testid='navigator-tasks' className='pt-4'>
          <button
            type='button'
            className={sectionHeaderClass}
            tabIndex={tabIndex}
            aria-expanded={tasksExpanded}
            data-testid='navigator-tasks-toggle'
            onClick={() => setTasksExpanded((v) => !v)}
          >
            <span>
              任务
              <span className='ms-0.5 tabular-nums'>
                ({filteredLooseTasks.length})
              </span>
            </span>
            <ChevronDown
              className={cn(
                'size-3 shrink-0 transition-transform',
                !tasksExpanded && '-rotate-90'
              )}
              aria-hidden
            />
          </button>

          {tasksExpanded ? (
            <>
              {filterActive ? (
                <p
                  className='px-2 pb-1 text-[12px] leading-[18px] text-black/45 dark:text-white/42'
                  data-testid='navigator-filter-shell-note'
                >
                  筛选仅 UI 占位
                </p>
              ) : null}
              {filteredLooseTasks.length === 0 ? (
                <p
                  className='px-3 py-2 text-[14px] leading-5 text-black/45 dark:text-white/42'
                  data-testid='navigator-tasks-empty'
                >
                  还没有任务
                </p>
              ) : (
                <ul className='flex flex-col ps-3'>
                  {filteredLooseTasks.map((task) => (
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

        {filteredProjectGroups.length > 0 ? (
          <section data-testid='navigator-projects' className='pt-5'>
            <button
              type='button'
              className={sectionHeaderClass}
              tabIndex={tabIndex}
              aria-expanded={projectsExpanded}
              data-testid='navigator-projects-toggle'
              onClick={() => setProjectsExpanded((v) => !v)}
            >
              <span>
                项目
                <span className='ms-0.5 tabular-nums'>
                  ({filteredProjectGroups.length})
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'size-3 shrink-0 transition-transform',
                  !projectsExpanded && '-rotate-90'
                )}
                aria-hidden
              />
            </button>

            {projectsExpanded
              ? filteredProjectGroups.map((group) => {
                  const expanded = isProjectGroupExpanded(group.project.id)
                  return (
                    <div
                      key={group.project.id}
                      data-testid={`navigator-project-group-${group.project.id}`}
                    >
                      <div className='group/project flex h-10 items-center rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'>
                        <button
                          type='button'
                          className='flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 text-left text-[14px] leading-5 font-normal text-black/90 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-white/84'
                          tabIndex={tabIndex}
                          aria-expanded={expanded}
                          data-testid={`navigator-project-group-toggle-${group.project.id}`}
                          onClick={() =>
                            setProjectFoldOverride((prev) => ({
                              ...prev,
                              [group.project.id]: !expanded,
                            }))
                          }
                        >
                          <Folder
                            className='size-[18px] shrink-0 text-black/45 dark:text-white/42'
                            aria-hidden
                          />
                          <span className='min-w-0 flex-1 truncate'>
                            {group.project.name}
                          </span>
                          <ChevronDown
                            className={cn(
                              'size-3 shrink-0 text-black/45 transition-transform dark:text-white/42',
                              !expanded && '-rotate-90'
                            )}
                            aria-hidden
                          />
                        </button>
                        {onRemoveProject ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type='button'
                                  className={cn(
                                    iconBtnClass,
                                    'opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100',
                                  )}
                                  tabIndex={tabIndex}
                                  aria-label={`${group.project.name} 项目操作`}
                                  data-testid={`navigator-project-menu-${group.project.id}`}
                                  title='项目操作'
                                />
                              }
                            >
                              <MoreHorizontal
                                className='size-3.5'
                                aria-hidden
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align='start'
                              side='bottom'
                              className='min-w-44'
                              data-testid={`navigator-project-menu-content-${group.project.id}`}
                            >
                              <DropdownMenuItem
                                variant='destructive'
                                data-testid={`navigator-project-remove-${group.project.id}`}
                                onClick={() =>
                                  onRemoveProject(group.project.id)
                                }
                              >
                                <Trash2 aria-hidden />
                                <span>从列表中移除</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                        {onNewProjectChat ? (
                          <button
                            type='button'
                            className={cn(
                              iconBtnClass,
                              'me-0.5 opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100',
                            )}
                            tabIndex={tabIndex}
                            aria-label={`在 ${group.project.name} 中新建对话`}
                            data-testid={`navigator-project-new-chat-${group.project.id}`}
                            title='新建对话'
                            onClick={() => {
                              setProjectFoldOverride((prev) => ({
                                ...prev,
                                [group.project.id]: true,
                              }))
                              onNewProjectChat(group.project.id)
                            }}
                          >
                            <MessageSquarePlus
                              className='size-3.5'
                              aria-hidden
                            />
                          </button>
                        ) : null}
                      </div>
                      {expanded ? (
                        <ul className='flex flex-col ps-3'>
                          {group.tasks.map((task) => (
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
                      ) : null}
                    </div>
                  )
                })
              : null}
          </section>
        ) : null}
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

export function NavigatorCollapsedRail({
  activeDestination,
  onNewChat,
  onOpenBoard,
  onOpenCapabilities,
  onToggleNavigator,
}: {
  activeDestination: ShellDestination
  onNewChat?: () => void
  onOpenBoard?: () => void
  onOpenCapabilities?: () => void
  onToggleNavigator?: () => void
}) {
  const handleNavClick = (item: NavItem) => {
    runNavItemAction(item, { onNewChat, onOpenCapabilities, onOpenBoard })
  }

  return (
    <nav
      className='nav-collapsed-rail bg-sidebar text-sidebar-foreground'
      data-testid='navigator-collapsed-rail'
      aria-label='收起的工作台导航'
    >
      <RailIconButton
        tabIndex={0}
        pressed={false}
        ariaLabel='打开导航'
        testId='toggle-navigator'
        title='打开导航'
        onClick={() => onToggleNavigator?.()}
      >
        <PanelLeft className='size-3.5' aria-hidden />
      </RailIconButton>
      {NAV_ITEMS.filter((item) => item.action != null).map((item) => {
        const Icon = item.icon
        const selected = isNavItemCurrent(item, activeDestination)
        return (
          <RailIconButton
            key={item.id}
            tabIndex={0}
            pressed={selected}
            ariaLabel={item.label}
            testId={
              item.action === 'new-chat'
                ? 'navigator-rail-new-chat'
                : `navigator-rail-${item.id}`
            }
            title={item.label}
            onClick={() => handleNavClick(item)}
          >
            <Icon className='size-3.5' aria-hidden />
          </RailIconButton>
        )
      })}
    </nav>
  )
}

function NewChatShortcutHint() {
  const isApple =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
  const keycap =
    'inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-black/[0.05] px-0.5 text-[10px] leading-none font-normal text-black/45 dark:bg-white/[0.08] dark:text-white/42'
  return (
    <span className='ms-auto flex shrink-0 items-center gap-0.5' aria-hidden>
      <kbd className={keycap}>{isApple ? '⌘' : 'Ctrl'}</kbd>
      <kbd className={keycap}>K</kbd>
    </span>
  )
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
      className={cn(
        iconBtnClass,
        pressed && 'bg-sidebar-accent text-foreground'
      )}
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
          'flex h-10 w-full items-center gap-1.5 rounded-xl px-2 text-left text-[14px] leading-5 font-normal outline-none',
          'transition-colors duration-200 ease-in-out hover:bg-black/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/[0.05]',
          selected
            ? 'bg-black/[0.05] text-black/90 dark:bg-white/[0.10] dark:text-white/84'
            : 'text-black/90 dark:text-white/84'
        )}
        onClick={() => onSelect(task.id)}
      >
        {busy ? (
          <Loader2
            className='size-3 shrink-0 animate-spin text-black/45 dark:text-white/42'
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
