/**
 * HTTP CapabilitySnapshotPort — local VoltAgent sidecar client (browser-safe).
 * Never stores tokens; only status-safe snapshot fields + Provider authorization URLs.
 */
import { emptyTaskCapabilitySelection } from '../model/task-selection'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotPort,
  CapabilitySnapshotListener,
  CapabilityAuthRevokeResult,
  CapabilityAuthRefreshResult,
  StartAuthResult,
} from '../ports/capability-snapshot-port'

export type HttpCapabilitySnapshotPortOptions = {
  baseUrl: string
  fetchImpl?: typeof fetch
}

export function createHttpCapabilitySnapshotPort(
  options: HttpCapabilitySnapshotPortOptions
): CapabilitySnapshotPort {
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
  const listeners = new Set<CapabilitySnapshotListener>()
  let cache: CapabilitySnapshot | null = null

  const notify = (snap: CapabilitySnapshot) => {
    cache = snap
    for (const l of listeners) l(snap)
  }

  async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `Capability API ${res.status}: ${text.slice(0, 200) || res.statusText}`
      )
    }
    return (await res.json()) as T
  }

  return {
    async getSnapshot(taskId) {
      const q =
        taskId && taskId.trim()
          ? `?taskId=${encodeURIComponent(taskId.trim())}`
          : ''
      const snap = await getJson<CapabilitySnapshot>(`/capability/snapshot${q}`)
      notify(snap)
      return snap
    },

    async setSelection(taskId, selection) {
      const body = {
        taskId,
        selection,
        active: true,
      }
      const res = await getJson<{ ok: boolean; snapshot: CapabilitySnapshot }>(
        '/capability/selection',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      )
      notify(res.snapshot)
      return res.snapshot
    },

    async startAuth(connectorId, options) {
      const result = await getJson<StartAuthResult>('/capability/auth/start', {
        method: 'POST',
        body: JSON.stringify({
          connectorId,
          domains: options?.domains,
        }),
      })
      return result
    },

    async refreshAuth(taskId, connectorId) {
      const res = await getJson<{ ok: boolean } & CapabilityAuthRefreshResult>(
        '/capability/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify({
            taskId: taskId ?? null,
            connectorId,
          }),
        }
      )
      notify(res.snapshot)
      return {
        snapshot: res.snapshot,
        transitions: res.transitions ?? [],
      }
    },

    async revokeAuth(taskId, connectorId) {
      const res = await getJson<{ ok: boolean } & CapabilityAuthRevokeResult>(
        '/capability/auth/revoke',
        {
          method: 'POST',
          body: JSON.stringify({
            taskId: taskId ?? null,
            connectorId,
          }),
        }
      )
      notify(res.snapshot)
      return {
        snapshot: res.snapshot,
        connectorId: res.connectorId,
        message: res.message,
        needsSidecarRestart: res.needsSidecarRestart,
      }
    },

    subscribe(listener) {
      listeners.add(listener)
      if (cache) listener(cache)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Test helper: empty local selection when HTTP unavailable. */
export function offlineCapabilitySnapshot(
  taskId: string | null = null
): CapabilitySnapshot {
  return {
    version: 0,
    generatedAt: new Date().toISOString(),
    taskId,
    honesty: {
      runtime: 'local-sidecar',
      authBoundary: 'provider_declared',
      note: '侧车不可用；无 snapshot。',
    },
    connectors: [],
    skills: [],
    experts: [],
    selection: emptyTaskCapabilitySelection(),
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  }
}
