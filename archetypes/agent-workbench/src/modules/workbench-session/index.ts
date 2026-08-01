/**
 * Workbench Session Module — public Interface only.
 * Owns static fixture selection and task-scoped layout state.
 *
 * Public surface: controller hook + view/command/seed/tab/task/project types.
 * Reducer, selectors, createInitialState, and layout constants stay Implementation.
 */

export { useWorkbenchSession } from './application/use-workbench-session'

export type {
  ProjectSummary,
  TaskId,
  TaskLayoutState,
  TaskSummary,
  WorkbenchSessionCommand,
  WorkbenchSessionCommands,
  WorkbenchSessionController,
  WorkbenchSessionSeed,
  WorkbenchSessionView,
  WorkSurfaceTab,
  WorkSurfaceTabId,
} from './model/types'
