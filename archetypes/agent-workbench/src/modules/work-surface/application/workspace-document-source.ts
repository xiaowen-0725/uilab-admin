/**
 * Workspace Document content source — owns Port selection, local folder bind
 * (Fake path), and voltagent sidecar hint. Composition only chooses runtimeMode.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  createFsAccessDocumentContent,
  fsAccessWorkspaceHint,
  isFsAccessDirectoryPickerSupported,
  pickWorkspaceDirectory,
  type PickWorkspaceDirectoryResult,
} from '../adapters/fs-access-document-content'
import {
  createHttpWorkspaceDocumentContent,
  fetchWorkspaceHint,
} from '../adapters/http-workspace-document-content'
import { createMemoryDocumentContent } from '../adapters/memory-document-content'
import type { DocumentContentPort } from '../ports/document-content-port'

export type WorkspaceDocumentRuntimeMode = 'fake' | 'voltagent'

export type UseWorkspaceDocumentSourceOptions = {
  runtimeMode: WorkspaceDocumentRuntimeMode
  /** Used when runtimeMode === 'voltagent' */
  voltAgentBaseUrl: string
  /**
   * Desktop: selected Project `localRoot`. Wins over the one-shot sidecar
   * `/workspace/info` fetch so Host project switches stay honest.
   */
  preferredHint?: string | null
}

export type WorkspaceDocumentSource = {
  /** Echo of options so UI does not re-branch on Composition env. */
  runtimeMode: WorkspaceDocumentRuntimeMode
  content: DocumentContentPort
  workspaceHint: string | null
  localFolderBound: boolean
  /** Fake path: whether showDirectoryPicker is available (UI must not re-probe). */
  pickerSupported: boolean
  /** notice after failed pick etc. */
  bindNotice: string | null
  pickLocalFolder: () => Promise<void>
  clearLocalFolder: () => void
}

/** Snapshot for pure controller / tests. */
export type WorkspaceDocumentSourceState = {
  content: DocumentContentPort
  workspaceHint: string | null
  localFolderBound: boolean
  pickerSupported: boolean
  bindNotice: string | null
}

export type WorkspaceDocumentSourceDeps = {
  createMemory: () => DocumentContentPort
  createHttp: (baseUrl: string) => DocumentContentPort
  createFs: (root: FileSystemDirectoryHandle) => DocumentContentPort
  fsHint: (handle: FileSystemDirectoryHandle) => string
  fetchHint: (baseUrl: string) => Promise<string | null>
  pickDirectory: () => Promise<PickWorkspaceDirectoryResult>
  isPickerSupported: () => boolean
}

const defaultDeps: WorkspaceDocumentSourceDeps = {
  createMemory: () => createMemoryDocumentContent(),
  createHttp: (baseUrl) => createHttpWorkspaceDocumentContent({ baseUrl }),
  createFs: (root) => createFsAccessDocumentContent({ root }),
  fsHint: (handle) => fsAccessWorkspaceHint(handle),
  fetchHint: (baseUrl) => fetchWorkspaceHint(baseUrl),
  pickDirectory: () => pickWorkspaceDirectory(),
  isPickerSupported: () => isFsAccessDirectoryPickerSupported(),
}

const VOLTAGENT_BIND_NOTICE =
  '当前使用侧车工作区（WORKSPACE_ROOT）。本地文件夹绑定仅在 Fake 路径可用。'

function createDefaultContent(
  options: UseWorkspaceDocumentSourceOptions,
  deps: WorkspaceDocumentSourceDeps,
): DocumentContentPort {
  if (options.runtimeMode === 'voltagent') {
    return deps.createHttp(options.voltAgentBaseUrl)
  }
  return deps.createMemory()
}

export type WorkspaceDocumentSourceController = {
  getState: () => WorkspaceDocumentSourceState
  subscribe: (listener: () => void) => () => void
  pickLocalFolder: () => Promise<void>
  clearLocalFolder: () => void
  /**
   * Prefer this label over sidecar fetch (Host Project root).
   * Pass null to fall back to `/workspace/info`.
   */
  setPreferredHint: (hint: string | null) => void
  /**
   * Mount side-effects (voltagent workspace hint fetch).
   * Returns cleanup; call once when the source is active.
   */
  mount: () => () => void
}

