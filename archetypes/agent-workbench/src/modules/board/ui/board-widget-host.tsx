import { useMemo, useRef, type ReactNode } from 'react'
import { DRAG_HANDLE_ATTR } from '../model/drag-handle'
import { Ellipsis, Expand, Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { BoardWidgetId, BoardWidgetStatus } from '../model/types'
import { JOB_RUNTIME_DISCONNECTED } from '../model/refresh-policy'
import {
  identityChromeLabel,
  isIdentityLockedChrome,
  type WidgetIdentityChrome,
} from '../model/widget-render-state'
import {
  buildWidgetDocument,
  type WidgetTheme,
} from '../model/widget-document'
import { BoardWidgetFrame, readHostCspNonce } from './board-widget-frame'
import { useWidgetBridge } from './use-widget-bridge'

export type WidgetChrome = 'full' | 'compact' | 'none'

/** Short host-visible summary of prefilled data — used by tests and AT. */
export function latestPreview(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (row.value != null) return String(row.value)
  if (typeof row.headline === 'string' && row.headline.trim()) return row.headline
  if (Array.isArray(row.points)) return `points:${row.points.length}`
  return null
}

function ChromeStatusIcon({
  testId,
  label,
  tone,
  children,
}: {
  testId: string
  label: string
  tone: 'destructive' | 'muted'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex size-6 items-center justify-center',
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
      )}
      data-testid={testId}
      title={label}
      aria-label={label}
    >
      {children}
    </span>
  )
}

function refreshButtonLabel(
  running: boolean,
  runtimeUnavailable: boolean,
  refreshable: boolean,
): string {
  if (running) return '正在刷新'
  if (!refreshable) return '这个小组件没有取数作业'
  if (runtimeUnavailable) return JOB_RUNTIME_DISCONNECTED
  return '刷新'
}

const IDENTITY_CHROME_TEST_ID: Record<
  Exclude<WidgetIdentityChrome, 'none'>,
  string
> = {
  needs_login: 'board-widget-needs-login',
  needs_relogin: 'board-widget-needs-relogin',
  incomplete_binding: 'board-widget-incomplete-binding',
  permission_revoked: 'board-widget-permission-revoked',
}

type ThumbOverlayKind =
  | 'running'
  | 'needs_relogin'
  | 'needs_login'
  | 'incomplete_binding'
  | 'permission_revoked'
  | 'run_error'

function resolveThumbOverlay(input: {
  chrome: WidgetChrome
  running: boolean
  identityChrome: WidgetIdentityChrome
  status: BoardWidgetStatus
  runError: string | null
}): { kind: ThumbOverlayKind; testId: string; title: string } | null {
  if (input.chrome !== 'none') return null
  if (input.running) {
    return {
      kind: 'running',
      testId: 'board-widget-thumb-running',
      title: '正在刷新',
    }
  }
  if (input.identityChrome !== 'none') {
    const title = identityChromeLabel(input.identityChrome)
    if (title) {
      return {
        kind: input.identityChrome,
        testId: IDENTITY_CHROME_TEST_ID[input.identityChrome],
        title,
      }
    }
  }
  if (input.status === 'error' && input.runError) {
    return {
      kind: 'run_error',
      testId: 'board-widget-run-error',
      title: input.runError,
    }
  }
  return null
}

function IdentityChromeStatus({
  chrome,
}: {
  chrome: Exclude<WidgetIdentityChrome, 'none'>
}): ReactNode {
  const label = identityChromeLabel(chrome)
  if (!label) return null
  const lock = chrome === 'needs_login' || chrome === 'needs_relogin'
  return (
    <ChromeStatusIcon
      testId={IDENTITY_CHROME_TEST_ID[chrome]}
      label={label}
      tone='destructive'
    >
      {lock ? (
        <Lock className='size-3.5' aria-hidden />
      ) : (
        <TriangleAlert className='size-3.5' aria-hidden />
      )}
    </ChromeStatusIcon>
  )
}

function ThumbOverlayIcon({ kind }: { kind: ThumbOverlayKind }): ReactNode {
  if (kind === 'running') {
    return <RefreshCw className='size-2.5 animate-spin' aria-hidden />
  }
  if (kind === 'needs_relogin' || kind === 'needs_login') {
    return <Lock className='size-2.5 text-destructive' aria-hidden />
  }
  return <TriangleAlert className='size-2.5 text-destructive' aria-hidden />
}

