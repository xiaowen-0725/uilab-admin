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
    workspaceHint: null,
    localFolderBound: false,
    pickerSupported,
    bindNotice: null,
  }
  const listeners = new Set<() => void>()

  function emit() {
    for (const l of listeners) l()
  }

  function setState(patch: Partial<WorkspaceDocumentSourceState>) {
    state = { ...state, ...patch }
    emit()
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
        workspaceHint: null,
        localFolderBound: false,
        bindNotice: null,
      })
    },
    mount() {
      if (options.runtimeMode !== 'voltagent') {
        return () => {}
      }
      let cancelled = false
      void d.fetchHint(options.voltAgentBaseUrl).then((hint) => {
        if (!cancelled && hint) {
          // Do not clobber a later local bind (voltagent never binds, but keep safe).
          if (!state.localFolderBound) {
            setState({ workspaceHint: hint })
          }
        }
      })
      return () => {
        cancelled = true
      }
    },
  }
}

/**
 * React binding for {@link createWorkspaceDocumentSourceController}.
 * Composition: pass runtimeMode + voltAgentBaseUrl only.
 */
export function useWorkspaceDocumentSource(
  options: UseWorkspaceDocumentSourceOptions,
): WorkspaceDocumentSource {
  const controller = useMemo(
    () =>
      createWorkspaceDocumentSourceController({
        runtimeMode: options.runtimeMode,
        voltAgentBaseUrl: options.voltAgentBaseUrl,
      }),
    [options.runtimeMode, options.voltAgentBaseUrl],
  )

  useEffect(() => controller.mount(), [controller])

  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  )

  return {
    runtimeMode: options.runtimeMode,
    content: snap.content,
    workspaceHint: snap.workspaceHint,
    localFolderBound: snap.localFolderBound,
    pickerSupported: snap.pickerSupported,
    bindNotice: snap.bindNotice,
    pickLocalFolder: controller.pickLocalFolder,
    clearLocalFolder: controller.clearLocalFolder,
  }
}
