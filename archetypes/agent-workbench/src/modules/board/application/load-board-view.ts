import type { BoardListCard, BoardView } from '../model/board-view'
import type {
  BoardId,
  BoardWidgetRecord,
  WidgetDataJobRecord,
  WidgetJobRunRecord,
} from '../model/types'
import type { BoardStorePort } from '../ports/board-store-port'

export async function loadBoardList(
  store: BoardStorePort,
): Promise<BoardListCard[]> {
  const boards = await store.listBoards()
  const cards: BoardListCard[] = []
  for (const board of boards) {
    const widgets: BoardWidgetRecord[] = []
    for (const placement of board.placements) {
      const widget = await store.getWidget(placement.widgetId)
      if (widget) widgets.push(widget)
    }
    cards.push({ board, widgets })
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
  const jobs = new Map<string, WidgetDataJobRecord>()
  const lastRunByJobId = new Map<string, WidgetJobRunRecord>()

  for (const placement of board.placements) {
    const widget = await store.getWidget(placement.widgetId)
    if (widget) widgets.set(widget.id, widget)
    const job = await store.getJobByWidgetId(placement.widgetId)
    if (!job) continue
    jobs.set(placement.widgetId, job)
    const runs = await store.listRuns(job.id)
    const last = runs[runs.length - 1]
    if (last) lastRunByJobId.set(job.id, last)
  }

  return { board, widgets, jobs, lastRunByJobId }
}
