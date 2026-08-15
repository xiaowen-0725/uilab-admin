/**
 * In-memory TurnStatusIndex for Navigator busy indicators.
 * Not persisted (spec §9); refreshed turns start idle.
 */

import type { TurnStatus } from '../model/lifecycle'

export type TurnStatusIndexListener = () => void

const BUSY_STATUSES: ReadonlySet<TurnStatus> = new Set([
  'queued',
  'running',
  'cancelling',
])

export function isNavigatorBusyStatus(status: TurnStatus | null | undefined): boolean {
  if (!status) return false
  return BUSY_STATUSES.has(status)
}

/**
 * Tracks turnStatus per taskId for Navigator spinner (including non-selected tasks).
 */
export class TurnStatusIndex {
  private readonly byTask = new Map<string, TurnStatus | null>()
  private readonly listeners = new Set<TurnStatusIndexListener>()
  /** Monotonic revision for useSyncExternalStore stable getSnapshot. */
  private revision = 0
  private cachedBusyIds: ReadonlySet<string> = new Set()

  subscribe(listener: TurnStatusIndexListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getRevision(): number {
    return this.revision
  }

  set(taskId: string, status: TurnStatus | null): void {
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

  get(taskId: string): TurnStatus | null {
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
  snapshot(): ReadonlyMap<string, TurnStatus | null> {
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

export function createTurnStatusIndex(): TurnStatusIndex {
  return new TurnStatusIndex()
}
