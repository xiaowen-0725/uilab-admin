/**
 * Task Module — public Interface.
 * Owns Task Surface, execution fixture presentation, Composer, and Task Context Panel UI.
 * Does not model Turn/Run/RuntimeEvent (Phase 4+).
 *
 * Public surface is intentionally minimal: TaskSurface + view/callback/view-data types only.
 * Composer, ContextPanel, and ExecutionStream stay Module Implementation.
 */

export { TaskSurface } from './ui/task-surface/task-surface'
export type {
  TaskSurfaceCallbacks,
  TaskSurfaceView,
} from './ui/task-surface/task-surface'

export type { ContextSection, ExecutionItem } from './model/types'
