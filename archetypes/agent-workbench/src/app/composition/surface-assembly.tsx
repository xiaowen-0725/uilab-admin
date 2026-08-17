/**
 * Composition Surface assembly — Registry factory + open channels.
 * Host never registers; Document/Browser/test register here only.
 */

import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { TimelineOpenFileRef } from '@/modules/task'
import type { TaskRuntimeController } from '@/modules/task'
import {
  createBrowserSurfaceDefinition,
  createDocumentSurfaceDefinition,
  createSurfaceRegistry,
  createTestSurfaceDefinition,
  createWebBrowserHostPort,
  resolveOpenWorkSurfaceIntent,
  WorkspaceDocumentEmptyExtra,
  WorkspaceDocumentToolbarTrailing,
  type DocumentContentPort,
  type SurfaceRegistry,
  type WorkspaceDocumentSource,
} from '@/modules/work-surface'
import type { WorkbenchSessionCommands } from '@/modules/workbench-session'
import {
  BoardPreviewLoader,
  type BoardStorePort,
} from '@/modules/board'

/**
 * Composition-only Surface Registry assembly.
 * Document content Port comes from WorkspaceDocumentSource (work-surface module).
 * Document registers before test so workspace paths resolve to document.
 */
export interface BoardSurfaceWiring {
  store: BoardStorePort
  onOpenFull: (boardId: string) => void
  onClosePreview: (tabId: string) => void
  revision?: number
}

export function createWorkbenchSurfaceRegistry(
  documentContent: DocumentContentPort,
  workspaceHint: string | null = null,
  board?: BoardSurfaceWiring,
): SurfaceRegistry {
  const registry = createSurfaceRegistry()
  registry.register(
    createDocumentSurfaceDefinition({
      content: documentContent,
      workspaceHint,
    }),
  )
  registry.register(
    createBrowserSurfaceDefinition({ host: createWebBrowserHostPort() }),
  )
  registry.register(createTestSurfaceDefinition())
  if (board) {
    registry.register({
      kind: 'board',
      displayName: '看板',
      render: (props) => (
        <BoardPreviewLoader
          boardId={props.resourceKey}
          store={board.store}
          revision={board.revision}
          theme={
            document.documentElement.classList.contains('dark')
              ? 'dark'
              : 'light'
          }
          onOpenFull={board.onOpenFull}
          onClose={() => board.onClosePreview(props.tabId)}
        />
      ),
    })
  }
  return registry
}

export type OpenWorkSurfaceTabCommand = WorkbenchSessionCommands['openWorkSurfaceTab']

/**
 * User channel: Timeline file chip/card → Session openWorkSurfaceTab.
 * Validates path/URL via intent; never mutates Host openTabs directly.
 */
export function openWorkSurfaceFromFileRef(
  registry: SurfaceRegistry,
  openWorkSurfaceTab: OpenWorkSurfaceTabCommand,
  info: TimelineOpenFileRef,
): boolean {
  const raw = (info.path ?? info.label ?? '').trim()
  if (!raw) return false
  const intent = resolveOpenWorkSurfaceIntent(registry, {
    resourceKey: raw,
    title: info.label,
    source: 'user',
  })
  if (!intent.ok) return false
  openWorkSurfaceTab({
    source: 'user',
    kind: intent.kind,
    resourceKey: intent.resourceKey,
    title: intent.title,
    focus: intent.focus,
  })
  return true
}

/**
 * Runtime channel: work_surface.open_requested payload → Session tab.
 * Caller must ensure selected-task defense; this only validates intent.
 */
export function openWorkSurfaceFromRuntimePayload(
  registry: SurfaceRegistry,
  openWorkSurfaceTab: OpenWorkSurfaceTabCommand,
  payload: {
    kind?: string
    resourceKey: string
    title?: string
    focus?: 'pane' | 'tab' | 'none'
  },
): boolean {
  const intent = resolveOpenWorkSurfaceIntent(registry, {
    kind: payload.kind,
    resourceKey: payload.resourceKey,
    title: payload.title,
    source: 'runtime',
    focus: payload.focus,
  })
  if (!intent.ok) return false
  openWorkSurfaceTab({
    source: 'runtime',
    kind: intent.kind,
    resourceKey: intent.resourceKey,
    title: intent.title,
    focus: intent.focus,
  })
  return true
}

