import { useCallback, useEffect, useState } from 'react'
import { ChevronRightIcon as ChevronRight, ChatBubbleOvalLeftIcon as MessageSquarePlus, ArrowPathIcon as RefreshCw, XMarkIcon as X } from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  EXAMPLE_DATA_HINT,
  EXAMPLE_DATA_NUDGE,
} from '../fixtures/example-presets'
import {
  boardHasRefreshableSource,
  gridItemsToPlacements,
  lastRunForWidget,
  placementsToGridItems,
  widgetCanRefresh,
  widgetOnMount,
  widgetRenderState,
  type BoardView,
} from '../model/board-view'
import { anonymousIdentitySnapshot } from '../model/widget-render-state'
import type { IdentityScopeSnapshot } from '../ports/identity-scope-port'
import { DETAIL_GEOMETRY, type GridItem } from '../model/grid'
import { JOB_RUNTIME_DISCONNECTED } from '../model/refresh-policy'
import { boardOriginBadge } from '../model/preset-board'
import type { BoardPlacement, BoardWidgetId } from '../model/types'
import type { WidgetTheme } from '../model/widget-document'
import { BoardCanvas } from './board-canvas'
import { BoardJobDialog } from './board-job-dialog'
import { BoardWidgetHost } from './board-widget-host'

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
  onDeleteBoard?: () => void
  refreshHint?: string | null
  runtimeUnavailable?: boolean
  identity?: IdentityScopeSnapshot
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
  onDeleteBoard,
  refreshHint,
  runtimeUnavailable = false,
  identity = anonymousIdentitySnapshot(),
}: BoardDetailPageProps) {
  const { board } = view
  const originBadge = boardOriginBadge(board)
  const [expandedId, setExpandedId] = useState<BoardWidgetId | null>(null)
  const [jobWidgetId, setJobWidgetId] = useState<BoardWidgetId | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const showExampleBanner =
    board.isExample &&
    [...view.widgets.values()].some(
      (widget) => widget.latestData != null && !view.jobs.get(widget.id),
    )
  const expanded = expandedId ? view.widgets.get(expandedId) : undefined
  const expandedRun = expanded ? lastRunForWidget(view, expanded.id) : undefined
  const expandedPainted = expanded
    ? widgetRenderState(view, expanded, identity)
    : undefined
  const job = jobWidgetId ? (view.jobs.get(jobWidgetId) ?? null) : null
  const lastRun = job ? (lastRunForWidget(view, job.widgetId) ?? null) : null
  const sourceTaskId = board.createdByTaskId
  const showSourceLink = Boolean(sourceTaskId && taskExists(sourceTaskId))
  const canRefreshBoard = boardHasRefreshableSource(view)
  let refreshAllTitle = '全部刷新'
  if (!canRefreshBoard) refreshAllTitle = '这个看板没有取数作业'
  else if (runtimeUnavailable) refreshAllTitle = JOB_RUNTIME_DISCONNECTED

  useEffect(() => {
    if (!expandedId) return
    const close = document.querySelector(
      '[data-testid="board-widget-expanded-close"]',
    )
    if (close instanceof HTMLElement) close.focus()
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
      className='relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col bg-background'
      data-testid='board-detail-page'
      data-board-id={board.id}
    >
      <div className='flex min-h-0 min-w-0 flex-1 flex-col' inert={expanded ? true : undefined}>
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
          {originBadge ? (
            <Badge
              variant='secondary'
              className='ml-1 shrink-0'
              data-testid={originBadge.testId}
            >
              {originBadge.label}
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

        {onDeleteBoard ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='text-destructive hover:bg-destructive/10 hover:text-destructive'
            data-testid='board-delete'
            onClick={() => setConfirmDelete(true)}
          >
            删除
          </Button>
        ) : null}
        <Button
          type='button'
          size='sm'
          variant='outline'
          data-testid='board-refresh-all'
          title={refreshAllTitle}
          disabled={!canRefreshBoard}
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

      {showExampleBanner ? (
        <p
          className='shrink-0 border-b border-border/60 px-6 py-1.5 text-[12px] text-muted-foreground'
          data-testid='board-example-data-hint'
        >
          {EXAMPLE_DATA_HINT} · {EXAMPLE_DATA_NUDGE}
        </p>
      ) : null}

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
        <div className='min-h-0 min-w-0 flex-1 overflow-auto bg-muted/30 px-6 py-5'>
          <BoardCanvas
            items={placementsToGridItems(board.placements)}
            geometry={DETAIL_GEOMETRY}
            mode='edit'
            spareRows={3}
            onLayoutChange={applyLayout}
            spanLimits={(mountId) => widgetOnMount(view, mountId)?.span}
            renderItem={(mountId) => {
              const widget = widgetOnMount(view, mountId)
              if (!widget) return null
              const last = lastRunForWidget(view, widget.id)
              const painted = widgetRenderState(view, widget, identity)
              return (
                <BoardWidgetHost
                  widgetId={widget.id}
                  title={widget.title}
                  html={widget.html}
                  data={painted.data}
                  theme={theme}
                  canSubmit={Boolean(widget.events?.submit)}
                  chrome='full'
                  movable
                  status={widget.status}
                  identityChrome={painted.chrome}
                  runError={last?.errorMessage}
                  runtimeUnavailable={runtimeUnavailable}
                  hasJob={view.jobs.has(widget.id)}
                  canRefresh={widgetCanRefresh(view, widget.id)}
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
      </div>

      {expanded ? (
        <div
          className='absolute inset-0 z-30 flex flex-col bg-background p-6 animate-in fade-in duration-200 motion-reduce:animate-none'
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
            data={expandedPainted?.data}
            theme={theme}
            canSubmit={Boolean(expanded.events?.submit)}
            chrome='full'
            status={expanded.status}
            identityChrome={expandedPainted?.chrome}
            runError={expandedRun?.errorMessage}
            runtimeUnavailable={runtimeUnavailable}
            hasJob={view.jobs.has(expanded.id)}
            canRefresh={widgetCanRefresh(view, expanded.id)}
            onRefresh={() => onRefreshWidget?.(expanded.id)}
            onOpenJob={() => setJobWidgetId(expanded.id)}
            className='min-h-0 flex-1'
          />
        </div>
      ) : null}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
      >
        <DialogContent
          className='sm:max-w-sm'
          data-testid='board-delete-dialog'
        >
          <DialogHeader>
            <DialogTitle>删除这块看板？</DialogTitle>
            <DialogDescription>
              看板和上面的小组件会一起删掉，不能恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              data-testid='board-delete-cancel'
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </Button>
            <Button
              type='button'
              variant='destructive'
              size='sm'
              data-testid='board-delete-confirm'
              onClick={() => {
                setConfirmDelete(false)
                onDeleteBoard?.()
              }}
            >
              删除看板
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BoardJobDialog
        open={jobWidgetId != null}
        job={job}
        lastRun={lastRun}
        onClose={() => setJobWidgetId(null)}
        onRevoke={onRevokeJob}
        onBindByChat={onCreateByChat}
      />
    </div>
  )
}

