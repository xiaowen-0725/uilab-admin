import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, MessageSquarePlus, RefreshCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Board, BoardWidget } from '../../model/board'
import { DETAIL_GEOMETRY, type GridItem } from '../../model/grid'
import type { WidgetTheme } from '../../model/widget-document'
import { BoardCanvas } from '../board-canvas/board-canvas'
import { BoardWidgetHost } from '../board-widget-host/board-widget-host'

export interface BoardDetailPageProps {
  board: Board
  theme: WidgetTheme
  onBack: () => void
  onLayoutChange: (widgets: BoardWidget[]) => void
  onRefreshWidget: (widgetId: string) => void
  onRefreshAll: () => void
  onRemoveWidget: (widgetId: string) => void
  onCreateByChat: () => void
  onOpenJob?: (widgetId: string) => void
  onWidgetReady?: (widgetId: string, elapsedMs: number) => void
}

/**
 * Board detail — `看板 > <board>` and the only place layout is editable.
 *
 * "Expand" is per-widget: it grows one widget over the board instead of putting
 * the board itself into a full-screen mode, which is why it is local state here
 * rather than something the Shell owns.
 */
export function BoardDetailPage({
  board,
  theme,
  onBack,
  onLayoutChange,
  onRefreshWidget,
  onRefreshAll,
  onRemoveWidget,
  onCreateByChat,
  onOpenJob,
  onWidgetReady,
}: BoardDetailPageProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const expanded = board.widgets.find((widget) => widget.id === expandedId)

  useEffect(() => {
    if (!expandedId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expandedId])

  const items: GridItem[] = board.widgets.map((widget) => ({
    id: widget.id,
    placement: widget.placement,
  }))

  const applyLayout = useCallback(
    (next: GridItem[]) => {
      const byId = new Map(next.map((item) => [item.id, item.placement]))
      onLayoutChange(
        board.widgets.map((widget) => ({
          ...widget,
          placement: byId.get(widget.id) ?? widget.placement,
        })),
      )
    },
    [board.widgets, onLayoutChange],
  )

  const jobCount = board.widgets.filter((widget) => widget.job).length

  return (
    <div
      className='relative flex h-full min-h-0 flex-col'
      data-testid='board-detail-page'
      data-board-id={board.id}
    >
      <header className='flex shrink-0 items-center gap-2 border-b border-border/60 px-6 py-3'>
        <nav
          className='flex min-w-0 flex-1 items-center gap-1 text-sm'
          aria-label='面包屑'
          data-testid='board-breadcrumb'
        >
          <button
            type='button'
            className='shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
            data-testid='board-breadcrumb-root'
            onClick={onBack}
          >
            看板
          </button>
          <ChevronRight
            className='size-3.5 shrink-0 text-muted-foreground/70'
            aria-hidden
          />
          <span
            className='min-w-0 truncate font-medium text-foreground'
            aria-current='page'
          >
            {board.name}
          </span>
          {board.isExample ? (
            <Badge variant='secondary' className='ml-1 shrink-0'>
              示例
            </Badge>
          ) : null}
        </nav>

        <Button
          type='button'
          size='sm'
          variant='outline'
          data-testid='board-refresh-all'
          disabled={jobCount === 0}
          title={
            jobCount === 0 ? '这个看板没有取数作业' : `重新运行 ${jobCount} 个取数作业`
          }
          onClick={onRefreshAll}
        >
          <RefreshCw className='size-3.5' aria-hidden />
          全部刷新
        </Button>
        <Button
          type='button'
          size='sm'
          data-testid='board-add-widget'
          onClick={onCreateByChat}
        >
          <MessageSquarePlus className='size-4' aria-hidden />
          对话添加组件
        </Button>
      </header>

      {board.widgets.length === 0 ? (
        <div
          className='flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center'
          data-testid='board-detail-empty'
        >
          <p className='text-sm text-foreground'>这个看板还是空的</p>
          <p className='max-w-sm text-xs text-muted-foreground'>
            在对话里描述你想看的内容，生成的小组件会落到这里。
          </p>
          <Button type='button' size='sm' onClick={onCreateByChat}>
            <MessageSquarePlus className='size-4' aria-hidden />
            对话添加组件
          </Button>
        </div>
      ) : (
        <div className='min-h-0 flex-1 overflow-auto px-6 py-4'>
          <BoardCanvas
            items={items}
            geometry={DETAIL_GEOMETRY}
            mode='edit'
            spareRows={3}
            onLayoutChange={applyLayout}
            renderItem={(id) => {
              const widget = board.widgets.find(
                (candidate) => candidate.id === id,
              )
              if (!widget) return null
              return (
                <BoardWidgetHost
                  widget={widget}
                  theme={theme}
                  chrome='full'
                  movable
                  onRefresh={onRefreshWidget}
                  onExpand={setExpandedId}
                  onOpenJob={onOpenJob}
                  onRemove={onRemoveWidget}
                  onReady={onWidgetReady}
                  className='h-full'
                />
              )
            }}
          />
        </div>
      )}

      {expanded ? (
        <div
          className='absolute inset-0 z-30 flex flex-col bg-background/95 p-6'
          role='dialog'
          aria-modal='true'
          aria-label={`${expanded.title} 放大`}
          data-testid='board-widget-expanded'
        >
          <div className='mb-2 flex items-center gap-2'>
            <span className='flex-1 text-sm font-medium text-foreground'>
              {expanded.title}
            </span>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              data-testid='board-widget-expanded-close'
              onClick={() => setExpandedId(null)}
            >
              <X className='size-4' aria-hidden />
              退出放大
            </Button>
          </div>
          {/* A fresh host: the same widget id renders twice, so the sandbox and
              bridge must tolerate two live instances. */}
          <BoardWidgetHost
            widget={expanded}
            theme={theme}
            chrome='full'
            onRefresh={onRefreshWidget}
            onOpenJob={onOpenJob}
            className='min-h-0 flex-1'
          />
        </div>
      ) : null}
    </div>
  )
}
