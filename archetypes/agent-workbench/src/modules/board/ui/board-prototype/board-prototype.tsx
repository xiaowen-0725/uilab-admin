import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Board, BoardWidget } from '../../model/board'
import { prototypeBoards } from '../../fixtures/prototype-boards'
import type { WidgetTheme } from '../../model/widget-document'
import { BoardDetailPage } from '../board-detail-page/board-detail-page'
import { BoardListPage, type ThumbnailMode } from '../board-list-page/board-list-page'
import { BoardPreviewPanel } from '../board-preview-panel/board-preview-panel'

type View = { kind: 'list' } | { kind: 'detail'; boardId: string }

export interface BoardPrototypeProps {
  initialBoards?: Board[]
  initialView?: View
  theme?: WidgetTheme
  /** Renders the in-conversation preview beside the pages for comparison. */
  showPreview?: boolean
  thumbnailMode?: ThumbnailMode
  /** Hides the prototype-only toolbar for screenshots. */
  showToolbar?: boolean
}

/**
 * Prototype harness — two-level Board navigation plus the knobs #121 needs.
 *
 * This is scaffolding, not a Shell integration: navigation is local state here,
 * whereas the shipped version extends the Shell's `activeDestination` (#118).
 */
export function BoardPrototype({
  initialBoards,
  initialView = { kind: 'list' },
  theme: initialTheme = 'light',
  showPreview = false,
  thumbnailMode: initialThumbnailMode = 'live',
  showToolbar = true,
}: BoardPrototypeProps) {
  const [boards, setBoards] = useState<Board[]>(
    () => initialBoards ?? prototypeBoards(),
  )
  const [view, setView] = useState<View>(initialView)
  const [theme, setTheme] = useState<WidgetTheme>(initialTheme)
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>(
    initialThumbnailMode,
  )
  const [previewOpen, setPreviewOpen] = useState(showPreview)
  const [notice, setNotice] = useState<string | null>(null)
  const [readyTimings, setReadyTimings] = useState<number[]>([])

  const current =
    view.kind === 'detail'
      ? boards.find((board) => board.id === view.boardId)
      : undefined
  const previewBoard = boards[boards.length - 1]

  const updateBoard = useCallback(
    (boardId: string, update: (board: Board) => Board) => {
      setBoards((all) =>
        all.map((board) => (board.id === boardId ? update(board) : board)),
      )
    },
    [],
  )

  const onWidgetReady = useCallback((_widgetId: string, elapsedMs: number) => {
    setReadyTimings((all) => [...all, elapsedMs])
  }, [])

  // Stands in for the sidecar job endpoint: old data stays on screen while the
  // widget is refreshing, and only the chrome reflects the run.
  const refreshWidget = useCallback(
    (boardId: string, widgetId: string) => {
      updateBoard(boardId, (board) => ({
        ...board,
        widgets: board.widgets.map((widget) =>
          widget.id === widgetId
            ? { ...widget, dataState: 'loading' as const }
            : widget,
        ),
      }))
      window.setTimeout(() => {
        updateBoard(boardId, (board) => ({
          ...board,
          updatedAt: Date.now(),
          widgets: board.widgets.map((widget) =>
            widget.id === widgetId ? jitter(widget) : widget,
          ),
        }))
      }, 700)
    },
    [updateBoard],
  )

  const summary = useMemo(() => {
    if (readyTimings.length === 0) return '尚无就绪样本'
    const sorted = [...readyTimings].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length / 2)]
    return `${sorted.length} 个组件就绪 · 中位 ${Math.round(p50)}ms · 最慢 ${Math.round(
      sorted[sorted.length - 1],
    )}ms`
  }, [readyTimings])

  return (
    <div className='flex h-full min-h-0 flex-col' data-testid='board-prototype'>
      {showToolbar ? (
        <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-dashed border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground'>
          <span className='font-medium text-foreground'>原型开关</span>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-6 px-2 text-[11px]'
            data-testid='prototype-toggle-thumbnails'
            onClick={() =>
              setThumbnailMode((mode) => (mode === 'live' ? 'static' : 'live'))
            }
          >
            缩略图：{thumbnailMode === 'live' ? '真渲染' : '静态降级'}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-6 px-2 text-[11px]'
            data-testid='prototype-toggle-theme'
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            主题：{theme === 'light' ? '浅色' : '深色'}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-6 px-2 text-[11px]'
            data-testid='prototype-toggle-preview'
            onClick={() => setPreviewOpen((open) => !open)}
          >
            会话内预览：{previewOpen ? '开' : '关'}
          </Button>
          <span data-testid='prototype-ready-summary'>{summary}</span>
        </div>
      ) : null}

      {notice ? (
        <p
          className='shrink-0 border-b border-border/60 bg-muted/40 px-6 py-2 text-xs text-muted-foreground'
          data-testid='prototype-notice'
        >
          {notice}
        </p>
      ) : null}

      <div className='flex min-h-0 flex-1'>
        <div className='min-w-0 flex-1'>
          {view.kind === 'list' || !current ? (
            <BoardListPage
              boards={boards}
              theme={theme}
              thumbnailMode={thumbnailMode}
              onOpenBoard={(boardId) => setView({ kind: 'detail', boardId })}
              onCreateByChat={() =>
                setNotice('原型里不接 Runtime：真实实现会开一个新 Task 让 Agent 生成小组件。')
              }
              onWidgetReady={onWidgetReady}
            />
          ) : (
            <BoardDetailPage
              board={current}
              theme={theme}
              onBack={() => setView({ kind: 'list' })}
              onLayoutChange={(widgets) =>
                updateBoard(current.id, (board) => ({
                  ...board,
                  widgets,
                  updatedAt: Date.now(),
                }))
              }
              onRefreshWidget={(widgetId) => refreshWidget(current.id, widgetId)}
              onRefreshAll={() => {
                for (const widget of current.widgets) {
                  if (widget.job) refreshWidget(current.id, widget.id)
                }
              }}
              onRemoveWidget={(widgetId) =>
                updateBoard(current.id, (board) => ({
                  ...board,
                  widgets: board.widgets.filter(
                    (widget) => widget.id !== widgetId,
                  ),
                }))
              }
              onCreateByChat={() =>
                setNotice('原型里不接 Runtime：真实实现会在当前对话里追加一个小组件。')
              }
              onOpenJob={() =>
                setNotice('首版没有调度：取数作业弹窗只显示名称、说明与最近一次运行。')
              }
              onWidgetReady={onWidgetReady}
            />
          )}
        </div>

        {previewOpen && previewBoard ? (
          <div className='w-[380px] shrink-0'>
            <BoardPreviewPanel
              board={previewBoard}
              theme={theme}
              onOpenFull={(boardId) => setView({ kind: 'detail', boardId })}
              onRefreshAll={() => {
                for (const widget of previewBoard.widgets) {
                  if (widget.job) refreshWidget(previewBoard.id, widget.id)
                }
              }}
              onClose={() => setPreviewOpen(false)}
              onWidgetReady={onWidgetReady}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Fake a fresh job result so refresh is visibly different from a reload. */
function jitter(widget: BoardWidget): BoardWidget {
  const data = widget.data
  let next = data
  if (data && typeof data === 'object' && 'rates' in data) {
    const rates = (data as { rates: { pair: string; value: number; change: number }[] })
      .rates
    next = {
      rates: rates.map((rate) => ({
        ...rate,
        value: Number((rate.value * (1 + (Math.random() - 0.5) / 200)).toFixed(4)),
        change: Number(((Math.random() - 0.5) * 2).toFixed(2)),
      })),
    }
  }
  return {
    ...widget,
    data: next,
    dataState: 'ready',
    job: widget.job
      ? { ...widget.job, lastRunAt: Date.now(), lastRunOutcome: 'succeeded' }
      : null,
  }
}
