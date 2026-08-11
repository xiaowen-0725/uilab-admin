import { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CircleCheck,
  CircleX,
  LoaderCircle,
  Puzzle,
  RefreshCw,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CapabilityController } from '../application/capability-controller'
import {
  useCapabilitySnapshot,
  useCapabilitySnapshotError,
} from '../application/use-capability-snapshot'
import type {
  CapabilityConnectionState,
  CapabilitySnapshotConnector,
} from '../ports/capability-snapshot-port'
import { connectorBrandIconNode } from './brand-icons'

export interface CapabilityManagementSurfaceProps {
  controller?: CapabilityController | null
  taskId?: string | null
  onBack: () => void
}

export function CapabilityManagementSurface({
  controller = null,
  taskId = null,
  onBack,
}: CapabilityManagementSurfaceProps) {
  const snapshot = useCapabilitySnapshot(controller, taskId)
  const error = useCapabilitySnapshotError(controller, taskId)
  const [pendingConnectorId, setPendingConnectorId] = useState<string | null>(
    null
  )
  const [activeSection, setActiveSection] = useState<
    'connectors' | 'experts' | 'skills'
  >('connectors')
  const [revokeTarget, setRevokeTarget] =
    useState<CapabilitySnapshotConnector | null>(null)
  const [actionNotice, setActionNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const refresh = async (connectorId?: string) => {
    if (!controller) return
    setPendingConnectorId(connectorId ?? '__catalog__')
    setActionNotice(null)
    try {
      await controller.refreshAuth(taskId, connectorId)
    } catch (cause) {
      setActionNotice({
        tone: 'error',
        message:
          cause instanceof Error ? cause.message : '刷新连接器状态失败，请重试',
      })
    } finally {
      setPendingConnectorId(null)
    }
  }

  const connect = async (connectorId: string) => {
    if (!controller) return
    setPendingConnectorId(connectorId)
    setActionNotice(null)
    try {
      const result = await controller.startAuth(connectorId)
      if (result?.ok && result.verificationUrl) {
        window.open(result.verificationUrl, '_blank', 'noopener,noreferrer')
      }
      if (result && !result.ok) {
        setActionNotice({ tone: 'error', message: result.message })
      } else if (result?.message) {
        setActionNotice({ tone: 'success', message: result.message })
      }
      await controller.refreshAuth(taskId, connectorId)
    } catch (cause) {
      setActionNotice({
        tone: 'error',
        message:
          cause instanceof Error ? cause.message : '启动连接器授权失败，请重试',
      })
    } finally {
      setPendingConnectorId(null)
    }
  }

  const revoke = async (connectorId: string) => {
    if (!controller) return
    setPendingConnectorId(connectorId)
    setActionNotice(null)
    try {
      const result = await controller.revokeAuth(taskId, connectorId)
      setActionNotice({
        tone: 'success',
        message: result.needsSidecarRestart
          ? `${result.message}。已加载的 MCP 会话可能需要重启本地侧车才能完全清理。`
          : result.message,
      })
      setRevokeTarget(null)
    } catch (cause) {
      setActionNotice({
        tone: 'error',
        message:
          cause instanceof Error ? cause.message : '撤销账号连接失败，请重试',
      })
      await controller.refreshAuth(taskId, connectorId).catch(() => {
        // Preserve the revoke error; a later catalog refresh remains available.
      })
    } finally {
      setPendingConnectorId(null)
    }
  }

  return (
    <section
      className='flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background'
      data-testid='capability-management-surface'
      aria-labelledby='capability-management-title'
    >
      <header className='flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'>
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          data-testid='capability-management-back'
          aria-label='返回任务'
          onClick={onBack}
        >
          <ArrowLeft className='size-4' aria-hidden />
        </Button>
        <Puzzle className='size-4 text-muted-foreground' aria-hidden />
        <h1
          id='capability-management-title'
          className='text-sm leading-none font-semibold'
        >
          专家、技能与连接器
        </h1>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7'>
          <nav
            className='flex w-fit items-center gap-1 rounded-lg bg-muted/45 p-1'
            aria-label='能力目录分类'
          >
            {(
              [
                ['connectors', '连接器', snapshot?.connectors.length ?? 0],
                ['experts', '专家', snapshot?.experts.length ?? 0],
                ['skills', '技能', snapshot?.skills.length ?? 0],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type='button'
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeSection === id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-current={activeSection === id ? 'page' : undefined}
                data-testid={`capability-management-tab-${id}`}
                onClick={() => setActiveSection(id)}
              >
                {label}
                <span className='ml-1.5 text-[10px] text-muted-foreground'>
                  {count}
                </span>
              </button>
            ))}
          </nav>

          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <h2 className='text-base font-semibold'>
                {activeSection === 'connectors'
                  ? '连接器'
                  : activeSection === 'experts'
                    ? '专家'
                    : '技能'}
              </h2>
              <p className='mt-1 max-w-2xl text-sm leading-6 text-muted-foreground'>
                {activeSection === 'connectors'
                  ? '在这里管理账号连接；当前任务使用哪些连接器，仍由输入框中的能力菜单决定。'
                  : activeSection === 'experts'
                    ? '查看可用专家及其预置能力；当前任务选择仍由输入框中的能力菜单决定。'
                    : '查看工作区与专家提供的技能；当前任务选择仍由输入框中的能力菜单决定。'}
              </p>
            </div>
            {activeSection === 'connectors' ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={!controller || pendingConnectorId != null}
                onClick={() => void refresh()}
              >
                <RefreshCw
                  className={cn(
                    'size-3.5',
                    pendingConnectorId === '__catalog__' && 'animate-spin'
                  )}
                  aria-hidden
                />
                刷新状态
              </Button>
            ) : null}
          </div>

          {actionNotice ? (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                actionNotice.tone === 'error'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-border bg-muted/35 text-foreground'
              )}
              role={actionNotice.tone === 'error' ? 'alert' : 'status'}
              data-testid='capability-management-action-notice'
            >
              {actionNotice.tone === 'error' ? (
                <CircleX className='mt-0.5 size-4 shrink-0' aria-hidden />
              ) : (
                <CircleCheck
                  className='mt-0.5 size-4 shrink-0 text-emerald-600'
                  aria-hidden
                />
              )}
              <span className='leading-5'>{actionNotice.message}</span>
            </div>
          ) : null}

          {error ? (
            <div
              className='rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5'
              data-testid='capability-management-error'
              role='alert'
            >
              <div className='flex items-start gap-3'>
                <CircleX
                  className='mt-0.5 size-4 shrink-0 text-destructive'
                  aria-hidden
                />
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-medium'>连接器状态加载失败</p>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {error.message}
                  </p>
                </div>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => void controller?.refresh(taskId)}
                >
                  重试
                </Button>
              </div>
            </div>
          ) : snapshot && activeSection === 'connectors' ? (
            snapshot.connectors.length > 0 ? (
              <div className='grid gap-3 md:grid-cols-2'>
                {snapshot.connectors.map((connector) => (
                  <ConnectorCard
                    key={connector.id}
                    connector={connector}
                    pending={pendingConnectorId === connector.id}
                    onConnect={() => void connect(connector.id)}
                    onRefresh={() => void refresh(connector.id)}
                    onRevoke={() => setRevokeTarget(connector)}
                  />
                ))}
              </div>
            ) : (
              <div
                className='rounded-xl border border-dashed border-border px-6 py-12 text-center'
                data-testid='capability-management-empty'
              >
                <Puzzle
                  className='mx-auto size-5 text-muted-foreground'
                  aria-hidden
                />
                <p className='mt-3 text-sm font-medium'>暂无可用连接器</p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  安装或启用连接器后，它们会自动出现在这里。
                </p>
              </div>
            )
          ) : snapshot && activeSection === 'experts' ? (
            snapshot.experts.length > 0 ? (
              <div className='grid gap-3 md:grid-cols-2'>
                {snapshot.experts.map((expert) => (
                  <article
                    key={expert.id}
                    className='rounded-xl border border-border bg-card p-4'
                    data-testid={`capability-management-expert-${expert.id}`}
                  >
                    <div className='flex items-start gap-3'>
                      <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/55'>
                        <UserRound
                          className='size-4 text-muted-foreground'
                          aria-hidden
                        />
                      </div>
                      <div className='min-w-0'>
                        <h3 className='text-sm font-semibold'>{expert.name}</h3>
                        <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                          {expert.description}
                        </p>
                        <p className='mt-3 text-[11px] text-muted-foreground'>
                          {expert.skills.length} 项技能 ·{' '}
                          {expert.connectors.length} 个连接器
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <CatalogEmpty
                icon={UserRound}
                title='暂无可用专家'
                description='专家目录更新后会自动出现在这里。'
              />
            )
          ) : snapshot && activeSection === 'skills' ? (
            snapshot.skills.length > 0 ? (
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                {snapshot.skills.map((skill) => (
                  <article
                    key={skill.id}
                    className='flex items-center gap-3 rounded-xl border border-border bg-card p-4'
                    data-testid={`capability-management-skill-${skill.id}`}
                  >
                    <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/55'>
                      <BookOpen
                        className='size-4 text-muted-foreground'
                        aria-hidden
                      />
                    </div>
                    <div className='min-w-0'>
                      <h3 className='truncate text-sm font-semibold'>
                        {skill.name}
                      </h3>
                      <p className='mt-1 text-[11px] text-muted-foreground'>
                        {skill.source === 'workspace'
                          ? '工作区技能'
                          : skill.source === 'expert-default'
                            ? '专家预置'
                            : '技能目录'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <CatalogEmpty
                icon={BookOpen}
                title='暂无可用技能'
                description='工作区发现技能后会自动出现在这里。'
              />
            )
          ) : (
            <div
              className='flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-12 text-sm text-muted-foreground'
              data-testid='capability-management-loading'
            >
              <LoaderCircle className='size-4 animate-spin' aria-hidden />
              正在加载连接器…
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={revokeTarget != null}
        onOpenChange={(open) => {
          if (!open && pendingConnectorId == null) setRevokeTarget(null)
        }}
      >
        <DialogContent showCloseButton={pendingConnectorId == null}>
          <DialogHeader>
            <DialogTitle>撤销{revokeTarget?.name ?? ''}连接？</DialogTitle>
            <DialogDescription>
              这会撤销账号级凭据并立即阻止后续能力调用，不会改动当前任务的能力选择。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button type='button' variant='outline' />}
              disabled={pendingConnectorId != null}
            >
              取消
            </DialogClose>
            <Button
              type='button'
              variant='destructive'
              disabled={!revokeTarget || pendingConnectorId != null}
              onClick={() => {
                if (revokeTarget) void revoke(revokeTarget.id)
              }}
            >
              {pendingConnectorId ? (
                <LoaderCircle className='size-3.5 animate-spin' aria-hidden />
              ) : null}
              确认撤销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function CatalogEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Puzzle
  title: string
  description: string
}) {
  return (
    <div className='rounded-xl border border-dashed border-border px-6 py-12 text-center'>
      <Icon className='mx-auto size-5 text-muted-foreground' aria-hidden />
      <p className='mt-3 text-sm font-medium'>{title}</p>
      <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
    </div>
  )
}

function ConnectorCard({
  connector,
  pending,
  onConnect,
  onRefresh,
  onRevoke,
}: {
  connector: CapabilitySnapshotConnector
  pending: boolean
  onConnect: () => void
  onRefresh: () => void
  onRevoke: () => void
}) {
  const connected = connector.connectionState === 'connected'
  const ready = connected || connector.connectionState === 'none_required'

  return (
    <article
      className='flex min-h-36 flex-col rounded-xl border border-border bg-card p-4'
      data-testid={`capability-management-connector-${connector.id}`}
    >
      <div className='flex items-start gap-3'>
        <div className='flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/35'>
          {connectorBrandIconNode(connector.id, connector.name) ?? (
            <span className='text-xs font-semibold text-muted-foreground'>
              {connector.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <h3 className='truncate text-sm font-semibold'>{connector.name}</h3>
          <p className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>
            {connector.description}
          </p>
        </div>
      </div>

      <div className='mt-auto flex items-end justify-between gap-3 pt-4'>
        <div
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-xs',
            ready ? 'text-foreground' : 'text-muted-foreground'
          )}
          data-testid={`capability-management-status-${connector.id}`}
        >
          {ready ? (
            <CircleCheck className='size-3.5 shrink-0 text-emerald-600' />
          ) : (
            <span className='size-1.5 shrink-0 rounded-full bg-muted-foreground/55' />
          )}
          <span className='truncate'>{connectionStatusLabel(connector)}</span>
        </div>

        <div className='flex shrink-0 items-center gap-1'>
          {connected ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={pending}
              aria-label={`刷新${connector.name}状态`}
              onClick={onRefresh}
            >
              {pending ? (
                <LoaderCircle className='size-3.5 animate-spin' aria-hidden />
              ) : null}
              刷新
            </Button>
          ) : connector.connectionState !== 'none_required' ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={pending || connector.connectionState === 'unavailable'}
              aria-label={`连接${connector.name}`}
              onClick={onConnect}
            >
              {pending ? (
                <LoaderCircle className='size-3.5 animate-spin' aria-hidden />
              ) : null}
              连接
            </Button>
          ) : null}
          {connected ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={pending}
              className='text-destructive hover:text-destructive'
              aria-label={`撤销${connector.name}连接`}
              onClick={onRevoke}
            >
              撤销
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function connectionStatusLabel(connector: CapabilitySnapshotConnector) {
  const stateLabels: Record<CapabilityConnectionState, string> = {
    connected: '已连接',
    missing: '尚未连接',
    expired: '授权已过期',
    error: '连接异常',
    none_required: '无需授权',
    auth_in_progress: '等待授权',
    unavailable: '当前不可用',
  }
  const base = stateLabels[connector.connectionState]
  if (connector.connectionState !== 'connected') return base

  const authKinds = [
    ...new Set(
      (connector.channelAuth ?? []).map(({ authKind }) =>
        authKindLabel(authKind)
      )
    ),
  ]
  return authKinds.length > 0 ? `${base} · ${authKinds.join(' + ')}` : base
}

function authKindLabel(authKind: string) {
  const labels: Record<string, string> = {
    cli_session: 'CLI Session',
    oauth2: 'OAuth 2.0',
    static_bearer: 'API Token',
  }
  return labels[authKind] ?? authKind
}
