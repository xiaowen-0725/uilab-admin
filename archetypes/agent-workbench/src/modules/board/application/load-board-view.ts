import type { BoardListCard, BoardView } from '../model/board-view'
import type {
  BoardId,
  BoardPlacement,
  BoardWidgetRecord,
  WidgetDataJobRecord,
  WidgetJobRunRecord,
} from '../model/types'
import type { BoardStorePort } from '../ports/board-store-port'

async function loadPlacedWidgets(
  store: BoardStorePort,
  placements: readonly BoardPlacement[],
): Promise<BoardWidgetRecord[]> {
  const widgets: BoardWidgetRecord[] = []
  for (const placement of placements) {
    const widget = await store.getWidget(placement.widgetId)
    if (widget) widgets.push(widget)
  }
  return widgets
}

export async function loadBoardList(
  store: BoardStorePort,
): Promise<BoardListCard[]> {
  const boards = await store.listBoards()
  const cards: BoardListCard[] = []
  for (const board of boards) {
    cards.push({
      board,
      widgets: await loadPlacedWidgets(store, board.placements),
    })
  }
  return cards
}

export async function loadBoardView(
  store: BoardStorePort,
  boardId: BoardId,
): Promise<BoardView | null> {
  const board = await store.getBoard(boardId)
  if (!board) return null

  const widgets = new Map<string, BoardWidgetRecord>()
  for (const widget of await loadPlacedWidgets(store, board.placements)) {
    widgets.set(widget.id, widget)
  }

  const jobs = new Map<string, WidgetDataJobRecord>()
  const lastRunByJobId = new Map<string, WidgetJobRunRecord>()
  for (const placement of board.placements) {
    const job = await store.getJobByWidgetId(placement.widgetId)
    if (!job) continue
    jobs.set(placement.widgetId, job)
    const runs = await store.listRuns(job.id)
    const last = runs[runs.length - 1]
    if (last) lastRunByJobId.set(job.id, last)
  }

  return { board, widgets, jobs, lastRunByJobId }
}
