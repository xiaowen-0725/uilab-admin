/**
 * Capability Surface controller — caches snapshot, exposes selection/startAuth.
 * Composition mounts one instance; UI binds via subscribe/getSnapshot.
 */
import {
  emptyTaskCapabilitySelection,
  toggleConnectorSelection,
} from '../model/task-selection'
import type {
  CapabilitySnapshot,
  CapabilityAuthRefreshResult,
  CapabilitySnapshotPort,
  StartAuthResult,
  TaskCapabilitySelection,
} from '../ports/capability-snapshot-port'

export type CapabilityController = {
  getCached(): CapabilitySnapshot | null
  refresh(taskId?: string | null): Promise<CapabilitySnapshot>
  setSelection(
    taskId: string,
    selection: Partial<TaskCapabilitySelection>
  ): Promise<CapabilitySnapshot>
  toggleConnector(
    taskId: string,
    connectorId: string,
    selected: boolean
  ): Promise<CapabilitySnapshot>
  startAuth(
    connectorId: string,
    options?: { domains?: string[] }
  ): Promise<StartAuthResult>
  refreshAuth(
    taskId?: string | null,
    connectorId?: string
  ): Promise<CapabilityAuthRefreshResult>
  subscribe(listener: (snapshot: CapabilitySnapshot | null) => void): () => void
  dispose(): void
}

export function createCapabilityController(
  port: CapabilitySnapshotPort
): CapabilityController {
  let cache: CapabilitySnapshot | null = null
  const listeners = new Set<(snapshot: CapabilitySnapshot | null) => void>()
  let disposed = false

  const unsubPort = port.subscribe((snap) => {
    cache = snap
    for (const l of listeners) l(cache)
  })

  const emit = () => {
    for (const l of listeners) l(cache)
  }

  return {
    getCached() {
      return cache
    },

    async refresh(taskId) {
      const snap = await port.getSnapshot(taskId)
      cache = snap
      emit()
      return snap
    },

    async setSelection(taskId, selection) {
      const snap = await port.setSelection(taskId, selection)
      cache = snap
      emit()
      return snap
    },

    async toggleConnector(taskId, connectorId, selected) {
      const base =
        cache?.taskId === taskId
          ? cache.selection
          : emptyTaskCapabilitySelection()
      const next = toggleConnectorSelection(base, connectorId, selected)
      return this.setSelection(taskId, next)
    },

    async startAuth(connectorId, options) {
      return port.startAuth(connectorId, options)
    },

    async refreshAuth(taskId, connectorId) {
      const result = await port.refreshAuth(taskId, connectorId)
      cache = result.snapshot
      emit()
      return result
    },

    subscribe(listener) {
      listeners.add(listener)
      listener(cache)
      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      unsubPort()
      listeners.clear()
    },
  }
}
