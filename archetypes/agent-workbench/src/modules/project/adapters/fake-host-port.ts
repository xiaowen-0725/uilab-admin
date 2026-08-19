/**
 * In-memory HostPort for command-face tests.
 * Virtual directory set + call log; no Node fs.
 */

import {
  HostUnavailableError,
  type HostPort,
  type HostRuntimeStatus,
  type PickDirectoryResult,
} from '../ports/host-port'
import {
  normalizeLocalRoot,
  uniqueChildDirectoryName,
} from '../application/local-root-path'

export type HostPortCall = {
  method: string
  args: unknown[]
}

export interface FakeHostPortOptions {
  available?: boolean
  projectsHome?: string
  pickResult?: PickDirectoryResult
  startDelayMs?: number
  baseUrl?: string
  existingDirectories?: readonly string[]
}

export interface FakeHostPort extends HostPort {
  readonly calls: readonly HostPortCall[]
  readonly directories: ReadonlySet<string>
  setPickResult(result: PickDirectoryResult): void
  setStartDelayMs(ms: number): void
  setRuntimeStatus(status: HostRuntimeStatus): void
  emitBoardRefreshWake(): void
}

export function createFakeHostPort(
  options: FakeHostPortOptions = {},
): FakeHostPort {
  const available = options.available !== false
  const projectsHome = normalizeLocalRoot(
    options.projectsHome ?? '/virtual/AgentWorkbench',
  )
  const directories = new Set<string>([
    projectsHome,
    ...(options.existingDirectories ?? []).map((dir) => normalizeLocalRoot(dir)),
  ])
  const calls: HostPortCall[] = []
  const wakeListeners = new Set<() => void>()
  let pickResult: PickDirectoryResult = options.pickResult ?? {
    canceled: true,
  }
  let startDelayMs = options.startDelayMs ?? 0
  let runtimeStatus: HostRuntimeStatus = 'stopped'
  const baseUrl = options.baseUrl ?? 'http://127.0.0.1:3141'

  function record(method: string, args: unknown[]): void {
    calls.push({ method, args })
  }

  function requireAvailable(): void {
    if (!available) throw new HostUnavailableError()
  }

  const port: FakeHostPort = {
    get calls() {
      return calls
    },
    get directories() {
      return directories
    },
    setPickResult(result) {
      pickResult = result
    },
    setStartDelayMs(ms) {
      startDelayMs = ms
    },
    setRuntimeStatus(status) {
      runtimeStatus = status
    },
    emitBoardRefreshWake() {
      record('emitBoardRefreshWake', [])
      for (const listener of [...wakeListeners]) listener()
    },
    isAvailable() {
      return available
    },
    async pickDirectory() {
      record('pickDirectory', [])
      requireAvailable()
      return pickResult
    },
    async ensureProjectsHome() {
      record('ensureProjectsHome', [])
      requireAvailable()
      directories.add(projectsHome)
      return projectsHome
    },
    async createProjectDirectory(preferredName: string) {
      record('createProjectDirectory', [preferredName])
      requireAvailable()
      directories.add(projectsHome)
      const prefix = `${projectsHome}/`
      const existingNames = [...directories]
        .filter((dir) => dir.startsWith(prefix) && dir !== projectsHome)
        .map((dir) => dir.slice(prefix.length).split('/')[0] ?? dir)
      const unique = uniqueChildDirectoryName(preferredName, existingNames)
      const created = `${projectsHome}/${unique}`
      directories.add(created)
      return created
    },
    async startRuntime(workspaceRoot: string) {
      const root = normalizeLocalRoot(workspaceRoot)
      record('startRuntime', [root])
      requireAvailable()
      runtimeStatus = 'starting'
      if (startDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, startDelayMs))
      }
      runtimeStatus = 'ready'
      return { baseUrl }
    },
    async stopRuntime() {
      record('stopRuntime', [])
      requireAvailable()
      runtimeStatus = 'stopped'
    },
    async getRuntimeStatus() {
      record('getRuntimeStatus', [])
      if (!available) return 'error'
      return runtimeStatus
    },
    subscribeBoardRefreshWake(listener) {
      record('subscribeBoardRefreshWake', [])
      wakeListeners.add(listener)
      return () => {
        wakeListeners.delete(listener)
      }
    },
  }

  return port
}