function ChromeIconButton({
  testId,
  label,
  onClick,
  disabled,
  children,
}: {
  testId: string
  label: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Button
      type='button'
      size='icon'
      variant='ghost'
      className='size-6 shrink-0'
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export interface BoardWidgetHostProps {
  widgetId: BoardWidgetId
  title: string
  html: string
  data?: unknown
  theme: WidgetTheme
  inputs?: Record<string, unknown>
  canSubmit?: boolean
  chrome?: WidgetChrome
  /** Detail / preview only. List thumbnails must leave this off. */
  heartbeat?: boolean
  heartbeatMs?: number
  heartbeatMissLimit?: number
  /** Sole loading source — must come from widget.status, not a local boolean. */
  status?: BoardWidgetStatus
  runError?: string | null
  /** Render-time identity chrome — not a run status (ADR-0025). */
  identityChrome?: WidgetIdentityChrome
  runtimeUnavailable?: boolean
  /** When false, hide the runtime warning and disable refresh. Default true. */
  hasJob?: boolean
  /** Query sources can refresh without a job. Defaults to hasJob. */
  canRefresh?: boolean
  onRefresh?: () => void
  onExpand?: () => void
  onOpenJob?: () => void
  onSaveInput?: (key: string, value: unknown) => void
  onSubmit?: (payload: unknown) => void
  onOpenLink?: (url: string) => void
  onWheelForward?: (deltaY: number) => void
  onReady?: (elapsedMs: number) => void
  /** Mark the chrome header as the grid move handle. */
  movable?: boolean
  /** Isolate pointer/focus for list thumbnails. */
  inert?: boolean
  /** Example boards with prefilled data and no job (spec §9.5). */
  exampleDataHint?: string | null
  className?: string
}

/**
 * Opaque-origin widget iframe + host chrome + bridge.
 * Independent of the board grid so a Timeline can embed a single widget.
 */
export function BoardWidgetHost({
  widgetId,
  title,
  html,
  data,
  theme,
  inputs = {},
  canSubmit = false,
  chrome = 'full',
  heartbeat,
  heartbeatMs,
  heartbeatMissLimit,
  status = 'idle',
  runError = null,
  identityChrome = 'none',
  runtimeUnavailable = false,
  hasJob = true,
  canRefresh,
  onRefresh,
  onExpand,
  onOpenJob,
  onSaveInput,
  onSubmit,
  onOpenLink,
  onWheelForward,
  onReady,
  movable = false,
  inert = false,
  exampleDataHint = null,
  className,
}: BoardWidgetHostProps) {
  const heartbeatEnabled = heartbeat ?? chrome !== 'none'
  const nonce = useMemo(() => readHostCspNonce(), [])
  const firstPaintTheme = useRef(theme).current
  const srcDoc = useMemo(
    () => buildWidgetDocument({ html, nonce, theme: firstPaintTheme }),
    [html, nonce, firstPaintTheme],
  )

  const bridge = useWidgetBridge({
    data,
    theme,
    inputs,
    canSubmit,
    documentKey: html,
    heartbeat: heartbeatEnabled,
    heartbeatMs,
    heartbeatMissLimit,
    onSaveInput,
    onSubmit,
    onOpenLink,
    onWheelForward,
    onReady,
  })

  const showHeader = chrome !== 'none'
  const showReload = bridge.phase === 'failed' || bridge.phase === 'dead'
  const headerClass = chrome === 'full' ? 'h-9' : 'h-7'
  const titleClass = chrome === 'full' ? 'text-[13px]' : 'text-[12px]'
  const running = status === 'running'
  const refreshable = canRefresh ?? hasJob
  const refreshLabel = refreshButtonLabel(running, runtimeUnavailable, refreshable)
  const identityLocked = isIdentityLockedChrome(identityChrome)
  const showRunError = !identityLocked && status === 'error' && Boolean(runError)
  const showRuntimeWarn = !identityLocked && runtimeUnavailable && refreshable
  const thumbOverlay = resolveThumbOverlay({
    chrome,
    running,
    identityChrome,
    status,
    runError,
  })

  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card',
        className,
      )}
      data-testid='board-widget-host'
      data-widget-id={widgetId}
      data-has-latest={data == null ? 'false' : 'true'}
      data-latest-preview={latestPreview(data) ?? undefined}
      data-widget-status={status}
      data-identity-chrome={identityChrome}
      data-phase={bridge.phase}
      data-chrome={chrome}
      aria-label={title}
      aria-busy={running || undefined}
      inert={inert || undefined}
    >
      {showHeader ? (
        <header
          className={cn(
            'flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2',
            headerClass,
            movable && 'cursor-grab',
          )}
          data-testid='board-widget-chrome'
          {...(movable ? { [DRAG_HANDLE_ATTR]: '' } : {})}
        >
          <h3
            className={cn(
              'min-w-0 flex-1 truncate font-medium text-foreground',
              titleClass,
            )}
          >
            {title}
          </h3>
          {exampleDataHint ? (
            <span
              className='max-w-[52%] truncate text-[10px] leading-tight text-muted-foreground'
              data-testid='board-widget-example-data'
              title={exampleDataHint}
            >
              {exampleDataHint}
            </span>
          ) : null}
          {identityChrome !== 'none' ? (
            <IdentityChromeStatus chrome={identityChrome} />
          ) : null}
          {showRunError ? (
            <ChromeStatusIcon
              testId='board-widget-run-error'
              label={runError ?? ''}
              tone='destructive'
            >
              <TriangleAlert className='size-3.5' aria-hidden />
            </ChromeStatusIcon>
          ) : null}
          {showRuntimeWarn ? (
            <ChromeStatusIcon
              testId='board-widget-runtime-missing'
              label={JOB_RUNTIME_DISCONNECTED}
              tone='muted'
            >
              <TriangleAlert className='size-3.5' aria-hidden />
            </ChromeStatusIcon>
          ) : null}
          <ChromeIconButton
            testId='board-widget-refresh'
            label={refreshLabel}
            disabled={running || !refreshable}
            onClick={onRefresh}
          >
            <RefreshCw
              className={cn('size-3.5', running && 'animate-spin')}
              aria-hidden
            />
          </ChromeIconButton>
          {chrome === 'full' ? (
            <>
              {onExpand ? (
                <ChromeIconButton
                  testId='board-widget-expand'
                  label='放大'
                  onClick={onExpand}
                >
                  <Expand className='size-3.5' aria-hidden />
                </ChromeIconButton>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      className='size-6 shrink-0'
                      data-testid='board-widget-more'
                      aria-label='更多'
                    >
                      <Ellipsis className='size-3.5' aria-hidden />
                    </Button>
                  }
                />
                <DropdownMenuContent align='end' className='w-44'>
                  {onOpenJob ? (
                    <DropdownMenuItem
                      data-testid='board-widget-menu-job'
                      onClick={onOpenJob}
                    >
                      取数作业…
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    data-testid='board-widget-menu-reload'
                    onClick={() => bridge.reload()}
                  >
                    重新加载小组件
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </header>
      ) : null}

      {bridge.error ? (
        <p
          className='flex shrink-0 items-center gap-1.5 border-b border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive'
          data-testid='board-widget-error'
        >
          <TriangleAlert className='size-3 shrink-0' aria-hidden />
          <span className='truncate'>{bridge.error}</span>
        </p>
      ) : null}

      {bridge.hint ? (
        <p
          className='shrink-0 border-b border-border/60 px-2 py-1 text-[11px] text-muted-foreground'
          data-testid='board-widget-hint'
        >
          {bridge.hint}
        </p>
      ) : null}

      {showReload ? (
        <div className='flex shrink-0 justify-end px-2 py-1'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            data-testid='board-widget-reload'
            onClick={() => bridge.reload()}
          >
            重新加载
          </Button>
        </div>
      ) : null}

      <div className='relative min-h-0 flex-1'>
        {thumbOverlay ? (
          <span
            className='pointer-events-none absolute right-1 top-1 z-10 inline-flex size-4 items-center justify-center rounded-full bg-background/90 text-muted-foreground'
            data-testid={thumbOverlay.testId}
            title={thumbOverlay.title}
          >
            <ThumbOverlayIcon kind={thumbOverlay.kind} />
          </span>
        ) : null}
        <BoardWidgetFrame
          srcDoc={srcDoc}
          title={title}
          assignKey={bridge.assignKey}
          iframeRef={bridge.iframeRef}
          onLoad={bridge.onIframeLoad}
          className='min-h-0 h-full w-full flex-1 border-0 bg-background'
        />
      </div>
    </section>
  )
}
