/**
 * In-memory Task capability selection + active task pointer (sidecar).
 * Workbench is source of truth for durable selection; sidecar holds a working copy
 * so effective tool gates can run without secrets.
 */

import type { TaskCapabilitySelection } from './types.js'

export const emptyTaskCapabilitySelection = (): TaskCapabilitySelection => ({
  connectorIds: [],
  skillIds: [],
  expertId: null,
})

export type CapabilitySelectionStore = {
  get(taskId: string): TaskCapabilitySelection
  set(taskId: string, selection: TaskCapabilitySelection): void
  clear(taskId: string): void
  getActiveTaskId(): string | null
  setActiveTaskId(taskId: string | null): void
  /** Snapshot of all known task selections (debug/tests). */
  list(): Array<{ taskId: string; selection: TaskCapabilitySelection }>
}

export function createCapabilitySelectionStore(): CapabilitySelectionStore {
  const byTask = new Map<string, TaskCapabilitySelection>()
  let activeTaskId: string | null = null

  return {
    get(taskId: string): TaskCapabilitySelection {
      const existing = byTask.get(taskId)
      if (existing) {
        return {
          connectorIds: [...existing.connectorIds],
          skillIds: [...existing.skillIds],
          expertId: existing.expertId,
        }
      }
      return emptyTaskCapabilitySelection()
    },
    set(taskId: string, selection: TaskCapabilitySelection): void {
      const id = taskId.trim()
      if (!id) return
      byTask.set(id, {
        connectorIds: uniqueStrings(selection.connectorIds),
        skillIds: uniqueStrings(selection.skillIds),
        expertId: selection.expertId?.trim() || null,
      })
    },
    clear(taskId: string): void {
      byTask.delete(taskId)
      if (activeTaskId === taskId) activeTaskId = null
    },
    getActiveTaskId(): string | null {
      return activeTaskId
    },
    setActiveTaskId(taskId: string | null): void {
      activeTaskId = taskId?.trim() || null
    },
    list() {
      return [...byTask.entries()].map(([taskId, selection]) => ({
        taskId,
        selection: {
          connectorIds: [...selection.connectorIds],
          skillIds: [...selection.skillIds],
          expertId: selection.expertId,
        },
      }))
    },
  }
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))].sort()
}

/** Process-wide default store used by CLI tool gate + HTTP handlers. */
let defaultStore: CapabilitySelectionStore | null = null

export function getDefaultCapabilitySelectionStore(): CapabilitySelectionStore {
  if (!defaultStore) defaultStore = createCapabilitySelectionStore()
  return defaultStore
}

/** Test helper — replace process-wide store. */
export function setDefaultCapabilitySelectionStore(
  store: CapabilitySelectionStore | null,
): void {
  defaultStore = store
}
