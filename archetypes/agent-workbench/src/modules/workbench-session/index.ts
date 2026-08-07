/**
 * Workbench Session Module — public Interface only.
 * Owns selection pointers (project + task|null) and per-task layout chrome.
 * Does not own project/task directory arrays.
 */

export { useWorkbenchSession } from './application/use-workbench-session'

export type {
  ProjectId,
  TaskId,
  TaskLayoutState,
  WorkbenchSessionCommand,
  WorkbenchSessionCommands,
  WorkbenchSessionController,
  WorkbenchSessionSeed,
  WorkbenchSessionView,
  WorkSurfaceTab,
  WorkSurfaceTabId,
} from './model/types'
