/**
 * Cross-process Host wire (Electron preload/main ↔ Renderer).
 * Framework-agnostic leaf: no React, no Node, no electron.
 * Owned by Project Module (HostPort consumer). Desktop and Renderer import this file.
 */

export type HostRuntimeStatus = 'stopped' | 'starting' | 'ready' | 'error'

export type PickDirectoryResult =
  | { path: string }
  | { canceled: true }

export type HostProjectsHomePayload = {
  projectsHomeDirName: string
  projectsHomeOverride?: string
}

export type HostCreateProjectDirectoryInput = HostProjectsHomePayload & {
  preferredName: string
}

export type HostStartRuntimeResult = {
  baseUrl: string
}

export const HOST_IPC = {
  pickDirectory: 'host:pickDirectory',
  ensureProjectsHome: 'host:ensureProjectsHome',
  createProjectDirectory: 'host:createProjectDirectory',
  startRuntime: 'host:startRuntime',
  stopRuntime: 'host:stopRuntime',
  getRuntimeStatus: 'host:getRuntimeStatus',
  boardRefreshWake: 'host:boardRefreshWake',
} as const

export type HostIpcChannel = (typeof HOST_IPC)[keyof typeof HOST_IPC]

/** Typed bridge exposed by Electron preload via contextBridge. */
export interface WorkbenchHostBridge {
  isAvailable(): boolean
  pickDirectory(): Promise<PickDirectoryResult>
  ensureProjectsHome(input: HostProjectsHomePayload): Promise<string>
  createProjectDirectory(input: HostCreateProjectDirectoryInput): Promise<string>
  startRuntime(workspaceRoot: string): Promise<HostStartRuntimeResult>
  stopRuntime(): Promise<void>
  getRuntimeStatus(): Promise<HostRuntimeStatus>
  /** Main → renderer poke. Host never fetches or writes IDB. */
  onBoardRefreshWake(listener: () => void): () => void
}
