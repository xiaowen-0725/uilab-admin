/**
 * Board command path — the only place that enforces the per-Board widget cap.
 */

import {
  BOARD_WIDGET_LIMIT,
  type BoardId,
  type BoardPlacement,
  type BoardWidgetRecord,
  type WidgetDataJobRecord,
  type WidgetDataSourceRecord,
} from '../model/types'
import {
  BoardStorePortError,
  type BoardStorePort,
} from '../ports/board-store-port'

export class BoardWidgetLimitError extends Error {
  readonly code = 'widget_limit_exceeded'
  readonly boardId: BoardId

  constructor(boardId: BoardId) {
    super(`每块看板最多 ${BOARD_WIDGET_LIMIT} 个小组件`)
    this.name = 'BoardWidgetLimitError'
    this.boardId = boardId
  }
}

export interface AddWidgetToBoardInput {
  boardId: BoardId
  widget: BoardWidgetRecord
  placement: BoardPlacement
  job?: WidgetDataJobRecord
  dataSource?: WidgetDataSourceRecord
}

/**
 * Create a widget (and optional job) and append its placement.
 * Tools and UI must both go through this command so the cap cannot be bypassed.
 */
function notFound(message: string): never {
  throw new BoardStorePortError({
    code: 'not_found',
    message,
    retriable: false,
  })
}

export async function addWidgetToBoard(
  store: BoardStorePort,
  input: AddWidgetToBoardInput,
): Promise<void> {
  const board = await store.getBoard(input.boardId)
  if (!board) notFound('看板不存在')
  if (board.placements.length >= BOARD_WIDGET_LIMIT) {
    throw new BoardWidgetLimitError(input.boardId)
  }
  await store.commitAtomically({
    board: {
      ...board,
      updatedAt: new Date().toISOString(),
    },
    widget: input.widget,
    job: input.job,
    dataSource: input.dataSource,
    appendPlacement: input.placement,
  })
}

/**
 * Persist a user-edited layout. This replaces placements — unlike agent
 * `appendPlacement`, which must never overwrite the array.
 */
export async function updateBoardLayout(
  store: BoardStorePort,
  boardId: BoardId,
  placements: readonly BoardPlacement[],
): Promise<void> {
  const board = await store.getBoard(boardId)
  if (!board) notFound('看板不存在')
  await store.putBoard({
    ...board,
    placements: [...placements],
    updatedAt: new Date().toISOString(),
  })
}

/** Clear job approval so the job cannot run until it is approved again. */
export async function revokeJobApproval(
  store: BoardStorePort,
  jobId: WidgetDataJobRecord['id'],
): Promise<void> {
  const job = await store.getJob(jobId)
  if (!job) notFound('作业不存在')
  const next: WidgetDataJobRecord = {
    ...job,
    updatedAt: new Date().toISOString(),
  }
  delete next.approved
  await store.putJob(next)
}
