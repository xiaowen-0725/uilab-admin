import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, MessageSquarePlus, RefreshCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  gridItemsToPlacements,
  placementsToGridItems,
  type BoardView,
} from '../model/board-view'
import { DETAIL_GEOMETRY, type GridItem } from '../model/grid'
import type { BoardPlacement, BoardWidgetId } from '../model/types'
import type { WidgetTheme } from '../model/widget-document'
import { BoardCanvas } from './board-canvas'
import { BoardJobDialog } from './board-job-dialog'
import { BoardWidgetHost } from './board-widget-host'

export const JOB_RUNTIME_UNAVAILABLE = '取数作业运行时尚未接入'

export interface BoardDetailPageProps {
  view: BoardView
  theme: WidgetTheme
  taskExists: (taskId: string) => boolean
  onBack: () => void
  onLayoutChange: (placements: BoardPlacement[]) => void
  onRefreshWidget?: (widgetId: BoardWidgetId) => void
  onRefreshAll?: () => void
  onCreateByChat: () => void
  onOpenSourceTask?: (taskId: string) => void
  onRevokeJob?: (jobId: string) => void
  refreshHint?: string | null
}

export function BoardDetailPage({
  view,
  theme,
  taskExists,
  onBack,
  onLayoutChange,
  onRefreshWidget,
  onRefreshAll,
  onCreateByChat,
  onOpenSourceTask,
  onRevokeJob,
  refreshHint,
}: BoardDetailPageProps) {
  const { board } = view
  const [expandedId, setExpandedId] = useState<BoardWidgetId | null>(null)
  const [jobWidgetId, setJobWidgetId] = useState<BoardWidgetId | null>(null)
  const expanded = expandedId ? view.widgets.get(expandedId) : undefined
  const job = jobWidgetId ? (view.jobs.get(jobWidgetId) ?? null) : null
  const lastRun = job ? (view.lastRunByJobId.get(job.id) ?? null) : null
  const sourceTaskId = board.createdByTaskId
  const showSourceLink = Boolean(sourceTaskId && taskExists(sourceTaskId))
  const jobCount = view.jobs.size

  useEffect(() => {
    if (!expandedId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expandedId])

  const applyLayout = useCallback(
    (next: GridItem[]) => {
      onLayoutChange(gridItemsToPlacements(next, board.placements))
    },
    [board.placements, onLayoutChange],
  )

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
            {board.title}
          </span>
          {board.isExample ? (
            <Badge
              variant='secondary'
              className='ml-1 shrink-0'
              data-testid='board-example-badge'
            >
              示例
            </Badge>
          ) : null}
        </nav>

        {showSourceLink && sourceTaskId ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            data-testid='board-open-source-task'
            onClick={() => onOpenSourceTask?.(sourceTaskId)}
          >
            回到生成它的对话
          </Button>
        ) : null}

        <Button
          type='button'
          size='sm'
          variant='outline'
          data-testid='board-refresh-all'
          title={
            jobCount === 0 ? '这个看板没有取数作业' : JOB_RUNTIME_UNAVAILABLE
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

      {refreshHint ? (
        <p
          className='shrink-0 border-b border-border/60 px-6 py-1.5 text-[12px] text-muted-foreground'
          data-testid='board-refresh-hint'
        >
          {refreshHint}
        </p>
      ) : null}

      {board.placements.length === 0 ? (
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
            items={placementsToGridItems(board.placements)}
            geometry={DETAIL_GEOMETRY}
            mode='edit'
            spareRows={3}
            onLayoutChange={applyLayout}
            spanLimits={(mountId) => {
              const placement = board.placements.find(
                (item) => item.mountId === mountId,
              )
              const widget = placement
                ? view.widgets.get(placement.widgetId)
                : undefined
              return widget?.span
            }}
            renderItem={(mountId) => {
              const placement = board.placements.find(
                (item) => item.mountId === mountId,
              )
              const widget = placement
                ? view.widgets.get(placement.widgetId)
                : undefined
              if (!widget) return null
              return (
                <BoardWidgetHost
                  widgetId={widget.id}
                  title={widget.title}
                  html={widget.html}
                  data={widget.latestData}
                  theme={theme}
                  canSubmit={Boolean(widget.events?.submit)}
                  chrome='full'
                  movable
                  onRefresh={() => onRefreshWidget?.(widget.id)}
                  onExpand={() => setExpandedId(widget.id)}
                  onOpenJob={() => setJobWidgetId(widget.id)}
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
          <BoardWidgetHost
            widgetId={expanded.id}
            title={expanded.title}
            html={expanded.html}
            data={expanded.latestData}
            theme={theme}
            canSubmit={Boolean(expanded.events?.submit)}
            chrome='full'
            onRefresh={() => onRefreshWidget?.(expanded.id)}
            onOpenJob={() => setJobWidgetId(expanded.id)}
            className='min-h-0 flex-1'
          />
        </div>
      ) : null}

      <BoardJobDialog
        open={jobWidgetId != null}
        job={job}
        lastRun={lastRun}
        onClose={() => setJobWidgetId(null)}
        onRevoke={onRevokeJob}
      />
    </div>
  )
}
