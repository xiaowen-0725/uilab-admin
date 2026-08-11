/**
 * WorkBuddy-style Composer「+」menu:
 * compact root + lateral submenu (DropdownMenu Sub), not a full-width panel.
 */
import { useMemo, useState } from 'react'
import {
  BookOpen,
  CircleDashed,
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
import { Switch } from '@/components/ui/switch'
import {
  CONNECTOR_FEISHU_ID,
  CONNECTOR_GITHUB_ID,
} from '../model/task-selection'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotConnector,
} from '../ports/capability-snapshot-port'
import { FeishuBrandIcon, GitHubBrandIcon } from './brand-icons'

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
  if (connector.id === CONNECTOR_GITHUB_ID) {
    return <GitHubBrandIcon className='size-4' title={connector.name} />
  }
  if (connector.id === CONNECTOR_FEISHU_ID) {
    return <FeishuBrandIcon className='size-4' title={connector.name} />
  }
  return (
    <span className='flex size-4 items-center justify-center text-[10px] font-semibold text-muted-foreground'>
      {connector.name.slice(0, 1)}
    </span>
  )
}

function connectorAuthSource(connector: CapabilitySnapshotConnector): string {
  const primaryAuth = connector.channelAuth?.find(
    (row) => row.channel === connector.primaryChannel
  )
  const authKind = primaryAuth?.authKind ?? connector.channelAuth?.[0]?.authKind
  if (authKind === 'cli_session') return 'CLI Session'
  if (authKind === 'oauth2') return 'OAuth'
  if (authKind === 'static_bearer') return '访问凭据'
  return '账号'
}

function connectorAccountStatus(
  connector: CapabilitySnapshotConnector
): string {
  const status = (() => {
    if (connector.connected) return '已连接'
    if (connector.connectionState === 'auth_in_progress') return '连接中'
    if (connector.connectionState === 'expired') return '授权已过期'
    if (connector.connectionState === 'error') return '连接异常'
    if (connector.connectionState === 'unavailable') return '当前不可用'
    if (connector.connectionState === 'none_required') return '无需连接'
    return '未连接'
  })()
  return `${status} · ${connectorAuthSource(connector)}`
}

function SubSearch({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  testId: string
}) {
  return (
    <label className='mb-1 flex h-8 items-center gap-1.5 rounded-lg bg-muted/40 px-2 text-muted-foreground'>
      <Search className='size-3.5 shrink-0' aria-hidden />
      <input
        type='search'
        id={testId}
        name={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className='min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground'
        // Keep focus inside submenu; don't let menu typeahead steal keys
        onKeyDown={(e) => e.stopPropagation()}
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
          className='gap-2 rounded-lg px-2 py-2'
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
            className='gap-2 rounded-lg px-2 py-2'
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
              className='gap-2 rounded-lg px-2 py-2'
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
              className='gap-2 rounded-lg px-2 py-2'
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
            className='gap-2 rounded-lg px-2 py-2'
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
          >
            <SubSearch
              value={expertQuery}
              onChange={setExpertQuery}
              placeholder='搜索专家'
              testId='capability-expert-search'
            />
            <div className='max-h-52 overflow-y-auto'>
              <DropdownMenuCheckboxItem
                checked={!snapshot?.selection.expertId}
                data-testid='capability-expert-none'
                className='rounded-lg'
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
                    className='rounded-lg'
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
            <p className='px-1.5 pt-1 text-[10px] leading-snug text-muted-foreground'>
              临时配置包目录；仅影响后续 Turn
            </p>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-testid='composer-add-skills-nav'
            className='gap-2 rounded-lg px-2 py-2'
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
          >
            <SubSearch
              value={skillQuery}
              onChange={setSkillQuery}
              placeholder='搜索技能'
              testId='capability-skill-search'
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
                    className='rounded-lg'
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
            className='gap-2 rounded-lg px-2 py-2'
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
          >
            <SubSearch
              value={connectorQuery}
              onChange={setConnectorQuery}
              placeholder='搜索连接器'
              testId='capability-connector-search'
            />
            {errorMessage ? (
              <div className='space-y-2 px-2 py-2 text-[12px] text-muted-foreground'>
                <p data-testid='capability-connectors-error'>{errorMessage}</p>
                <button
                  type='button'
                  className='font-medium text-violet-600 hover:underline dark:text-violet-400'
                  data-testid='capability-connectors-retry'
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
                        className='h-auto gap-2 rounded-lg px-2 py-2'
                        closeOnClick={false}
                        onClick={() => {
                          void onStartAuth(c.id)
                        }}
                      >
                        <ConnectorGlyph connector={c} />
                        <span className='flex min-w-0 flex-1 flex-col'>
                          <span className='truncate'>{c.name}</span>
                          <span
                            className='truncate text-[11px] text-muted-foreground'
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
                    <DropdownMenuItem
                      key={c.id}
                      data-testid={`capability-connector-${c.id}`}
                      data-account-connected='true'
                      data-task-selected={c.taskSelected ? 'true' : 'false'}
                      className='h-auto gap-2 rounded-lg px-2 py-2'
                      closeOnClick={false}
                      disabled={busy}
                    >
                      <ConnectorGlyph connector={c} />
                      <span className='flex min-w-0 flex-1 flex-col'>
                        <span className='truncate'>{c.name}</span>
                        <span
                          className='truncate text-[11px] text-muted-foreground'
                          data-testid={`capability-connector-status-${c.id}`}
                        >
                          {accountStatus}
                        </span>
                      </span>
                      <span className='flex shrink-0 flex-col items-end gap-0.5'>
                        <span className='text-[10px] leading-none text-muted-foreground'>
                          当前任务
                        </span>
                        <Switch
                          checked={c.taskSelected}
                          disabled={busy}
                          aria-label={
                            c.taskSelected
                              ? `停止为当前任务启用${c.name}`
                              : `为当前任务启用${c.name}`
                          }
                          data-testid={`capability-connector-switch-${c.id}`}
                          onClick={(event) => {
                            event.stopPropagation()
                          }}
                          onCheckedChange={(checked) => {
                            onToggleConnector(c.id, checked)
                          }}
                        />
                      </span>
                    </DropdownMenuItem>
                  )
                })
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid='capability-manage-connectors'
              className='gap-2 rounded-lg px-2 py-2'
              onClick={() => {
                onManageConnectors?.()
              }}
            >
              <Link2 className='size-4' />
              <span className='flex-1'>管理连接器</span>
              <span className='text-[11px] text-muted-foreground'>↗</span>
            </DropdownMenuItem>
            {snapshot?.honesty.note ? (
              <p
                className='px-1.5 pt-0.5 pb-1 text-[10px] leading-snug text-muted-foreground'
                data-testid='capability-honesty-note'
              >
                {snapshot.honesty.note}
              </p>
            ) : null}
            {/* refresh helper after external auth/login completion */}
            <DropdownMenuItem
              className='gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground'
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
