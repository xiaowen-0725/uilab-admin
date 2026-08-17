import { useEffect, useState } from 'react'
import {
  findUnavailable,
  type BoardRefreshController,
} from '../application/board-refresh'
import { loadBoardView } from '../application/load-board-view'
import { JOB_RUNTIME_DISCONNECTED } from '../model/refresh-policy'
import type { BoardView } from '../model/board-view'
import type { BoardStorePort } from '../ports/board-store-port'
import type { WidgetTheme } from '../model/widget-document'
import { BoardPreviewPanel } from './board-preview-panel'

export interface BoardPreviewLoaderProps {
  boardId: string
  store: BoardStorePort
  theme: WidgetTheme
  onOpenFull: (boardId: string) => void
  onClose: () => void
  /** Bump after commit / first-run so an already-open preview reloads. */
  revision?: number
  refresh?: BoardRefreshController
}

export function BoardPreviewLoader({
  boardId,
  store,
  theme,
  onOpenFull,
  onClose,
  revision = 0,
  refresh,
}: BoardPreviewLoaderProps) {
  const [view, setView] = useState<BoardView | null | undefined>(undefined)
  const [hint, setHint] = useState<string | null>(null)
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadBoardView(store, boardId).then((next) => {
      if (!cancelled) setView(next)
    })
    return () => {
      cancelled = true
    }
  }, [boardId, revision, store])

  useEffect(() => {
    if (!refresh) return
    let cancelled = false
    void refresh.probe().then((probed) => {
      if (!cancelled) setRuntimeUnavailable(!probed.ok)
    })
    void refresh.refreshStaleOnOpen(boardId)
    return () => {
      cancelled = true
    }
  }, [boardId, refresh])

  async function refreshAll() {
    if (!refresh) {
      setHint(JOB_RUNTIME_DISCONNECTED)
      return
    }
    const unavailable = findUnavailable(await refresh.refreshBoard(boardId))
    if (unavailable) {
      setRuntimeUnavailable(true)
      setHint(unavailable.hint)
      return
    }
    setHint(null)
    setView(await loadBoardView(store, boardId))
  }

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
        <p
          className='shrink-0 px-3 py-1 text-[12px] text-muted-foreground'
          data-testid='board-preview-refresh-hint'
        >
          {hint}
        </p>
      ) : null}
      <BoardPreviewPanel
        view={view}
        theme={theme}
        runtimeUnavailable={runtimeUnavailable}
        onOpenFull={onOpenFull}
        onRefreshAll={() => void refreshAll()}
        onClose={onClose}
      />
    </div>
  )
}
