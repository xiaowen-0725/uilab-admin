import { useMemo, useRef } from 'react'
import { Ellipsis, Expand, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { BoardWidget } from '../../model/board'
import { DRAG_HANDLE_ATTR } from '../../model/drag-handle'
import { formatRelative } from '../../model/relative-time'
import {
  buildWidgetDocument,
  WIDGET_SANDBOX,
  widgetCsp,
  type WidgetTheme,
} from '../../model/widget-document'
import { useWidgetBridge, type WidgetPhase } from './use-widget-bridge'

/**
 * How much host chrome a widget gets. The widget itself never draws its own
 * title bar — refresh / expand / more are host-drawn in every mode, so the same
 * widget source works on the detail page, in the conversation preview, and in a
 * list thumbnail.
 */
export type WidgetChrome = 'full' | 'compact' | 'none'

export interface BoardWidgetHostProps {
  widget: BoardWidget
  theme: WidgetTheme
  chrome?: WidgetChrome
  /** Thumbnails render for real but must not take pointer or focus. */
  inert?: boolean
  /** Marks the header as a grid drag surface. Off in preview and thumbnails. */
  movable?: boolean
  onRefresh?: (widgetId: string) => void
  onExpand?: (widgetId: string) => void
  onOpenJob?: (widgetId: string) => void
  onRemove?: (widgetId: string) => void
  onReady?: (widgetId: string, elapsedMs: number) => void
  /** Widget-owned state the host persists on its behalf. */
  onSaveInput?: (widgetId: string, input: unknown) => void
  /** `widget.submit(...)` — the widget asking the host to act on a payload. */
  onSubmit?: (widgetId: string, payload: unknown) => void
  /** Widgets cannot navigate; links come to the host to open. */
  onOpenLink?: (widgetId: string, href: string) => void
  className?: string
}

const PHASE_LABEL: Record<WidgetPhase, string> = {
  mounting: '加载中',
  ready: '就绪',
  failed: '失败',
  stale: '无响应',
}

const PHASE_DOT: Record<WidgetPhase, string> = {
  mounting: 'bg-muted-foreground/50',
  ready: 'bg-emerald-500',
  failed: 'bg-destructive',
  stale: 'bg-amber-500',
}

function formatLastRun(at: number | null): string {
  return at === null ? '尚未取数' : `${formatRelative(at)}更新`
}

/**
 * Board Widget host — the opaque-origin sandbox plus its host-drawn chrome.
 *
 * Independent of the grid on purpose: the Timeline needs to embed a single
 * widget with no board around it (map #111 / bridge decision #117).
 */
export function BoardWidgetHost({
  widget,
  theme,
  chrome = 'full',
  inert = false,
  movable = false,
  onRefresh,
  onExpand,
  onOpenJob,
  onRemove,
  onReady,
  onSaveInput,
  onSubmit,
  onOpenLink,
  className,
}: BoardWidgetHostProps) {
  const bridge = useWidgetBridge({
    data: widget.data,
    theme,
    onReady: (elapsedMs) => onReady?.(widget.id, elapsedMs),
    onSaveInput: (input) => onSaveInput?.(widget.id, input),
    onSubmit: (payload) => onSubmit?.(widget.id, payload),
    onOpenLink: (href) => onOpenLink?.(widget.id, href),
  })

  // Theme reaches a live widget over the bridge; it only enters the document to
  // avoid a light flash on first paint, so it must not rebuild the document.
  const firstPaintThemeRef = useRef(theme)
  firstPaintThemeRef.current = theme

  const srcDoc = useMemo(
    () =>
      buildWidgetDocument({
        nonce: bridge.nonce,
        css: widget.source.css,
        script: widget.source.script,
        theme: firstPaintThemeRef.current,
      }),
    [bridge.nonce, widget.source.css, widget.source.script],
  )

  const showHeader = chrome !== 'none'
  const failed = bridge.phase === 'failed'

  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card',
        inert && 'pointer-events-none select-none',
        className,
      )}
      data-testid='board-widget-host'
      data-widget-id={widget.id}
      data-phase={bridge.phase}
      data-chrome={chrome}
      aria-label={widget.title}
    >
      {showHeader ? (
        <header
          className={cn(
            'flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2',
            chrome === 'full' ? 'h-9' : 'h-7',
            movable && 'cursor-grab active:cursor-grabbing',
          )}
          data-testid='board-widget-chrome'
          {...(movable ? { [DRAG_HANDLE_ATTR]: '' } : null)}
        >
          <span
            className={cn('size-1.5 shrink-0 rounded-full', PHASE_DOT[bridge.phase])}
            aria-hidden
          />
          <h3
            className={cn(
              'min-w-0 flex-1 truncate font-medium text-foreground',
              chrome === 'full' ? 'text-[13px]' : 'text-[12px]',
            )}
          >
            {widget.title}
          </h3>
          <span className='sr-only' data-testid='board-widget-phase'>
            {PHASE_LABEL[bridge.phase]}
          </span>

          {widget.job && chrome === 'full' ? (
            <span
              className='shrink-0 text-[11px] text-muted-foreground'
              data-testid='board-widget-last-run'
            >
              {formatLastRun(widget.job.lastRunAt)}
            </span>
          ) : null}

          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='size-6 shrink-0'
            data-testid='board-widget-refresh'
            aria-label='刷新'
            title={widget.job ? '重新取数' : '重新加载小组件'}
            tabIndex={inert ? -1 : 0}
            onClick={() => {
              if (widget.job) onRefresh?.(widget.id)
              else bridge.reload()
            }}
          >
            <RefreshCw className='size-3.5' aria-hidden />
          </Button>

          {chrome === 'full' ? (
            <>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                className='size-6 shrink-0'
                data-testid='board-widget-expand'
                aria-label='全屏'
                title='放大这个小组件'
                tabIndex={inert ? -1 : 0}
                onClick={() => onExpand?.(widget.id)}
              >
                <Expand className='size-3.5' aria-hidden />
              </Button>
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
                      tabIndex={inert ? -1 : 0}
                    >
                      <Ellipsis className='size-3.5' aria-hidden />
                    </Button>
                  }
                />
                <DropdownMenuContent align='end' className='w-52'>
                  <DropdownMenuItem
                    data-testid='board-widget-menu-job'
                    onClick={() => onOpenJob?.(widget.id)}
                  >
                    取数作业…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid='board-widget-menu-reload'
                    onClick={() => bridge.reload()}
                  >
                    重新加载小组件
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    data-testid='board-widget-menu-remove'
                    onClick={() => onRemove?.(widget.id)}
                  >
                    从看板移除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </header>
      ) : null}

      {failed ? (
        <p
          className='flex shrink-0 items-center gap-1.5 border-b border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive'
          data-testid='board-widget-error'
        >
          <TriangleAlert className='size-3 shrink-0' aria-hidden />
          <span className='truncate'>{bridge.error ?? '小组件出错。'}</span>
        </p>
      ) : null}

      <iframe
        key={`${widget.id}:${bridge.nonce}`}
        ref={bridge.iframeRef}
        title={widget.title}
        srcDoc={srcDoc}
        sandbox={WIDGET_SANDBOX}
        csp={widgetCsp(bridge.nonce)}
        referrerPolicy='no-referrer'
        loading='eager'
        className='min-h-0 w-full flex-1 border-0 bg-background'
        data-testid='board-widget-frame'
        onLoad={bridge.onIframeLoad}
      />
    </section>
  )
}
