/**
 * Capability Surface controller — caches snapshot, exposes selection/startAuth.
 * Composition mounts one instance; UI binds via subscribe/getSnapshot.
 */
import {
  emptyTaskCapabilitySelection,
  toggleConnectorSelection,
  type TaskCapabilitySelectionStore,
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
  getError(): CapabilityControllerError | null
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
  clearTask(taskId: string): void
  subscribe(listener: (snapshot: CapabilitySnapshot | null) => void): () => void
  dispose(): void
}

export type CapabilityControllerError = {
  taskId: string | null
  message: string
}

export function createCapabilityController(
  port: CapabilitySnapshotPort,
  options: { selectionStore?: TaskCapabilitySelectionStore } = {}
): CapabilityController {
  let cache: CapabilitySnapshot | null = null
  let error: CapabilityControllerError | null = null
  let activeTaskId: string | null = null
  let latestRefresh = 0
  const listeners = new Set<(snapshot: CapabilitySnapshot | null) => void>()
  let disposed = false

  const unsubPort = port.subscribe((snap) => {
    if (activeTaskId && snap.taskId !== activeTaskId) return
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

    getError() {
      return error
    },

    async refresh(taskId) {
      const id = taskId?.trim()
      activeTaskId = id || null
      const requestId = ++latestRefresh
      error = null
      emit()
      try {
        let snap = await port.getSnapshot(taskId)
        if (id && options.selectionStore) {
          const persisted = options.selectionStore.get(id)
          if (persisted && !sameSelection(persisted, snap.selection)) {
            snap = await port.setSelection(id, persisted)
          } else if (
            !persisted &&
            !options.selectionStore.set(id, snap.selection)
          ) {
            throw new Error(
              '当前 Task 选择无法写入浏览器存储，请检查存储权限后重试'
            )
          }
        }
        if (requestId !== latestRefresh) return snap
        cache = snap
        error = null
        emit()
        return snap
      } catch (cause) {
        if (requestId === latestRefresh) {
          error = {
            taskId: id || null,
            message:
              cause instanceof Error
                ? cause.message
                : '连接器状态加载失败，请重试',
          }
          emit()
        }
        throw cause
      }
    },

    async setSelection(taskId, selection) {
      activeTaskId = taskId
      const snap = await port.setSelection(taskId, selection)
      const persisted = options.selectionStore?.set(taskId, snap.selection)
      cache = snap
      error =
        persisted === false
          ? {
              taskId,
              message:
                '当前 Task 已启用，但浏览器持久化失败；刷新后可能丢失，请检查存储权限并重试',
            }
          : null
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
      if (!activeTaskId || result.snapshot.taskId === activeTaskId) {
        cache = result.snapshot
        error = null
        emit()
      }
      return result
    },

    clearTask(taskId) {
      options.selectionStore?.clear(taskId)
      if (cache?.taskId === taskId) cache = null
      if (error?.taskId === taskId) error = null
      emit()
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

function sameSelection(
  left: TaskCapabilitySelection,
  right: TaskCapabilitySelection
): boolean {
  return (
    left.expertId === right.expertId &&
    left.connectorIds.length === right.connectorIds.length &&
    left.connectorIds.every((id, index) => id === right.connectorIds[index]) &&
    left.skillIds.length === right.skillIds.length &&
    left.skillIds.every((id, index) => id === right.skillIds[index])
  )
}
