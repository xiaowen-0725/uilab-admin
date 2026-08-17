/**
 * Composition Board wiring — store / content / client-tool executor / preview.
 * Keeps workbench-app a thin assembler (AGENTS.md rule 16).
 */
import { useMemo, useRef, useState, type MutableRefObject } from 'react'
import { resolveVoltAgentBaseUrl } from '@/config/runtime-adapter'
import {
  createBoardClientToolExecutor,
  createBoardPreviewPolicy,
  createHttpBoardContent,
  createHttpBoardJobRuntime,
  createIdbBoardStore,
  createMemoryBoardContent,
  createMemoryBoardJobRuntime,
  createMemoryBoardStore,
  type BoardClientToolExecutor,
  type BoardContentPort,
  type BoardJobRuntimePort,
  type BoardStorePort,
} from '@/modules/board'
import type { WorkbenchSessionCommands } from '@/modules/workbench-session'
import type { BoardSurfaceWiring } from './surface-assembly'

const INSTANT_DEMO =
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITEST === true ||
  import.meta.env.VITEST === 'true'

export type BoardOpener = (boardId?: string) => void

export interface UseWorkbenchBoardWiringInput {
  db: IDBDatabase | null
  selectedTaskId: string | null
  closeWorkSurfaceTab: WorkbenchSessionCommands['closeWorkSurfaceTab']
  boardStore?: BoardStorePort
  boardContent?: BoardContentPort
  boardJobRuntime?: BoardJobRuntimePort
}

export interface WorkbenchBoardWiring {
  store: BoardStorePort
  revision: number
  executor: BoardClientToolExecutor
  surface: BoardSurfaceWiring
  boardOpenerRef: MutableRefObject<BoardOpener | null>
  attachPreviewOpener: (
    opener: (boardId: string, title?: string) => void,
  ) => void
}

function sidecarToken(): string | null {
  return (
    (import.meta.env.VITE_UILAB_SIDECAR_TOKEN as string | undefined) ??
    (import.meta.env.UILAB_SIDECAR_TOKEN as string | undefined) ??
    null
  )
}

function defaultJobRuntime(): BoardJobRuntimePort {
  if (INSTANT_DEMO) return createMemoryBoardJobRuntime()
  return createHttpBoardJobRuntime({
    baseUrl: resolveVoltAgentBaseUrl(),
    token: sidecarToken(),
  })
}

export function useWorkbenchBoardWiring(
  input: UseWorkbenchBoardWiringInput,
): WorkbenchBoardWiring {
  const store = useMemo(() => {
    if (input.boardStore) return input.boardStore
    if (input.db) return createIdbBoardStore(input.db)
    return createMemoryBoardStore()
  }, [input.boardStore, input.db])
  const content = useMemo(() => {
    if (input.boardContent) return input.boardContent
    if (INSTANT_DEMO) return createMemoryBoardContent()
    return createHttpBoardContent({
      baseUrl: resolveVoltAgentBaseUrl(),
      token: sidecarToken(),
    })
  }, [input.boardContent])
  const jobRuntime = useMemo(
    () => input.boardJobRuntime ?? defaultJobRuntime(),
    [input.boardJobRuntime],
  )
  const previewPolicy = useMemo(() => createBoardPreviewPolicy(), [])
  const [revision, setRevision] = useState(0)
  const selectedTaskIdRef = useRef(input.selectedTaskId)
  selectedTaskIdRef.current = input.selectedTaskId
  const openBoardPreviewRef = useRef<
    ((boardId: string, title?: string) => void) | null
  >(null)
  const boardOpenerRef = useRef<BoardOpener | null>(null)
  const executorRef = useRef<BoardClientToolExecutor | null>(null)
  executorRef.current = createBoardClientToolExecutor({
    store,
    content,
    effects: {
      preview: previewPolicy,
      jobRuntime,
      openPreview: ({ boardId, title, taskId }) => {
        if (taskId && selectedTaskIdRef.current !== taskId) return
        setRevision((value) => value + 1)
        openBoardPreviewRef.current?.(boardId, title)
      },
    },
  })

  const surface = useMemo<BoardSurfaceWiring>(
    () => ({
      store,
      revision,
      onOpenFull: (boardId: string) => boardOpenerRef.current?.(boardId),
      onClosePreview: (tabId: string) => {
        previewPolicy.onUserClose()
        input.closeWorkSurfaceTab(tabId)
      },
    }),
    [input.closeWorkSurfaceTab, previewPolicy, revision, store],
  )

  return {
    store,
    revision,
    executor: async (args) =>
      executorRef.current?.(args) ?? {
        ok: false,
        error: 'runtime_unavailable',
        hint: '看板控制面尚未接通，无法提交',
      },
    surface,
    boardOpenerRef,
    attachPreviewOpener: (opener) => {
      openBoardPreviewRef.current = opener
    },
  }
}
