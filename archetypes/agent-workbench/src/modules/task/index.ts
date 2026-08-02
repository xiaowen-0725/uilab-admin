/**
 * Task Module — public Interface.
 * Owns Task Surface, capture-driven stream presentation, Composer, Context Panel.
 * Does not model live Runtime (Phase 4+).
 */

export { TaskSurface } from './ui/task-surface/task-surface'
export type { TaskSurfaceView, TaskSurfaceProps } from './ui/task-surface/task-surface'

export type {
  ContextSection,
  ExecutionItem,
  LaunchAction,
  TaskContentMode,
} from './model/types'

export {
  foldCaptureToView,
  formatDurationMs,
} from './model/stream-events'
export type {
  EventStreamCapture,
  StreamEvent,
  StreamViewModel,
  TurnViewModel,
} from './model/stream-events'
