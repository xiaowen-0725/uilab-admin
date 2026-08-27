/**
 * Composition Surface assembly — Registry factory + open channels.
 * Host never registers; Document/Browser/test register here only.
 */

import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import {
  deliverableBasename,
  isOpenableDeliverable,
  shouldRequestPaneOpenMotion,
  type OpenDeliverablesRequest,
  type TaskReadModel,
  type TaskRuntimeController,
  type TimelineOpenFileRef,
} from '@/modules/task'
import { useDeliverablePaneAutoOpen } from './deliverable-pane-auto-open'
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
  type BoardRefreshController,
  type BoardStorePort,
  type IdentityScopePort,
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
  refresh?: BoardRefreshController
  identityScope?: IdentityScopePort
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
          refresh={board.refresh}
          identityScope={board.identityScope}
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
  options?: {
    source?: 'user' | 'runtime'
    focus?: 'pane' | 'tab' | 'none'
  },
): boolean {
  const raw = (info.path ?? info.label ?? '').trim()
  if (!raw) return false
  const source = options?.source ?? 'user'
  const intent = resolveOpenWorkSurfaceIntent(registry, {
    resourceKey: raw,
    title: info.label,
    source,
    focus: options?.focus,
  })
  if (!intent.ok) return false
  openWorkSurfaceTab({
    source,
    kind: intent.kind,
    resourceKey: intent.resourceKey,
    title: intent.title,
    focus: options?.focus ?? intent.focus,
  })
  return true
}

/**
 * User clicked「查看所有产物」: open every openable file, activate the featured one.
 */
export function openWorkSurfaceFromDeliverables(
  registry: SurfaceRegistry,
  openWorkSurfaceTab: OpenWorkSurfaceTabCommand,
  request: OpenDeliverablesRequest,
): boolean {
  const openable = request.items.filter((item) => isOpenableDeliverable(item))
  if (openable.length === 0) return false
  const activatePath =
    request.activatePath &&
    openable.some((item) => item.path === request.activatePath)
      ? request.activatePath
      : openable[openable.length - 1]?.path

  let opened = false
  for (const item of openable) {
    if (item.path === activatePath) continue
    opened =
      openWorkSurfaceFromFileRef(
        registry,
        openWorkSurfaceTab,
        { path: item.path, label: deliverableBasename(item.path) },
        { source: 'user', focus: 'tab' },
      ) || opened
  }
  if (activatePath) {
    opened =
      openWorkSurfaceFromFileRef(
        registry,
        openWorkSurfaceTab,
        { path: activatePath, label: deliverableBasename(activatePath) },
        { source: 'user', focus: 'pane' },
      ) || opened
  }
  return opened
}

function requestPaneOpenMotionIfNeeded(
  didOpen: boolean,
  paneAlreadyVisible: boolean,
  request?: () => void,
): void {
  if (shouldRequestPaneOpenMotion(didOpen, paneAlreadyVisible)) {
    request?.()
  }
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
  readModel?: TaskReadModel | null
  workSurfaceVisible?: boolean
  onRequestPaneOpenMotion?: () => void
}

export interface WorkbenchSurfaceAssembly {
  surfaceRegistry: SurfaceRegistry
  workSurfaceEmptyExtra: ReactNode
  workSurfaceToolbarTrailing: ReactNode | undefined
  onOpenFileRef: (info: TimelineOpenFileRef) => void
  onOpenDeliverables: (request: OpenDeliverablesRequest) => void
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
    readModel = null,
    workSurfaceVisible = false,
    onRequestPaneOpenMotion,
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
      const opened = openWorkSurfaceFromFileRef(
        surfaceRegistry,
        sessionCommands.openWorkSurfaceTab,
        info,
      )
      requestPaneOpenMotionIfNeeded(
        opened,
        workSurfaceVisible,
        onRequestPaneOpenMotion,
      )
    },
    [
      onRequestPaneOpenMotion,
      sessionCommands.openWorkSurfaceTab,
      surfaceRegistry,
      workSurfaceVisible,
    ],
  )

  const onOpenDeliverableAuto = useCallback(
    (info: TimelineOpenFileRef) =>
      openWorkSurfaceFromFileRef(
        surfaceRegistry,
        sessionCommands.openWorkSurfaceTab,
        info,
        { source: 'runtime', focus: 'pane' },
      ),
    [sessionCommands.openWorkSurfaceTab, surfaceRegistry],
  )

  const onOpenDeliverables = useCallback(
    (request: OpenDeliverablesRequest) => {
      const opened = openWorkSurfaceFromDeliverables(
        surfaceRegistry,
        sessionCommands.openWorkSurfaceTab,
        request,
      )
      requestPaneOpenMotionIfNeeded(
        opened,
        workSurfaceVisible,
        onRequestPaneOpenMotion,
      )
    },
    [
      onRequestPaneOpenMotion,
      sessionCommands.openWorkSurfaceTab,
      surfaceRegistry,
      workSurfaceVisible,
    ],
  )

  useDeliverablePaneAutoOpen({
    taskId: selectedTaskId,
    readModel,
    workSurfaceVisible,
    onOpen: onOpenDeliverableAuto,
    onRequestOpenMotion: onRequestPaneOpenMotion,
  })

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
    onOpenDeliverables,
  }
}
