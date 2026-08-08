/**
 * Workbench Session Module — public Interface only.
 * Owns selection pointers (project + task|null) and per-task layout chrome.
 * Does not own project/task directory arrays.
 */

export { useWorkbenchSession } from './application/use-workbench-session'
export { workSurfaceTabIdFor } from './application/reducer'

export type {
  ProjectId,
  SurfaceKind,
  TaskId,
  TaskLayoutState,
  WorkbenchSessionCommand,
  WorkbenchSessionCommands,
  WorkbenchSessionController,
  WorkbenchSessionSeed,
  WorkbenchSessionView,
  WorkSurfaceOpenFocus,
  WorkSurfaceOpenSource,
  WorkSurfaceTab,
  WorkSurfaceTabId,
  WorkSurfaceTabRecord,
} from './model/types'
