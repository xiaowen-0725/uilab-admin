/**
 * Task Module — public Interface.
 *
 * Owns:
 * - RuntimePort / EventStorePort / projection / TaskSurface
 * - Phase 4B Runtime Kernel + Deterministic Fake
 * - Phase 4C–4F Task Pane (projection, Fake scenarios, fold/scroll)
 * - Capture path only via test harness / explicit demo (not product default)
 *
 * Product default: Runtime path (Fake or local VoltAgent sidecar).
 * VoltAgent Adapter is a local sidecar client — not a remote multi-tenant production Runtime.
 * Does not own Project/Task directory (see modules/project).
 */

// --- Capture + Task Surface UI ---
export { TaskSurface } from './ui/task-surface/task-surface'
export type {
  TaskSurfaceView,
  TaskSurfaceProps,
  TaskSurfaceComposerRuntime,
} from './ui/task-surface/task-surface'

export { Timeline, TIMELINE_FOLD_THRESHOLD } from './ui/timeline/timeline'
export type {
  TimelineProps,
  TimelineOpenFileRef,
} from './ui/timeline/timeline'

export { LiveStatusLine } from './ui/live-status-line'
export type { LiveStatusLineProps } from './ui/live-status-line'

export { useCapturePlayback } from './ui/execution-stream/use-capture-playback'
export type {
  CapturePlaybackOptions,
  CapturePlaybackResult,
} from './ui/execution-stream/use-capture-playback'

export type {
  ContextSection,
  ExecutionItem,
  LaunchAction,
  TaskContentMode,
} from './model/types'

export {
  captureMaxTs,
  foldCaptureToView,
  formatDurationMs,
} from './model/stream-events'
export type {
  EventStreamCapture,
  StreamEvent,
  StreamViewModel,
  TurnViewModel,
} from './model/stream-events'

// --- Phase 4B Kernel: domain ---
export type {
  ProjectId,
  TaskId,
  TurnId,
  RunId,
  RunStatus,
  TitleSource,
  Task,
  Turn,
  Run,
} from './model/lifecycle'
export {
  asProjectId,
  asTaskId,
  asTurnId,
  asRunId,
  isTerminalRunStatus,
  RUN_TERMINAL_STATUSES,
} from './model/lifecycle'

export type { TaskExecutionContext } from './model/execution-context'
export { emptyTaskExecutionContext } from './model/execution-context'

export { localTitleFromPrompt, UNTITLED_TASK_FALLBACK } from './model/title-policy'

export type {
  RunTransitionEvent,
  RunTransitionResult,
  RunTransitionOk,
  RunTransitionError,
} from './model/run-transitions'
export { applyRunTransition } from './model/run-transitions'

// --- Phase 4B Kernel: protocol ---
export type {
  ApplicationCommand,
  CommandEnvelope,
  CommandActor,
  CommandAcknowledgement,
  CommandAcknowledgementStatus,
  TurnComposerContext,
  CreateTaskCommand,
  SubmitTurnCommand,
  CancelRunCommand,
  RetryTurnCommand,
  RespondToApprovalCommand,
  ProvideRunInputCommand,
  QueueFollowUpCommand,
  SteerRunCommand,
  ReconcileInterruptedRunCommand,
} from './protocol/commands'

export type {
  AgentRuntimeEventEnvelope,
  AgentRuntimeEventType,
} from './protocol/events'
export {
  AGENT_RUNTIME_EVENT_TYPES,
  FAKE_RUNTIME_CORE_EVENT_TYPES,
} from './protocol/events'

// --- Phase 4B Kernel: ports ---
export type {
  RuntimePort,
  RunStartInput,
  RuntimeSnapshot,
  RuntimeCapabilities,
  RuntimeSubscriptionEvent,
  RuntimeUnsubscribe,
} from './ports/runtime-port'

export type {
  EventStorePort,
  EventStoreAppendResult,
  EventStoreReadOptions,
  EventStoreError,
  EventStoreCheckpointInput,
  EventStoreCheckpointResult,
} from './ports/event-store-port'
export { EventStorePortError } from './ports/event-store-port'

// --- Phase 4B Kernel: runtime ---
export { VirtualClock } from './runtime/virtual-clock'
export type { VirtualClockOptions, ScheduledHandle } from './runtime/virtual-clock'

export {
  DeterministicFakeRuntime,
  createDeterministicFakeRuntime,
} from './runtime/fake-runtime'
export type {
  DeterministicFakeRuntimeOptions,
  FakeScenarioName,
} from './runtime/fake-runtime'

export {
  MemoryEventStore,
  createMemoryEventStore,
} from './runtime/memory-event-store'

export {
  IdbEventStore,
  createIdbEventStore,
} from './runtime/idb-event-store'

export {
  mapFullStreamChunk,
  mapFullStreamChunks,
} from './runtime/voltagent/fullstream-to-envelope'
export type {
  FullStreamChunk,
  MapFullStreamContext,
  MapFullStreamResult,
} from './runtime/voltagent/fullstream-to-envelope'

export {
  VoltAgentRuntimeAdapter,
  createVoltAgentRuntimeAdapter,
} from './runtime/voltagent/voltagent-runtime-adapter'
export type { VoltAgentRuntimeAdapterOptions } from './runtime/voltagent/voltagent-runtime-adapter'

export {
  previewText,
  runtimeHonestyCopy,
} from './runtime/runtime-honesty'
export type {
  RuntimeHonestyCopy,
  RuntimeHonestyMode,
} from './runtime/runtime-honesty'

// --- Phase 4B Kernel: application ---
export { dispatchCommand, validateCommand } from './application/dispatch'

// --- Phase 4C: projection ---
export type {
  TimelineItemCategory,
  TimelineItem,
  TimelineItemMeta,
  TimelineItemSourceRange,
  ProcessStepKind,
  ProcessSummary,
  TimelineFollowMode,
  TaskScrollMeta,
  TaskReadModel,
  ProjectionState,
} from './projection/types'
export {
  emptyTaskReadModel,
  emptyProjectionState,
} from './projection/empty-read-model'
export type { EmptyReadModelOptions } from './projection/empty-read-model'
export {
  applyRuntimeEvent,
  projectEvents,
  projectEventsFromEmpty,
  setTimelineFollowMode,
} from './projection/project-events'

// --- Phase 4C: application controller ---
export {
  CommandFactory,
  createCounterIdSource,
} from './application/command-factory'
export type {
  CommandClock,
  CommandIdSource,
  CommandFactoryOptions,
} from './application/command-factory'
export { TaskRuntimeController } from './application/task-runtime-controller'
export type {
  TaskRuntimeControllerOptions,
  TaskRuntimeListener,
  EventStoreHonestyKind,
  WorkSurfaceOpenRequestedListener,
  WorkSurfaceOpenRequestedPayload,
} from './application/task-runtime-controller'
export { useTaskRuntime } from './application/use-task-runtime'
export type { UseTaskRuntimeResult } from './application/use-task-runtime'

export {
  RunStatusIndex,
  createRunStatusIndex,
  isNavigatorBusyStatus,
} from './application/run-status-index'
export type { RunStatusIndexListener } from './application/run-status-index'
