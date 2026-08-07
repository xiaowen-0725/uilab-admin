/**
 * In-memory RunStatusIndex for Navigator busy indicators.
 * Not persisted (spec §9); refreshed runs start idle.
 */

import type { RunStatus } from '../model/lifecycle'

export type RunStatusIndexListener = () => void

const BUSY_STATUSES: ReadonlySet<RunStatus> = new Set([
  'queued',
  'running',
  'cancelling',
])

export function isNavigatorBusyStatus(status: RunStatus | null | undefined): boolean {
  if (!status) return false
  return BUSY_STATUSES.has(status)
}

/**
 * Tracks runStatus per taskId for Navigator spinner (including non-selected tasks).
 */
export class RunStatusIndex {
  private readonly byTask = new Map<string, RunStatus | null>()
  private readonly listeners = new Set<RunStatusIndexListener>()
  /** Monotonic revision for useSyncExternalStore stable getSnapshot. */
  private revision = 0
  private cachedBusyIds: ReadonlySet<string> = new Set()

  subscribe(listener: RunStatusIndexListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getRevision(): number {
    return this.revision
  }

  set(taskId: string, status: RunStatus | null): void {
    const prev = this.byTask.get(taskId) ?? null
    if (prev === status) return
    if (status == null) {
      this.byTask.delete(taskId)
    } else {
      this.byTask.set(taskId, status)
    }
    this.rebuildBusyCache()
    this.revision += 1
    this.emit()
  }

  get(taskId: string): RunStatus | null {
    return this.byTask.get(taskId) ?? null
  }

  isBusy(taskId: string): boolean {
    return isNavigatorBusyStatus(this.get(taskId))
  }

  /** Stable busy set for React (same ref until mutation). */
  getBusyTaskIds(): ReadonlySet<string> {
    return this.cachedBusyIds
  }

  /** Snapshot map for debugging. */
  snapshot(): ReadonlyMap<string, RunStatus | null> {
    return new Map(this.byTask)
  }

  clear(taskId: string): void {
    if (!this.byTask.has(taskId)) return
    this.byTask.delete(taskId)
    this.rebuildBusyCache()
    this.revision += 1
    this.emit()
  }

  private rebuildBusyCache(): void {
    const next = new Set<string>()
    for (const [id, status] of this.byTask) {
      if (isNavigatorBusyStatus(status)) next.add(id)
    }
    this.cachedBusyIds = next
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function createRunStatusIndex(): RunStatusIndex {
  return new RunStatusIndex()
}
