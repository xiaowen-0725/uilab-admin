/**
 * Board Module — public Interface.
 *
 * Owns: Board / Board Widget / Widget Data Job entities, BoardStorePort,
 * the application command path (per-Board widget cap), widget srcdoc
 * assembly, the host bridge SDK, and the iframe frame (sandbox + csp).
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

export {
  WIDGET_HANDSHAKE_TYPE,
  WIDGET_HEARTBEAT_MISS_LIMIT,
  WIDGET_HEARTBEAT_MS,
  WIDGET_INPUT_KEY_LIMIT,
  WIDGET_INPUT_VALUE_MAX_BYTES,
  WIDGET_MESSAGE_MAX_BYTES,
  WIDGET_READY_RELOAD_LIMIT,
  WIDGET_READY_TIMEOUT_MS,
  WIDGET_THEME_VARS,
  buildWidgetDocument,
  isAllowedOpenLink,
  validateSaveInput,
} from './model/widget-document'
export type {
  HostToWidgetMessage,
  WidgetCapabilities,
  WidgetDocumentInput,
  WidgetTheme,
  WidgetToHostMessage,
} from './model/widget-document'

export { BoardWidgetFrame, readHostCspNonce } from './ui/board-widget-frame'
export type { BoardWidgetFrameProps } from './ui/board-widget-frame'

export { BoardWidgetHost } from './ui/board-widget-host'
export type {
  BoardWidgetHostProps,
  WidgetChrome,
} from './ui/board-widget-host'
