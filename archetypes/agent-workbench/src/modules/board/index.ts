/**
 * Board Module — public Interface.
 *
 * Owns: Board / Board Widget / Widget Data Job entities, BoardStorePort,
 * and the application command path (per-Board widget cap).
 * Does not own: widget host, canvas UI, sidecar tools, or the job runtime.
 */

export {
  BOARD_WIDGET_LIMIT,
  WIDGET_JOB_RUN_LIMIT,
  isJobRunnable,
} from './model/types'
export type {
  BoardId,
  BoardMountId,
  BoardPlacement,
  BoardRecord,
  BoardWidgetId,
  BoardWidgetRecord,
  BoardWidgetStatus,
  DataSlotSpec,
  SubmitSpec,
  WidgetDataJobId,
  WidgetDataJobRecord,
  WidgetJobApprovedSnapshot,
  WidgetJobPendingChange,
  WidgetJobRunId,
  WidgetJobRunRecord,
  WidgetJobRunStatus,
  WidgetSpan,
} from './model/types'

export type { BoardStoreError, BoardStorePort } from './ports/board-store-port'
export { BoardStorePortError } from './ports/board-store-port'

export { IdbBoardStore, createIdbBoardStore } from './adapters/idb-board-store'

export { addWidgetToBoard, BoardWidgetLimitError } from './application/board-commands'
export type { AddWidgetToBoardInput } from './application/board-commands'