export interface UseWorkbenchSurfaceAssemblyOptions {
  documentSource: WorkspaceDocumentSource
  hasOpenWorkTabs: boolean
  sessionCommands: WorkbenchSessionCommands
  /** Runtime controller (null until boot). */
  runtimeController: TaskRuntimeController | null
  /** Only open for this selected task (defense in depth). */
  selectedTaskId: string | null
  /** Re-bind listener after boot when controller appears. */
  bootReady: boolean
  board?: BoardSurfaceWiring
}

export interface WorkbenchSurfaceAssembly {
  surfaceRegistry: SurfaceRegistry
  workSurfaceEmptyExtra: ReactNode
  workSurfaceToolbarTrailing: ReactNode | undefined
  onOpenFileRef: (info: TimelineOpenFileRef) => void
}

/**
 * Registry + Document chrome + user/runtime open channels for Composition wiring.
 */
export function useWorkbenchSurfaceAssembly(
  options: UseWorkbenchSurfaceAssemblyOptions,
): WorkbenchSurfaceAssembly {
  const {
    documentSource,
    hasOpenWorkTabs,
    sessionCommands,
    runtimeController,
    selectedTaskId,
    bootReady,
    board,
  } = options

  const {
    runtimeMode: documentRuntimeMode,
    workspaceHint: documentWorkspaceHint,
    localFolderBound,
    pickerSupported,
    bindNotice,
    pickLocalFolder,
    clearLocalFolder,
    content: documentContent,
  } = documentSource

  const surfaceRegistry = useMemo(
    () =>
      createWorkbenchSurfaceRegistry(
        documentContent,
        documentWorkspaceHint,
        board,
      ),
    [board, documentContent, documentWorkspaceHint],
  )

  const workSurfaceEmptyExtra = useMemo(
    () => (
      <WorkspaceDocumentEmptyExtra
        runtimeMode={documentRuntimeMode}
        workspaceHint={documentWorkspaceHint}
        localFolderBound={localFolderBound}
        pickerSupported={pickerSupported}
        bindNotice={bindNotice}
        onPickLocalFolder={pickLocalFolder}
        onClearLocalFolder={clearLocalFolder}
      />
    ),
    [
      bindNotice,
      clearLocalFolder,
      documentRuntimeMode,
      documentWorkspaceHint,
      localFolderBound,
      pickLocalFolder,
      pickerSupported,
    ],
  )

  const workSurfaceToolbarTrailing = useMemo(() => {
    if (!hasOpenWorkTabs) return undefined
    return (
      <WorkspaceDocumentToolbarTrailing
        localFolderBound={localFolderBound}
        onClearLocalFolder={clearLocalFolder}
      />
    )
  }, [clearLocalFolder, hasOpenWorkTabs, localFolderBound])

  const onOpenFileRef = useCallback(
    (info: TimelineOpenFileRef) => {
      openWorkSurfaceFromFileRef(
        surfaceRegistry,
        sessionCommands.openWorkSurfaceTab,
        info,
      )
    },
    [sessionCommands.openWorkSurfaceTab, surfaceRegistry],
  )

  useEffect(() => {
    if (!runtimeController || !bootReady) return
    runtimeController.setWorkSurfaceOpenListener(
      ({ taskId: openTaskId, payload }) => {
        if (openTaskId !== selectedTaskId) return
        openWorkSurfaceFromRuntimePayload(
          surfaceRegistry,
          sessionCommands.openWorkSurfaceTab,
          payload,
        )
      },
    )
    return () => {
      runtimeController.setWorkSurfaceOpenListener(null)
    }
  }, [
    bootReady,
    runtimeController,
    selectedTaskId,
    sessionCommands.openWorkSurfaceTab,
    surfaceRegistry,
  ])

  return {
    surfaceRegistry,
    workSurfaceEmptyExtra,
    workSurfaceToolbarTrailing,
    onOpenFileRef,
  }
}
