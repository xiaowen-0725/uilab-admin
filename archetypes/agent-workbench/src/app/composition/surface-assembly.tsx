/**
 * Composition Surface assembly — Registry factory + open channels.
 * Host never registers; Document/Browser/test/interactive register here only.
 */

import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import {
  deliverableCoverageKey,
  deliverableOpenRef,
  isInteractiveArtifactKind,
  isOpenableDeliverable,
  shouldRequestPaneOpenMotion,
  type DeliverableRef,
  type OpenDeliverablesRequest,
  type TaskReadModel,
  type TaskRuntimeController,
  type TimelineOpenFileRef,
} from '@/modules/task'
import { useDeliverablePaneAutoOpen } from './deliverable-pane-auto-open'
import {
  createBrowserSurfaceDefinition,
  createDocumentSurfaceDefinition,
  createInteractiveSurfaceDefinition,
  createSurfaceRegistry,
  createTestSurfaceDefinition,
  createWebBrowserHostPort,
  resolveOpenWorkSurfaceIntent,
  WorkspaceDocumentEmptyExtra,
  WorkspaceDocumentToolbarTrailing,
  type DocumentContentPort,
  type CreateInteractiveSurfaceOptions,
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

export type InteractiveSurfaceWiring = CreateInteractiveSurfaceOptions

export function createWorkbenchSurfaceRegistry(
  documentContent: DocumentContentPort,
  workspaceHint: string | null = null,
  board?: BoardSurfaceWiring,
  interactive?: InteractiveSurfaceWiring,
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
  if (interactive) {
    registry.register(createInteractiveSurfaceDefinition(interactive))
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
    kind: isInteractiveArtifactKind(info.kind) ? info.kind : undefined,
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

function resolveActivateCoverageKey(
  items: readonly DeliverableRef[],
  requested: string | undefined,
): string | undefined {
  if (requested) {
    for (const item of items) {
      if (deliverableCoverageKey(item) === requested) return requested
    }
  }
  const last = items[items.length - 1]
  return last ? deliverableCoverageKey(last) : undefined
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
  const activateKey = resolveActivateCoverageKey(openable, request.activatePath)

  function openOne(item: DeliverableRef, focus: 'pane' | 'tab'): boolean {
    const ref = deliverableOpenRef(item)
    if (!ref) return false
    return openWorkSurfaceFromFileRef(registry, openWorkSurfaceTab, ref, {
      source: 'user',
      focus,
    })
  }

  let opened = false
  for (const item of openable) {
    if (deliverableCoverageKey(item) === activateKey) continue
    opened = openOne(item, 'tab') || opened
  }
  const activateItem = openable.find(
    (item) => deliverableCoverageKey(item) === activateKey,
  )
  if (activateItem) opened = openOne(activateItem, 'pane') || opened
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
  interactive?: InteractiveSurfaceWiring
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
    interactive,
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
        interactive,
      ),
    [board, documentContent, documentWorkspaceHint, interactive],
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
