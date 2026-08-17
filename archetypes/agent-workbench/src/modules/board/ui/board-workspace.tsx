import { useCallback, useEffect, useState } from 'react'
import { loadBoardList, loadBoardView } from '../application/load-board-view'
import {
  revokeJobApproval,
  updateBoardLayout,
} from '../application/board-commands'
import type { BoardListCard, BoardView } from '../model/board-view'
import type { BoardId, BoardPlacement } from '../model/types'
import type { BoardStorePort } from '../ports/board-store-port'
import type { WidgetTheme } from '../model/widget-document'
import { BoardDetailPage, JOB_RUNTIME_UNAVAILABLE } from './board-detail-page'
import { BoardListPage } from './board-list-page'

export interface BoardWorkspaceProps {
  store: BoardStorePort
  boardId?: BoardId
  theme: WidgetTheme
  taskExists: (taskId: string) => boolean
  onOpenList: () => void
  onOpenBoard: (boardId: BoardId) => void
  onCreateByChat: () => void
  onOpenSourceTask?: (taskId: string) => void
}

export function BoardWorkspace({
  store,
  boardId,
  theme,
  taskExists,
  onOpenList,
  onOpenBoard,
  onCreateByChat,
  onOpenSourceTask,
}: BoardWorkspaceProps) {
  const [cards, setCards] = useState<BoardListCard[]>([])
  const [detail, setDetail] = useState<BoardView | null | undefined>(undefined)
  const [refreshHint, setRefreshHint] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)

  const reload = useCallback(() => setGeneration((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    if (boardId) setDetail(undefined)
    void (async () => {
      if (boardId) {
        const next = await loadBoardView(store, boardId)
        if (!cancelled) setDetail(next)
        return
      }
      const next = await loadBoardList(store)
      if (!cancelled) setCards(next)
    })()
    return () => {
      cancelled = true
    }
  }, [boardId, store, generation])

  const persistLayout = useCallback(
    async (placements: BoardPlacement[]) => {
      if (!boardId) return
      await updateBoardLayout(store, boardId, placements)
      reload()
    },
    [boardId, reload, store],
  )

  const revoke = useCallback(
    async (jobId: string) => {
      await revokeJobApproval(store, jobId)
      reload()
    },
    [reload, store],
  )

  const showRuntimeHint = useCallback(() => {
    setRefreshHint(JOB_RUNTIME_UNAVAILABLE)
  }, [])

  if (boardId) {
    if (detail === undefined) {
      return (
        <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
          正在打开看板…
        </div>
      )
    }
    if (!detail) {
      return (
        <div
          className='flex h-full items-center justify-center text-sm text-muted-foreground'
          data-testid='board-detail-missing'
        >
          找不到这块看板
        </div>
      )
    }
    return (
      <BoardDetailPage
        view={detail}
        theme={theme}
        taskExists={taskExists}
        onBack={onOpenList}
        onLayoutChange={(placements) => void persistLayout(placements)}
        onRefreshWidget={showRuntimeHint}
        onRefreshAll={showRuntimeHint}
        onCreateByChat={onCreateByChat}
        onOpenSourceTask={onOpenSourceTask}
        onRevokeJob={(jobId) => void revoke(jobId)}
        refreshHint={refreshHint}
      />
    )
  }

  return (
    <BoardListPage
      boards={cards}
      theme={theme}
      onOpenBoard={onOpenBoard}
      onCreateByChat={onCreateByChat}
    />
  )
}
