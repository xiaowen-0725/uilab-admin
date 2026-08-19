import type { BoardListCard, BoardView } from '../model/board-view'
import type {
  BoardId,
  BoardPlacement,
  BoardWidgetRecord,
  WidgetDataJobRecord,
  WidgetDataSourceRecord,
  WidgetJobRunRecord,
} from '../model/types'
import type { BoardStorePort } from '../ports/board-store-port'
import type { BoardSnapshotReadOptions } from '../ports/board-store-port'

async function loadPlacedWidgets(
  store: BoardStorePort,
  placements: readonly BoardPlacement[],
  options?: BoardSnapshotReadOptions,
): Promise<BoardWidgetRecord[]> {
  const widgets: BoardWidgetRecord[] = []
  for (const placement of placements) {
    const widget = await store.getWidget(placement.widgetId, options)
    if (widget) widgets.push(widget)
  }
  return widgets
}

export async function loadBoardList(
  store: BoardStorePort,
  options?: BoardSnapshotReadOptions,
): Promise<BoardListCard[]> {
  const boards = await store.listBoards()
  const cards: BoardListCard[] = []
  for (const board of boards) {
    const widgets = await loadPlacedWidgets(store, board.placements, options)
    const sources = new Map<string, WidgetDataSourceRecord>()
    for (const placement of board.placements) {
      const source = await store.getDataSourceByWidgetId(placement.widgetId)
      if (source) sources.set(placement.widgetId, source)
    }
    cards.push({ board, widgets, sources })
  }
  return cards
}

export async function loadBoardView(
  store: BoardStorePort,
  boardId: BoardId,
  options?: BoardSnapshotReadOptions,
): Promise<BoardView | null> {
  const board = await store.getBoard(boardId)
  if (!board) return null

  const widgets = new Map<string, BoardWidgetRecord>()
  for (const widget of await loadPlacedWidgets(store, board.placements, options)) {
    widgets.set(widget.id, widget)
  }

  const jobs = new Map<string, WidgetDataJobRecord>()
  const sources = new Map<string, WidgetDataSourceRecord>()
  const lastRunByJobId = new Map<string, WidgetJobRunRecord>()
  for (const placement of board.placements) {
    const source = await store.getDataSourceByWidgetId(placement.widgetId)
    if (source) sources.set(placement.widgetId, source)
    const job = await store.getJobByWidgetId(placement.widgetId)
    if (!job) continue
    jobs.set(placement.widgetId, job)
    const runs = await store.listRuns(job.id)
    const last = runs[runs.length - 1]
    if (last) lastRunByJobId.set(job.id, last)
  }

  return { board, widgets, jobs, sources, lastRunByJobId }
}
