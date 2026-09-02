/**
 * Composition Interactive Artifact wiring — store / Memory staging / commit executor.
 * Live sidecar staging is #185; this ticket keeps Memory content by default.
 */
import { useCallback, useMemo, useRef } from 'react'
import {
  createIdbInteractiveArtifactStore,
  createInteractiveArtifactClientToolExecutor,
  createMemoryInteractiveArtifactContent,
  createMemoryInteractiveArtifactStore,
  isInteractiveClientTool,
  type InteractiveArtifactClientToolExecutor,
  type InteractiveArtifactContentPort,
  type InteractiveArtifactStorePort,
} from '@/modules/task'
import type { BoardClientToolExecutor } from '@/modules/board'
import type { ClientToolExecutor } from '@/modules/task-runtime'

export interface UseWorkbenchInteractiveArtifactWiringInput {
  db: IDBDatabase | null
  store?: InteractiveArtifactStorePort
  content?: InteractiveArtifactContentPort
}

export interface WorkbenchInteractiveArtifactWiring {
  store: InteractiveArtifactStorePort
  executor: InteractiveArtifactClientToolExecutor
}

export function useWorkbenchInteractiveArtifactWiring(
  input: UseWorkbenchInteractiveArtifactWiringInput,
): WorkbenchInteractiveArtifactWiring {
  const store = useMemo(() => {
    if (input.store) return input.store
    if (input.db) return createIdbInteractiveArtifactStore(input.db)
    return createMemoryInteractiveArtifactStore()
  }, [input.store, input.db])
  const content = useMemo(() => {
    if (input.content) return input.content
    return createMemoryInteractiveArtifactContent()
  }, [input.content])
  const executor = useMemo(
    () => createInteractiveArtifactClientToolExecutor({ store, content }),
    [store, content],
  )
  return { store, executor }
}

export function createCombinedClientToolExecutor(
  board: BoardClientToolExecutor,
  interactive: InteractiveArtifactClientToolExecutor,
): ClientToolExecutor {
  return async (input) => {
    if (isInteractiveClientTool(input.toolName)) {
      return interactive(input)
    }
    return board(input)
  }
}

export function useWorkbenchClientToolExecutor(
  board: BoardClientToolExecutor,
  interactive: InteractiveArtifactClientToolExecutor,
): ClientToolExecutor {
  const ref = useRef({ board, interactive })
  ref.current = { board, interactive }
  return useCallback((input) => {
    if (isInteractiveClientTool(input.toolName)) {
      return ref.current.interactive(input)
    }
    return ref.current.board(input)
  }, [])
}
