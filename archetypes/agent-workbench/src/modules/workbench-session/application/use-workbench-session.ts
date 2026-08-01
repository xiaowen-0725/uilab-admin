import { useCallback, useMemo, useReducer } from 'react'
import {
  createInitialSessionState,
  selectSessionView,
  workbenchSessionReducer,
} from './reducer'
import type {
  TaskId,
  WorkbenchSessionCommand,
  WorkbenchSessionCommands,
  WorkbenchSessionController,
  WorkbenchSessionSeed,
  WorkSurfaceTabId,
} from '../model/types'

/**
 * Controller hook — owns session state for the Composition Root.
 * Reducer and seed initialization stay Module Implementation (not public Interface).
 */
export function useWorkbenchSession(
  seed: WorkbenchSessionSeed
): WorkbenchSessionController {
  const [state, dispatch] = useReducer(
    workbenchSessionReducer,
    seed,
    createInitialSessionState
  )

  const run = useCallback((command: WorkbenchSessionCommand) => {
    dispatch(command)
  }, [])

  const commands: WorkbenchSessionCommands = useMemo(
    () => ({
      selectTask: (taskId: TaskId) => run({ type: 'selectTask', taskId }),
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
      dispatch: run,
    }),
    [run]
  )

  const view = useMemo(() => selectSessionView(state), [state])

  return { view, commands }
}
