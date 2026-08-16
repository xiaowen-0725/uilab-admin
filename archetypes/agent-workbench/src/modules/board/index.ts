/**
 * Board Module — public Interface.
 *
 * Owns: Board / Board Widget / Widget Data Job entities, BoardStorePort,
 * the application command path (per-Board widget cap), and the widget
 * subdocument policy + iframe frame (sandbox + csp).
 * Does not own: canvas UI, sidecar tools, or the job runtime.
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

export {
  CSP_DEV_CONNECT_PLACEHOLDER,
  CSP_NONCE_PLACEHOLDER,
  WIDGET_IFRAME_CSP_TEMPLATE,
  WIDGET_IFRAME_SANDBOX,
  buildHostDocumentCsp,
  buildWidgetIframeCsp,
  hostCspCoversWidgetCsp,
} from './model/widget-subdocument-policy'
export type {
  CspCoverageResult,
  HostDocumentCspInput,
} from './model/widget-subdocument-policy'

export { BoardWidgetFrame, readHostCspNonce } from './ui/board-widget-frame'
export type { BoardWidgetFrameProps } from './ui/board-widget-frame'
