import { useCallback, useMemo, useReducer } from 'react'
import {
  createInitialSessionState,
  selectSessionView,
  workbenchSessionReducer,
} from './reducer'
import type {
  ProjectId,
  TaskId,
  WorkbenchSessionCommand,
  WorkbenchSessionCommands,
  WorkbenchSessionController,
  WorkbenchSessionSeed,
  WorkSurfaceTabId,
} from '../model/types'

/**
 * Controller hook — selection pointers + layout chrome for Composition Root.
 */
export function useWorkbenchSession(
  seed: WorkbenchSessionSeed,
): WorkbenchSessionController {
  const [state, dispatch] = useReducer(
    workbenchSessionReducer,
    seed,
    createInitialSessionState,
  )

  const run = useCallback((command: WorkbenchSessionCommand) => {
    dispatch(command)
  }, [])

  const commands: WorkbenchSessionCommands = useMemo(
    () => ({
      selectProject: (projectId: ProjectId, taskId?: TaskId | null) =>
        run({ type: 'selectProject', projectId, taskId }),
      selectTask: (taskId: TaskId | null) =>
        run({ type: 'selectTask', taskId }),
      ensureTaskLayout: (taskId: TaskId) =>
        run({ type: 'ensureTaskLayout', taskId }),
      removeTaskLayout: (taskId: TaskId) =>
        run({ type: 'removeTaskLayout', taskId }),
      toggleNavigator: () => run({ type: 'toggleNavigator' }),
      setNavigatorOpen: (open: boolean) =>
        run({ type: 'setNavigatorOpen', open }),
      toggleContextPanel: () => run({ type: 'toggleContextPanel' }),
      openWorkSurface: () => run({ type: 'openWorkSurface' }),
      closeWorkSurface: () => run({ type: 'closeWorkSurface' }),
      toggleWorkSurface: () => run({ type: 'toggleWorkSurface' }),
      activateTab: (tabId: WorkSurfaceTabId) =>
        run({ type: 'activateTab', tabId }),
      resizeWorkSurface: (width: number) =>
        run({ type: 'resizeWorkSurface', width }),
      toggleMaximize: () => run({ type: 'toggleMaximize' }),
      exitMaximize: () => run({ type: 'exitMaximize' }),
      hydratePointers: (input) =>
        run({
          type: 'hydratePointers',
          selectedProjectId: input.selectedProjectId,
          selectedTaskId: input.selectedTaskId,
          lastTaskByProject: input.lastTaskByProject,
          navigatorOpen: input.navigatorOpen,
        }),
      dispatch: run,
    }),
    [run],
  )

  const view = useMemo(() => selectSessionView(state), [state])

  return { view, commands }
}
