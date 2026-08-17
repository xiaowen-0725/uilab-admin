import { useEffect, useState } from 'react'
import { loadBoardView } from '../application/load-board-view'
import type { BoardView } from '../model/board-view'
import type { BoardStorePort } from '../ports/board-store-port'
import type { WidgetTheme } from '../model/widget-document'
import { JOB_RUNTIME_UNAVAILABLE } from './board-detail-page'
import { BoardPreviewPanel } from './board-preview-panel'

export interface BoardPreviewLoaderProps {
  boardId: string
  store: BoardStorePort
  theme: WidgetTheme
  onOpenFull: (boardId: string) => void
  onClose: () => void
}

export function BoardPreviewLoader({
  boardId,
  store,
  theme,
  onOpenFull,
  onClose,
}: BoardPreviewLoaderProps) {
  const [view, setView] = useState<BoardView | null | undefined>(undefined)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadBoardView(store, boardId).then((next) => {
      if (!cancelled) setView(next)
    })
    return () => {
      cancelled = true
    }
  }, [boardId, store])

  if (view === undefined) {
    return (
      <p className='p-3 text-sm text-muted-foreground'>正在打开看板预览…</p>
    )
  }

  if (!view) {
    return (
      <p className='p-3 text-sm text-muted-foreground' data-testid='board-preview-missing'>
        找不到这块看板
      </p>
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      {hint ? (
        <p className='shrink-0 px-3 py-1 text-[12px] text-muted-foreground'>
          {hint}
        </p>
      ) : null}
      <BoardPreviewPanel
        view={view}
        theme={theme}
        onOpenFull={onOpenFull}
        onRefreshAll={() => setHint(JOB_RUNTIME_UNAVAILABLE)}
        onClose={onClose}
      />
    </div>
  )
}
