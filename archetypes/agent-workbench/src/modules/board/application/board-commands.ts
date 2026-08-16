/**
 * Board command path — the only place that enforces the per-Board widget cap.
 */

import {
  BOARD_WIDGET_LIMIT,
  type BoardId,
  type BoardPlacement,
  type BoardWidgetRecord,
  type WidgetDataJobRecord,
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
}

/**
 * Create a widget (and optional job) and append its placement.
 * Tools and UI must both go through this command so the cap cannot be bypassed.
 */
export async function addWidgetToBoard(
  store: BoardStorePort,
  input: AddWidgetToBoardInput,
): Promise<void> {
  const board = await store.getBoard(input.boardId)
  if (!board) {
    throw new BoardStorePortError({
      code: 'not_found',
      message: '看板不存在',
      retriable: false,
    })
  }
  if (board.placements.length >= BOARD_WIDGET_LIMIT) {
    throw new BoardWidgetLimitError(input.boardId)
  }
  await store.putWidget(input.widget)
  if (input.job) {
    await store.putJob(input.job)
  }
  await store.appendPlacement(input.boardId, input.placement)
}
