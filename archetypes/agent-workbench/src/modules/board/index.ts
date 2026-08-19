/**
 * Board Module — public Interface.
 *
 * Owns: Board / Board Widget / Widget Data Job entities, BoardStorePort,
 * the application command path (per-Board widget cap), widget srcdoc
 * assembly, the host bridge SDK, and the iframe frame (sandbox + csp).
 * Does not own: sidecar tools or the job runtime.
 */

export {
  ANONYMOUS_PRINCIPAL_KEY,
  BOARD_WIDGET_LIMIT,
  DEFAULT_WIDGET_SPAN,
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
  DataSourceResourceParameterDecl,
  JobContext,
  SubmitSpec,
  WidgetDataJobId,
  WidgetDataJobRecord,
  WidgetDataSnapshotRecord,
  WidgetDataSourceId,
  WidgetDataSourceKind,
  WidgetDataSourceRecord,
  WidgetDataSourceTrigger,
  WidgetJobApprovedSnapshot,
  WidgetJobPendingChange,
  WidgetJobRunId,
  WidgetJobRunRecord,
  WidgetJobRunStatus,
  WidgetSpan,
} from './model/types'
export {
  createPresetDataSource,
  dataSourceFromJob,
  dataSourceIdForWidget,
} from './model/data-source'

export type {
  BoardAtomicCommitInput,
  BoardRunCommitOptions,
  BoardSnapshotReadOptions,
  BoardStoreError,
  BoardStorePort,
  BoardStructureFilter,
  IdentityBarrierInput,
} from './ports/board-store-port'
export type {
  ClaimScheduleLeaseInput,
  ClaimScheduleLeaseResult,
  ScheduleLeaseRecord,
} from './model/schedule-lease'
export {
  SCHEDULE_LEASES_METADATA_KEY,
  isLeaseHeld,
  resolveScheduleClaim,
  scheduleCommitFenceRejects,
} from './model/schedule-lease'
export type {
  HostWakeSubscribe,
  ScheduleWakePort,
  ScheduleWakeUnsubscribe,
} from './ports/schedule-wake-port'
export {
  createFakeScheduleWake,
  createHostScheduleWake,
} from './adapters/schedule-wake'
export { BoardStorePortError } from './ports/board-store-port'
export type {
  AuthorizedResource,
  IdentityAuthorization,
  IdentityInvalidationEvent,
  IdentityInvalidationReason,
  IdentityScopePort,
  IdentityScopeSnapshot,
  IdentityScopeUnsubscribe,
} from './ports/identity-scope-port'
export {
  ANONYMOUS_IDENTITY_GENERATION,
  UNRESTRICTED_AUTHORIZATION,
} from './ports/identity-scope-port'

export { IdbBoardStore, createIdbBoardStore } from './adapters/idb-board-store'
export type { IdbBoardStoreOptions } from './adapters/idb-board-store'
export { createHttpBoardContent } from './adapters/http-board-content'
export type { HttpBoardContentOptions } from './adapters/http-board-content'
export { createHttpBoardJobRuntime } from './adapters/http-board-job-runtime'
export type { HttpBoardJobRuntimeOptions } from './adapters/http-board-job-runtime'
export {
  MemoryBoardContent,
  createMemoryBoardContent,
} from './adapters/memory-board-content'
export {
  MemoryBoardJobRuntime,
  createMemoryBoardJobRuntime,
  createUnavailableBoardJobRuntime,
} from './adapters/memory-board-job-runtime'
export type { BoardContentPort } from './ports/board-content-port'
export type {
  BoardJobRuntimePort,
  WidgetDataSourceEvaluateRequest,
  WidgetDataSourcePort,
} from './ports/board-job-runtime-port'
export {
  QUERY_SOURCE_NOT_IMPLEMENTED,
  defaultEvaluateDataSource,
  evaluateWidgetDataSource,
} from './ports/board-job-runtime-port'

export {
  addWidgetToBoard,
  BoardWidgetLimitError,
  revokeJobApproval,
  updateBoardLayout,
} from './application/board-commands'
export { ensureExampleBoards } from './application/ensure-example-boards'
export type { AddWidgetToBoardInput } from './application/board-commands'
export { loadBoardList, loadBoardView } from './application/load-board-view'
export {
  commitBoardDraft,
  readBoardStatus,
  runCommittedJob,
} from './application/board-write-channel'
export {
  createBoardRefreshController,
  executeJobRun,
  findUnavailable,
} from './application/board-refresh'
export type {
  BoardRefreshController,
  RefreshOutcome,
} from './application/board-refresh'
export {
  IDENTITY_NEEDS_RELOGIN,
} from './model/widget-render-state'
export type { WidgetIdentityChrome } from './model/widget-render-state'
export {
  BOARD_JOB_DEFAULT_TIMEOUT_MS,
  BOARD_JOB_MAX_TIMEOUT_MS,
  BOARD_REFRESH_CONCURRENCY,
  BOARD_REFRESH_POLL_INTERVAL_MS,
  BOARD_REFRESH_STALE_MS,
  BOARD_SCHEDULE_LEASE_MS,
  BOARD_SCHEDULE_TICK_MS,
  JOB_DENO_MISSING,
  JOB_INVALID_RESULT,
  JOB_RUNTIME_DISCONNECTED,
  isScheduleDue,
  isWidgetDataStale,
  mapJobRuntimeHint,
  parseJobResult,
  scheduleEveryMs,
} from './model/refresh-policy'
export type {
  BoardCommitInput,
  BoardCommitOk,
  BoardStatusInput,
  BoardStatusOk,
  BoardToolFailure,
} from './application/board-write-channel'
export {
  BOARD_FEATURE_ID,
  grantBoardCapability,
  resolveCapabilityFeatureIds,
} from './application/board-capability'
export {
  BOARD_CLIENT_TOOL_NAMES,
  createBoardClientToolExecutor,
  isBoardClientTool,
} from './application/board-client-tools'
export type {
  BoardClientToolExecutor,
  BoardCommitEffects,
} from './application/board-client-tools'
export {
  BoardPreviewPolicy,
  createBoardPreviewPolicy,
} from './application/board-preview-policy'
export { createMemoryBoardStore, MemoryBoardStore } from './adapters/memory-board-store'

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

export {
  BOARD_PREVIEW_WIDTH,
  DETAIL_GEOMETRY,
  GRID_COLUMNS,
  PREVIEW_GEOMETRY,
  THUMBNAIL_GEOMETRY,
  THUMBNAIL_SCALE,
  THUMBNAIL_SLOTS,
  firstEmptySlot,
  moveItem,
  resizeItem,
} from './model/grid'
export { hashBoardContent } from './model/content-hash'
export { DRAG_HANDLE_ATTR } from './model/drag-handle'
export { formatRelative } from './model/relative-time'
export type { BoardListCard, BoardView } from './model/board-view'

export { BoardCanvas } from './ui/board-canvas'
export {
  BoardListPage,
  THUMBNAIL_COST_CEILING_MS,
  resolveThumbnailMode,
} from './ui/board-list-page'
export type { ThumbnailMode } from './ui/board-list-page'
export { BoardDetailPage, JOB_RUNTIME_UNAVAILABLE } from './ui/board-detail-page'
export { BoardPreviewPanel } from './ui/board-preview-panel'
export { BoardPreviewLoader } from './ui/board-preview-loader'
export { BoardWorkspace } from './ui/board-workspace'
export { BoardJobDialog } from './ui/board-job-dialog'
