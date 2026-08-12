/**
 * WorkBuddy-style Composer「+」menu:
 * compact root + lateral submenu (DropdownMenu Sub), not a full-width panel.
 */
import { useMemo, useRef, useState, type RefObject } from 'react'
import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  CircleDashed,
  CircleHelp,
  Lightbulb,
  Link2,
  Paperclip,
  Search,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotConnector,
} from '../ports/capability-snapshot-port'
import { renderBrandIcon } from './brand-icons'

export type CapabilityAddMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactElement
  snapshot: CapabilitySnapshot | null
  busy?: boolean
  errorMessage?: string
  onRetry?: () => void
  onPickFiles: () => void
  onEnableGoal: () => void
  onEnablePlan: () => void
  onToggleConnector: (connectorId: string, selected: boolean) => void
  onToggleSkill: (skillId: string, selected: boolean) => void
  onSelectExpert: (expertId: string | null) => void
  onStartAuth: (connectorId: string) => void | Promise<void>
  onRefreshAuth: () => void | Promise<void>
  onManageConnectors?: () => void
}

function ConnectorGlyph({
  connector,
}: {
  connector: CapabilitySnapshotConnector
}) {
  return renderBrandIcon(connector.brandIconKey, connector.name, 'size-4 text-[10px]')
}

function connectorAccountStatus(
  connector: CapabilitySnapshotConnector
): string {
  if (connector.connected) return '已连接'
  if (connector.connectionState === 'auth_in_progress') return '连接中'
  if (connector.connectionState === 'expired') return '授权已过期'
  if (connector.connectionState === 'error') return '连接异常'
  if (connector.connectionState === 'unavailable') return '当前不可用'
  if (connector.connectionState === 'none_required') return '无需连接'
  return '未连接'
}

