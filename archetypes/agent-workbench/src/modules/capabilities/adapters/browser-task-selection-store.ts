import {
  emptyTaskCapabilitySelection,
  mergeTaskCapabilitySelection,
  type TaskCapabilitySelectionStore,
} from '../model/task-selection'
import type { TaskCapabilitySelection } from '../ports/capability-snapshot-port'

const DEFAULT_STORAGE_KEY = 'uilab.agent-workbench.capability-selection.v1'

type PersistedSelections = Record<string, TaskCapabilitySelection>

export function createBrowserTaskCapabilitySelectionStore(options?: {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  storageKey?: string
}): TaskCapabilitySelectionStore {
  const storage =
    options && 'storage' in options ? options.storage : resolveBrowserStorage()
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY

  const read = (): PersistedSelections => {
    if (!storage) return {}
    try {
      const raw = storage.getItem(storageKey)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {}
      }
      const result: PersistedSelections = {}
      for (const [taskId, value] of Object.entries(parsed)) {
        if (!taskId.trim() || !value || typeof value !== 'object') continue
        const candidate = value as Partial<TaskCapabilitySelection>
        result[taskId] = mergeTaskCapabilitySelection(
          emptyTaskCapabilitySelection(),
          {
            connectorIds: Array.isArray(candidate.connectorIds)
              ? candidate.connectorIds.filter(
                  (item): item is string => typeof item === 'string'
                )
              : [],
            skillIds: Array.isArray(candidate.skillIds)
              ? candidate.skillIds.filter(
                  (item): item is string => typeof item === 'string'
                )
              : [],
            expertId:
              typeof candidate.expertId === 'string'
                ? candidate.expertId
                : null,
          }
        )
      }
      return result
    } catch {
      return {}
    }
  }

  const write = (selections: PersistedSelections): boolean => {
    if (!storage) return false
    try {
      storage.setItem(storageKey, JSON.stringify(selections))
      return true
    } catch {
      return false
    }
  }

  return {
    get(taskId) {
      const selection = read()[taskId]
      return selection
        ? mergeTaskCapabilitySelection(
            emptyTaskCapabilitySelection(),
            selection
          )
        : null
    },
    set(taskId, selection) {
      const id = taskId.trim()
      if (!id) return false
      const selections = read()
      selections[id] = mergeTaskCapabilitySelection(
        emptyTaskCapabilitySelection(),
        selection
      )
      return write(selections)
    },
    clear(taskId) {
      const selections = read()
      delete selections[taskId]
      return write(selections)
    },
  }
}

function resolveBrowserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof globalThis.localStorage === 'undefined'
      ? null
      : globalThis.localStorage
  } catch {
    return null
  }
}
