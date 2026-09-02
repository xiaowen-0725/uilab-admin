/**
 * Composition Interactive Artifact wiring — store / Memory staging / commit executor.
 * Live sidecar staging is #185; this ticket keeps Memory content by default.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
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
import type { CreateInteractiveSurfaceOptions } from '@/modules/work-surface'

export type InteractiveCommittedOpener = (
  artifactId: string,
  title?: string,
) => void

export interface UseWorkbenchInteractiveArtifactWiringInput {
  db: IDBDatabase | null
  selectedTaskId: string | null
  store?: InteractiveArtifactStorePort
  content?: InteractiveArtifactContentPort
}

export interface WorkbenchInteractiveArtifactWiring {
  store: InteractiveArtifactStorePort
  executor: InteractiveArtifactClientToolExecutor
  surface: CreateInteractiveSurfaceOptions
  attachCommittedOpener: (opener: InteractiveCommittedOpener) => void
}

export function shouldOpenInteractiveSurfaceOnCommit(input: {
  replayed: boolean
  taskId: string
  selectedTaskId: string | null
}): boolean {
  return !input.replayed && input.selectedTaskId === input.taskId
}

function routeClientTool(
  board: BoardClientToolExecutor,
  interactive: InteractiveArtifactClientToolExecutor,
  input: Parameters<ClientToolExecutor>[0],
): ReturnType<ClientToolExecutor> {
  if (isInteractiveClientTool(input.toolName)) {
    return interactive(input)
  }
  return board(input)
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
  const [revision, setRevision] = useState(0)
  const selectedTaskIdRef = useRef(input.selectedTaskId)
  selectedTaskIdRef.current = input.selectedTaskId
  const openInteractiveRef = useRef<InteractiveCommittedOpener | null>(null)
  const executorRef = useRef<InteractiveArtifactClientToolExecutor | null>(null)
  executorRef.current = createInteractiveArtifactClientToolExecutor({
    store,
    content,
    effects: {
      onCommitted: ({ taskId, artifactId, title, replayed }) => {
        if (
          !shouldOpenInteractiveSurfaceOnCommit({
            replayed,
            taskId,
            selectedTaskId: selectedTaskIdRef.current,
          })
        ) {
          return
        }
        setRevision((value) => value + 1)
        openInteractiveRef.current?.(artifactId, title)
      },
    },
  })

  const surface = useMemo<CreateInteractiveSurfaceOptions>(
    () => ({
      lookup: {
        get: (taskId, artifactId) => store.get(taskId, artifactId),
      },
      revision,
    }),
    [revision, store],
  )

  return {
    store,
    executor: async (args) =>
      executorRef.current?.(args) ?? {
        ok: false,
        error: 'runtime_unavailable',
        hint: '交互产物控制面尚未接通，无法提交',
      },
    surface,
    attachCommittedOpener: (opener) => {
      openInteractiveRef.current = opener
    },
  }
}

export function createCombinedClientToolExecutor(
  board: BoardClientToolExecutor,
  interactive: InteractiveArtifactClientToolExecutor,
): ClientToolExecutor {
  return async (input) => routeClientTool(board, interactive, input)
}

export function useWorkbenchClientToolExecutor(
  board: BoardClientToolExecutor,
  interactive: InteractiveArtifactClientToolExecutor,
): ClientToolExecutor {
  const ref = useRef({ board, interactive })
  ref.current = { board, interactive }
  return useCallback(
    (input) => routeClientTool(ref.current.board, ref.current.interactive, input),
    [],
  )
}
