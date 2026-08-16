import { Expand, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Board } from '../../model/board'
import { PREVIEW_GEOMETRY } from '../../model/grid'
import type { WidgetTheme } from '../../model/widget-document'
import { BoardCanvas } from '../board-canvas/board-canvas'
import { BoardWidgetHost } from '../board-widget-host/board-widget-host'

export interface BoardPreviewPanelProps {
  board: Board
  theme: WidgetTheme
  onOpenFull: (boardId: string) => void
  onRefreshAll: () => void
  onClose: () => void
  onWidgetReady?: (widgetId: string, elapsedMs: number) => void
}

/**
 * In-conversation Board preview — the second `BoardCanvas` reuse.
 *
 * Layout is read-only here: dragging belongs to the detail page, so a widget
 * the agent just committed cannot be accidentally rearranged in a narrow panel.
 */
export function BoardPreviewPanel({
  board,
  theme,
  onOpenFull,
  onRefreshAll,
  onClose,
  onWidgetReady,
}: BoardPreviewPanelProps) {
  return (
    <aside
      className='flex h-full min-h-0 flex-col border-l border-border/60 bg-background'
      data-testid='board-preview-panel'
      data-board-id={board.id}
      aria-label={`看板预览：${board.name}`}
    >
      <header className='flex shrink-0 items-center gap-1 border-b border-border/60 px-3 py-2'>
        <span className='min-w-0 flex-1 truncate text-[13px] font-medium text-foreground'>
          {board.name}
        </span>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='size-7'
          data-testid='board-preview-refresh'
          aria-label='刷新'
          onClick={onRefreshAll}
        >
          <RefreshCw className='size-3.5' aria-hidden />
        </Button>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='size-7'
          data-testid='board-preview-open-full'
          aria-label='在看板中打开'
          title='在看板中打开'
          onClick={() => onOpenFull(board.id)}
        >
          <Expand className='size-3.5' aria-hidden />
        </Button>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='size-7'
          data-testid='board-preview-close'
          aria-label='关闭'
          onClick={onClose}
        >
          <X className='size-3.5' aria-hidden />
        </Button>
      </header>

      <div className='min-h-0 flex-1 overflow-auto p-3'>
        <BoardCanvas
          items={board.widgets.map((widget) => ({
            id: widget.id,
            placement: widget.placement,
          }))}
          geometry={PREVIEW_GEOMETRY}
          mode='read-only'
          data-testid='board-preview-canvas'
          renderItem={(id) => {
            const widget = board.widgets.find(
              (candidate) => candidate.id === id,
            )
            if (!widget) return null
            return (
              <BoardWidgetHost
                widget={widget}
                theme={theme}
                chrome='compact'
                onReady={onWidgetReady}
                className='h-full'
              />
            )
          }}
        />
      </div>

      <p className='shrink-0 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground'>
        预览里布局只读 · 拖拽与移除请到看板页
      </p>
    </aside>
  )
}