/**
 * Pure controller for workspace document Port + bind state.
 * Thin React hook wraps this with useSyncExternalStore.
 */
export function createWorkspaceDocumentSourceController(
  options: UseWorkspaceDocumentSourceOptions,
  deps: Partial<WorkspaceDocumentSourceDeps> = {},
): WorkspaceDocumentSourceController {
  const d: WorkspaceDocumentSourceDeps = { ...defaultDeps, ...deps }
  const defaultContent = createDefaultContent(options, d)
  const pickerSupported =
    options.runtimeMode === 'fake' && d.isPickerSupported()

  let state: WorkspaceDocumentSourceState = {
    content: defaultContent,
    workspaceHint: options.preferredHint?.trim() || null,
    localFolderBound: false,
    pickerSupported,
    bindNotice: null,
  }
  let preferredHint = options.preferredHint?.trim() || null
  const listeners = new Set<() => void>()

  function emit() {
    for (const l of listeners) l()
  }

  function setState(patch: Partial<WorkspaceDocumentSourceState>) {
    state = { ...state, ...patch }
    emit()
  }

  function applySidecarHint(hint: string | null) {
    if (!hint || state.localFolderBound || preferredHint) return
    setState({ workspaceHint: hint })
  }

  function refreshSidecarHint() {
    if (options.runtimeMode !== 'voltagent' || preferredHint) return
    void d.fetchHint(options.voltAgentBaseUrl).then((hint) => {
      applySidecarHint(hint)
    })
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async pickLocalFolder() {
      if (options.runtimeMode === 'voltagent') {
        setState({ bindNotice: VOLTAGENT_BIND_NOTICE })
        return
      }
      const result = await d.pickDirectory()
      if (!result.ok) {
        if (result.reason !== 'aborted') {
          setState({ bindNotice: result.message })
        }
        return
      }
      setState({
        content: d.createFs(result.handle),
        workspaceHint: d.fsHint(result.handle),
        localFolderBound: true,
        bindNotice: null,
      })
    },
    clearLocalFolder() {
      setState({
        content: createDefaultContent(options, d),
        workspaceHint: preferredHint,
        localFolderBound: false,
        bindNotice: null,
      })
    },
    setPreferredHint(hint: string | null) {
      preferredHint = hint?.trim() || null
      if (state.localFolderBound) return
      if (preferredHint) {
        setState({ workspaceHint: preferredHint })
        return
      }
      refreshSidecarHint()
    },
    mount() {
      if (options.runtimeMode !== 'voltagent') {
        return () => {}
      }
      let cancelled = false
      if (!preferredHint) {
        void d.fetchHint(options.voltAgentBaseUrl).then((hint) => {
          if (!cancelled) applySidecarHint(hint)
        })
      }
      return () => {
        cancelled = true
      }
    },
  }
}

/**
 * React binding for {@link createWorkspaceDocumentSourceController}.
 * Composition: pass runtimeMode + voltAgentBaseUrl; optional preferredHint
 * for the selected Project root.
 */
export function useWorkspaceDocumentSource(
  options: UseWorkspaceDocumentSourceOptions,
): WorkspaceDocumentSource {
  const controller = useMemo(
    () =>
      createWorkspaceDocumentSourceController({
        runtimeMode: options.runtimeMode,
        voltAgentBaseUrl: options.voltAgentBaseUrl,
        preferredHint: options.preferredHint,
      }),
    [options.runtimeMode, options.voltAgentBaseUrl],
  )

  useEffect(() => controller.mount(), [controller])
  useEffect(() => {
    controller.setPreferredHint(options.preferredHint ?? null)
  }, [controller, options.preferredHint])

  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  )

  return {
    runtimeMode: options.runtimeMode,
    ...snap,
    pickLocalFolder: controller.pickLocalFolder,
    clearLocalFolder: controller.clearLocalFolder,
  }
}
