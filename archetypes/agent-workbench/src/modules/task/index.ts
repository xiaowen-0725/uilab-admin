/**
 * Task Module — public Interface.
 * Owns Task Surface, execution fixture presentation, Composer, and Task Context Panel UI.
 * Does not model Turn/Run/RuntimeEvent (Phase 4+).
 *
 * Public surface is intentionally minimal: TaskSurface + TaskSurfaceView (+ optional close).
 * Composer, ContextPanel, and ExecutionStream stay Module Implementation.
 * Workspace chrome (title / Context / Work toggles) lives in Shell top bar (Phase 3A).
 */

export { TaskSurface } from './ui/task-surface/task-surface'
export type { TaskSurfaceView } from './ui/task-surface/task-surface'

export type { ContextSection, ExecutionItem } from './model/types'
