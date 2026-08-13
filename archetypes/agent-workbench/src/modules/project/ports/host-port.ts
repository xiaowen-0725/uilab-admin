/**
 * HostPort — Desktop Host seam for Projects Home, directory pick, and sidecar lifecycle.
 * Owned by Project Module; Composition injects the adapter.
 * Renderer never imports electron or Node built-ins.
 * IPC wire types live in host-wire.ts (shared with Desktop).
 */

import type {
  HostRuntimeStatus,
  HostStartRuntimeResult,
  PickDirectoryResult,
  WorkbenchHostBridge,
} from './host-wire'

export type {
  HostCreateProjectDirectoryInput,
  HostIpcChannel,
  HostProjectsHomePayload,
  HostRuntimeStatus,
  HostStartRuntimeResult,
  PickDirectoryResult,
  WorkbenchHostBridge,
} from './host-wire'
export { HOST_IPC } from './host-wire'

export interface HostPort {
  /** Host 是否可用（Electron 桥存在）。false = Web/测试降级 */
  isAvailable(): boolean
  /** 弹系统目录选择框。用户取消返回 { canceled: true } */
  pickDirectory(): Promise<PickDirectoryResult>
  /** 解析并确保 Projects Home 存在，返回绝对路径 */
  ensureProjectsHome(): Promise<string>
  /** 在 Projects Home 下创建唯一子目录，返回绝对路径 */
  createProjectDirectory(preferredName: string): Promise<string>
  /** 以指定根（重）启动侧车并等待健康 */
  startRuntime(workspaceRoot: string): Promise<HostStartRuntimeResult>
  stopRuntime(): Promise<void>
  getRuntimeStatus(): Promise<HostRuntimeStatus>
}

export const HOST_UNAVAILABLE_MESSAGE =
  '当前环境没有桌面宿主，无法打开或创建本地项目文件夹'

export class HostUnavailableError extends Error {
  readonly code = 'host_unavailable' as const

  constructor(message: string = HOST_UNAVAILABLE_MESSAGE) {
    super(message)
    this.name = 'HostUnavailableError'
  }
}

export function isHostUnavailableError(
  error: unknown,
): error is HostUnavailableError {
  return error instanceof HostUnavailableError
}

declare global {
  interface Window {
    __workbenchHost?: WorkbenchHostBridge
  }
}
