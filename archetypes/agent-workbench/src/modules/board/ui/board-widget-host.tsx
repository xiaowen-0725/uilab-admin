import { useMemo, useRef, type ReactNode } from 'react'
import { Ellipsis, Expand, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { BoardWidgetId } from '../model/types'
import {
  buildWidgetDocument,
  type WidgetTheme,
} from '../model/widget-document'
import { BoardWidgetFrame, readHostCspNonce } from './board-widget-frame'
import { useWidgetBridge } from './use-widget-bridge'

export type WidgetChrome = 'full' | 'compact' | 'none'

function ChromeIconButton({
  testId,
  label,
  onClick,
  children,
}: {
  testId: string
  label: string
  onClick?: () => void
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
  onRefresh?: () => void
  onExpand?: () => void
  onOpenJob?: () => void
  onSaveInput?: (key: string, value: unknown) => void
  onSubmit?: (payload: unknown) => void
  onOpenLink?: (url: string) => void
  onWheelForward?: (deltaY: number) => void
  onReady?: (elapsedMs: number) => void
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
  onRefresh,
  onExpand,
  onOpenJob,
  onSaveInput,
  onSubmit,
  onOpenLink,
  onWheelForward,
  onReady,
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

  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card',
        className,
      )}
      data-testid='board-widget-host'
      data-widget-id={widgetId}
      data-phase={bridge.phase}
      data-chrome={chrome}
      aria-label={title}
    >
      {showHeader ? (
        <header
          className={cn(
            'flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2',
            headerClass,
          )}
          data-testid='board-widget-chrome'
        >
          <h3
            className={cn(
              'min-w-0 flex-1 truncate font-medium text-foreground',
              titleClass,
            )}
          >
            {title}
          </h3>
          <ChromeIconButton testId='board-widget-refresh' label='刷新' onClick={onRefresh}>
            <RefreshCw className='size-3.5' aria-hidden />
          </ChromeIconButton>
          {chrome === 'full' ? (
            <>
              <ChromeIconButton testId='board-widget-expand' label='全屏' onClick={onExpand}>
                <Expand className='size-3.5' aria-hidden />
              </ChromeIconButton>
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

      <BoardWidgetFrame
        srcDoc={srcDoc}
        title={title}
        assignKey={bridge.assignKey}
        iframeRef={bridge.iframeRef}
        onLoad={bridge.onIframeLoad}
        className='min-h-0 w-full flex-1 border-0 bg-background'
      />
    </section>
  )
}
