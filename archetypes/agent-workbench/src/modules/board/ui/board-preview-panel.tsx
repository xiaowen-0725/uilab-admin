import { Expand, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  boardHasRefreshableSource,
  lastRunForWidget,
  placementsToGridItems,
  widgetOnMount,
  widgetRenderState,
  type BoardView,
} from '../model/board-view'
import { anonymousIdentitySnapshot } from '../model/widget-render-state'
import type { IdentityScopeSnapshot } from '../ports/identity-scope-port'
import { BOARD_PREVIEW_WIDTH, PREVIEW_GEOMETRY } from '../model/grid'
import type { WidgetTheme } from '../model/widget-document'
import { JOB_RUNTIME_DISCONNECTED } from '../model/refresh-policy'
import { BoardCanvas } from './board-canvas'
import { BoardWidgetHost } from './board-widget-host'

function previewRefreshTitle(
  canRefreshBoard: boolean,
  runtimeUnavailable: boolean,
): string {
  if (!canRefreshBoard) return '这个看板没有取数作业'
  if (runtimeUnavailable) return JOB_RUNTIME_DISCONNECTED
  return '刷新'
}

export interface BoardPreviewPanelProps {
  view: BoardView
  theme: WidgetTheme
  onOpenFull: (boardId: string) => void
  onRefreshAll?: () => void
  onClose: () => void
  runtimeUnavailable?: boolean
  identity?: IdentityScopeSnapshot
}

/**
 * In-conversation Board preview. Layout is read-only; drag lives on the
 * detail page. Width stays at the Work Surface default (480) with 12 columns
 * so opening the detail page does not jump placements.
 */
export function BoardPreviewPanel({
  view,
  theme,
  onOpenFull,
  onRefreshAll,
  onClose,
  runtimeUnavailable = false,
  identity = anonymousIdentitySnapshot(),
}: BoardPreviewPanelProps) {
  const { board } = view
  const canRefreshBoard = boardHasRefreshableSource(view)
  const refreshTitle = previewRefreshTitle(canRefreshBoard, runtimeUnavailable)

  return (
    <aside
      className='flex h-full min-h-0 flex-col bg-background'
      style={{ minWidth: BOARD_PREVIEW_WIDTH }}
      data-testid='board-preview-panel'
      data-board-id={board.id}
      aria-label={`看板预览：${board.title}`}
    >
      <header className='flex shrink-0 items-center gap-1 border-b border-border/60 px-3 py-2'>
        <span className='min-w-0 flex-1 truncate text-[13px] font-medium text-foreground'>
          {board.title}
        </span>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='size-7'
          data-testid='board-preview-refresh'
          aria-label={refreshTitle}
          title={refreshTitle}
          disabled={!canRefreshBoard}
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
          items={placementsToGridItems(board.placements)}
          geometry={PREVIEW_GEOMETRY}
          mode='read-only'
          data-testid='board-preview-canvas'
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
                chrome='compact'
                status={widget.status}
                identityChrome={painted.chrome}
                runError={last?.errorMessage}
                runtimeUnavailable={runtimeUnavailable}
                hasJob={view.jobs.has(widget.id)}
                className='h-full'
              />
            )
          }}
        />
      </div>

      <p className='shrink-0 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground'>
        预览里布局只读 · 拖拽请到看板页
      </p>
    </aside>
  )
}