function SubSearch({
  value,
  onChange,
  placeholder,
  testId,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  testId: string
  inputRef: RefObject<HTMLInputElement | null>
}) {
  return (
    <label className='mb-1 flex h-10 items-center gap-1.5 rounded-lg bg-muted/40 px-2 text-muted-foreground'>
      <Search className='size-3.5 shrink-0' aria-hidden />
      <input
        ref={inputRef}
        type='search'
        id={testId}
        name={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace('（按 /）', '')}
        aria-keyshortcuts='/'
        data-testid={testId}
        className='h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground'
        // Keep focus inside submenu; don't let menu typeahead steal keys
        onKeyDown={(event) => {
          if (!['Escape', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.stopPropagation()
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  )
}

export function CapabilityAddMenu({
  open,
  onOpenChange,
  trigger,
  snapshot,
  busy,
  errorMessage,
  onRetry,
  onPickFiles,
  onEnableGoal,
  onEnablePlan,
  onToggleConnector,
  onToggleSkill,
  onSelectExpert,
  onStartAuth,
  onRefreshAuth,
  onManageConnectors,
}: CapabilityAddMenuProps) {
  const [connectorQuery, setConnectorQuery] = useState('')
  const [skillQuery, setSkillQuery] = useState('')
  const [expertQuery, setExpertQuery] = useState('')
  const supportDetails = [snapshot?.honesty.note, errorMessage]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
  const expertSearchRef = useRef<HTMLInputElement>(null)
  const skillSearchRef = useRef<HTMLInputElement>(null)
  const connectorSearchRef = useRef<HTMLInputElement>(null)

  const focusSearchOnShortcut = (
    event: React.KeyboardEvent,
    inputRef: RefObject<HTMLInputElement | null>
  ) => {
    if (event.key !== '/' || event.target instanceof HTMLInputElement) return
    event.preventDefault()
    event.stopPropagation()
    inputRef.current?.focus()
  }

  const connectors = useMemo(() => {
    const rows = snapshot?.connectors ?? []
    const q = connectorQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    )
  }, [snapshot, connectorQuery])

  const skills = useMemo(() => {
    const rows = snapshot?.skills ?? []
    const q = skillQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    )
  }, [snapshot, skillQuery])

  const experts = useMemo(() => {
    const rows = snapshot?.experts ?? []
    const q = expertQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
    )
  }, [snapshot, expertQuery])

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setConnectorQuery('')
          setSkillQuery('')
          setExpertQuery('')
        }
      }}
    >
      <DropdownMenuTrigger render={trigger} data-testid='composer-add' />
      <DropdownMenuContent
        align='start'
        side='top'
        sideOffset={8}
        className={cn(
          // Compact root — NOT full composer width (WorkBuddy)
          'w-52 max-w-56 min-w-52 p-1',
          'rounded-xl shadow-lg'
        )}
        data-testid='composer-add-panel'
      >
        <DropdownMenuItem
          data-testid='composer-add-files'
          className='min-h-10 gap-2 rounded-lg px-2 py-2'
          onClick={() => {
            onPickFiles()
            onOpenChange(false)
          }}
        >
          <Paperclip className='size-4' />
          <span className='flex-1'>添加文件</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-testid='composer-add-mode-nav'
            className='min-h-10 gap-2 rounded-lg px-2 py-2'
          >
            <Sparkles className='size-4' />
            <span className='flex-1'>模式</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            side='right'
            align='start'
            sideOffset={6}
            className='w-52 rounded-xl p-1'
          >
            <DropdownMenuItem
              data-testid='composer-add-goal'
              className='min-h-10 gap-2 rounded-lg px-2 py-2'
              onClick={() => {
                onEnableGoal()
                onOpenChange(false)
              }}
            >
              <Target className='size-4' />
              目标
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid='composer-add-plan'
              className='min-h-10 gap-2 rounded-lg px-2 py-2'
              onClick={() => {
                onEnablePlan()
                onOpenChange(false)
              }}
            >
              <Lightbulb className='size-4' />
              计划模式
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-testid='composer-add-experts-nav'
            className='min-h-10 gap-2 rounded-lg px-2 py-2'
          >
            <UserRound className='size-4' />
            <span className='flex-1'>专家</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            side='right'
            align='start'
            sideOffset={6}
            className='max-h-72 w-64 rounded-xl p-1.5'
            data-testid='capability-experts-submenu'
            onKeyDown={(event) => focusSearchOnShortcut(event, expertSearchRef)}
          >
            <SubSearch
              value={expertQuery}
              onChange={setExpertQuery}
              placeholder='搜索专家（按 /）'
              testId='capability-expert-search'
              inputRef={expertSearchRef}
            />
            <div className='max-h-52 overflow-y-auto'>
              <DropdownMenuCheckboxItem
                checked={!snapshot?.selection.expertId}
                data-testid='capability-expert-none'
                className='min-h-10 rounded-lg px-2'
                // Keep submenu open while toggling
                closeOnClick={false}
                onCheckedChange={(checked) => {
                  if (checked) onSelectExpert(null)
                }}
              >
                <CircleDashed className='size-4' />
                无专家
              </DropdownMenuCheckboxItem>
              {experts.length === 0 ? (
                <p className='px-2 py-2 text-[12px] text-muted-foreground'>
                  {busy ? '加载中…' : '暂无专家'}
                </p>
              ) : (
                experts.map((e) => (
                  <DropdownMenuCheckboxItem
                    key={e.id}
                    checked={snapshot?.selection.expertId === e.id}
                    data-testid={`capability-expert-${e.id}`}
                    className='min-h-10 rounded-lg px-2'
                    closeOnClick={false}
                    onCheckedChange={(checked) => {
                      onSelectExpert(checked ? e.id : null)
                    }}
                  >
                    <UserRound className='size-4 shrink-0' />
                    <span className='min-w-0 flex-1 truncate'>{e.name}</span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </div>
            <p className='px-1.5 pt-1 text-xs leading-5 text-muted-foreground'>
              选择专家后，将从下一次发送开始生效
            </p>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-testid='composer-add-skills-nav'
            className='min-h-10 gap-2 rounded-lg px-2 py-2'
          >
            <BookOpen className='size-4' />
            <span className='flex-1'>技能</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            side='right'
            align='start'
            sideOffset={6}
            className='max-h-72 w-64 rounded-xl p-1.5'
            data-testid='capability-skills-submenu'
            onKeyDown={(event) => focusSearchOnShortcut(event, skillSearchRef)}
          >
            <SubSearch
              value={skillQuery}
              onChange={setSkillQuery}
              placeholder='搜索技能（按 /）'
              testId='capability-skill-search'
              inputRef={skillSearchRef}
            />
            <div className='max-h-52 overflow-y-auto'>
              {skills.length === 0 ? (
                <p className='px-2 py-2 text-[12px] text-muted-foreground'>
                  暂无技能
                </p>
              ) : (
                skills.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s.id}
                    checked={s.taskSelected}
                    data-testid={`capability-skill-${s.id}`}
                    className='min-h-10 rounded-lg px-2'
                    closeOnClick={false}
                    onCheckedChange={(checked) => {
                      onToggleSkill(s.id, Boolean(checked))
                    }}
                  >
                    <BookOpen className='size-4 shrink-0' />
                    <span className='min-w-0 flex-1 truncate'>{s.name}</span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-testid='composer-add-connectors-nav'
            className='min-h-10 gap-2 rounded-lg px-2 py-2'
          >
            <Link2 className='size-4' />
            <span className='flex-1'>连接器</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            side='right'
            align='start'
            sideOffset={6}
            className='max-h-80 w-72 rounded-xl p-1.5'
            data-testid='capability-connectors-submenu'
            onKeyDown={(event) =>
              focusSearchOnShortcut(event, connectorSearchRef)
            }
          >
            <SubSearch
              value={connectorQuery}
              onChange={setConnectorQuery}
              placeholder='搜索连接器（按 /）'
              testId='capability-connector-search'
              inputRef={connectorSearchRef}
            />
            {errorMessage ? (
              <div className='space-y-2 px-2 py-2 text-[12px] text-muted-foreground'>
                <p data-testid='capability-connectors-error' role='alert'>
                  暂时无法加载连接器。请重试。
                </p>
                <button
                  type='button'
                  className='inline-flex min-h-10 items-center font-medium text-violet-600 hover:underline dark:text-violet-400'
                  data-testid='capability-connectors-retry'
                  aria-label='重试加载连接器'
                  onClick={onRetry}
                >
                  重试
                </button>
              </div>
            ) : null}
            <div className='max-h-56 overflow-y-auto'>
              {connectors.length === 0 ? (
                <p className='px-2 py-2 text-[12px] text-muted-foreground'>
                  {snapshot ? '无匹配连接器' : busy ? '加载中…' : '暂无连接器'}
                </p>
              ) : (
                connectors.map((c) => {
                  const accountStatus = connectorAccountStatus(c)
                  if (!c.connected) {
                    const connectionAction =
                      c.connectionState === 'expired' ||
                      c.connectionState === 'error'
                        ? '重新连接'
                        : '连接'
                    return (
                      <DropdownMenuItem
                        key={c.id}
                        data-testid={`capability-connector-${c.id}`}
                        data-account-connected='false'
                        data-task-selected={c.taskSelected ? 'true' : 'false'}
                        className='h-auto min-h-12 gap-2 rounded-lg px-2 py-2'
                        closeOnClick={false}
                        onClick={() => {
                          void onStartAuth(c.id)
                        }}
                      >
                        <ConnectorGlyph connector={c} />
                        <span className='flex min-w-0 flex-1 flex-col'>
                          <span className='truncate'>{c.name}</span>
                          <span
                            className='truncate text-xs text-muted-foreground'
                            data-testid={`capability-connector-status-${c.id}`}
                          >
                            {accountStatus}
                          </span>
                        </span>
                        <span
                          className='inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 dark:text-violet-400'
                          data-testid={`capability-connector-login-${c.id}`}
                        >
                          <Link2 className='size-3.5' />
                          {connectionAction}
                        </span>
                      </DropdownMenuItem>
                    )
                  }
                  return (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.taskSelected}
                      data-testid={`capability-connector-${c.id}`}
                      data-account-connected='true'
                      data-task-selected={c.taskSelected ? 'true' : 'false'}
                      className='h-auto min-h-12 gap-2 rounded-lg px-2 py-2 pr-8'
                      closeOnClick={false}
                      disabled={busy}
                      aria-label={
                        c.taskSelected
                          ? `停止为当前任务启用${c.name}，账号已连接`
                          : `为当前任务启用${c.name}，账号已连接`
                      }
                      onCheckedChange={(checked) => {
                        onToggleConnector(c.id, Boolean(checked))
                      }}
                    >
                      <ConnectorGlyph connector={c} />
                      <span className='flex min-w-0 flex-1 flex-col'>
                        <span className='truncate'>{c.name}</span>
                        <span
                          className='truncate text-xs text-muted-foreground'
                          data-testid={`capability-connector-status-${c.id}`}
                        >
                          {accountStatus}
                        </span>
                      </span>
                      <span className='shrink-0 text-xs font-medium text-muted-foreground'>
                        {c.taskSelected ? '已启用' : '启用'}
                      </span>
                    </DropdownMenuCheckboxItem>
                  )
                })
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid='capability-manage-connectors'
              className='min-h-10 gap-2 rounded-lg px-2 py-2'
              disabled={!onManageConnectors}
              aria-label={
                onManageConnectors ? '管理连接器' : '连接器管理暂不可用'
              }
              onClick={() => {
                onManageConnectors?.()
              }}
            >
              {onManageConnectors ? (
                <>
                  <Link2 className='size-4' aria-hidden />
                  <span className='flex-1'>管理连接器</span>
                  <ArrowRight
                    className='size-4 text-muted-foreground'
                    data-navigation-icon='forward'
                    aria-hidden
                  />
                </>
              ) : (
                <>
                  <CircleAlert className='size-4' aria-hidden />
                  <span className='flex-1'>连接器管理暂不可用</span>
                </>
              )}
            </DropdownMenuItem>
            {supportDetails ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  className='min-h-10 gap-2 rounded-lg px-2 py-2'
                  data-testid='capability-support-nav'
                  aria-label='查看连接器支持信息'
                >
                  <CircleHelp className='size-4' aria-hidden />
                  <span className='flex-1'>支持信息</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  side='right'
                  align='end'
                  sideOffset={6}
                  className='w-72 rounded-xl p-2'
                  data-testid='capability-support-details'
                >
                  <p className='px-2 py-1 text-xs font-medium text-foreground'>
                    连接器诊断信息
                  </p>
                  <p className='px-2 py-1.5 text-xs leading-5 text-muted-foreground'>
                    {supportDetails}
                  </p>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            {/* refresh helper after external auth/login completion */}
            <DropdownMenuItem
              className='min-h-10 gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground'
              data-testid='capability-connector-refresh-global'
              closeOnClick={false}
              onClick={() => {
                void onRefreshAuth()
              }}
            >
              刷新连接状态
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
