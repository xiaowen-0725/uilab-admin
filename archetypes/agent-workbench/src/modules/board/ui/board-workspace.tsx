import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  findUnavailable,
  type BoardRefreshController,
} from '../application/board-refresh'
import { loadBoardList, loadBoardView } from '../application/load-board-view'
import {
  revokeJobApproval,
  updateBoardLayout,
} from '../application/board-commands'
import { JOB_RUNTIME_DISCONNECTED } from '../model/refresh-policy'
import type { BoardListCard, BoardView } from '../model/board-view'
import type { BoardId, BoardPlacement, BoardWidgetId } from '../model/types'
import type { BoardStorePort } from '../ports/board-store-port'
import type { WidgetTheme } from '../model/widget-document'
import { BoardDetailPage } from './board-detail-page'
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
  refresh?: BoardRefreshController
  /** Bump when a shared controller writes a run (preview / first-run). */
  revision?: number
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
  refresh,
  revision = 0,
}: BoardWorkspaceProps) {
  const [cards, setCards] = useState<BoardListCard[]>([])
  const [detail, setDetail] = useState<BoardView | null | undefined>(undefined)
  const [refreshHint, setRefreshHint] = useState<string | null>(null)
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false)
  const [generation, setGeneration] = useState(0)
  const openedBoardRef = useRef<string | null>(null)

  const reload = useCallback(() => setGeneration((value) => value + 1), [])

  useEffect(() => {
    if (!refresh) {
      setRuntimeUnavailable(true)
      return
    }
    let cancelled = false
    void refresh.probe().then((probed) => {
      if (!cancelled) setRuntimeUnavailable(!probed.ok)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    if (boardId && openedBoardRef.current !== boardId) {
      setDetail(undefined)
    }
    void (async () => {
      if (boardId) {
        const next = await loadBoardView(store, boardId)
        if (cancelled) return
        setDetail(next)
        const firstOpen = openedBoardRef.current !== boardId
        openedBoardRef.current = boardId
        if (firstOpen) void refresh?.refreshStaleOnOpen(boardId)
        return
      }
      openedBoardRef.current = null
      await refresh?.reconcileOrphans()
      const next = await loadBoardList(store)
      if (!cancelled) setCards(next)
    })()
    return () => {
      cancelled = true
    }
  }, [boardId, refresh, store, generation, revision])

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

  const refreshWidget = useCallback(
    async (widgetId: BoardWidgetId) => {
      if (!detail) return
      if (!refresh) {
        setRefreshHint(JOB_RUNTIME_DISCONNECTED)
        return
      }
      const job = detail.jobs.get(widgetId)
      if (!job) {
        setRefreshHint('这个小组件没有取数作业')
        return
      }
      const outcome = await refresh.refreshJob(job.id)
      if (outcome.kind === 'unavailable') {
        setRuntimeUnavailable(true)
        setRefreshHint(outcome.hint)
        return
      }
      if (outcome.kind === 'finished' && outcome.status !== 'success') {
        setRefreshHint(outcome.hint ?? null)
        return
      }
      setRefreshHint(null)
    },
    [detail, refresh],
  )

  const refreshAll = useCallback(async () => {
    if (!boardId) return
    if (!refresh) {
      setRefreshHint(JOB_RUNTIME_DISCONNECTED)
      return
    }
    if (detail && detail.jobs.size === 0) {
      setRefreshHint('这个看板没有取数作业')
      return
    }
    const unavailable = findUnavailable(await refresh.refreshBoard(boardId))
    if (unavailable) {
      setRuntimeUnavailable(true)
      setRefreshHint(unavailable.hint)
      return
    }
    setRefreshHint(null)
  }, [boardId, detail, refresh])

  if (boardId) {
    if (detail === undefined) {
      return <BoardStatus>正在打开看板…</BoardStatus>
    }
    if (!detail) {
      return (
        <BoardStatus testId='board-detail-missing'>找不到这块看板</BoardStatus>
      )
    }
    return (
      <BoardDetailPage
        view={detail}
        theme={theme}
        taskExists={taskExists}
        onBack={onOpenList}
        onLayoutChange={(placements) => void persistLayout(placements)}
        onRefreshWidget={(widgetId) => void refreshWidget(widgetId)}
        onRefreshAll={() => void refreshAll()}
        onCreateByChat={onCreateByChat}
        onOpenSourceTask={onOpenSourceTask}
        onRevokeJob={(jobId) => void revoke(jobId)}
        refreshHint={refreshHint}
        runtimeUnavailable={runtimeUnavailable}
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

function BoardStatus({
  children,
  testId,
}: {
  children: ReactNode
  testId?: string
}) {
  return (
    <div
      className='flex h-full items-center justify-center text-sm text-muted-foreground'
      data-testid={testId}
    >
      {children}
    </div>
  )
}
