/**
 * Unified IndexedDB schema for Project catalog + EventStore.
 * ADR 0015 / real-task-lifecycle-spec §4.
 *
 * Composition opens one handle; adapters consume stores via the shell.
 */

export const WORKBENCH_IDB_NAME = 'uilab-agent-workbench'
/** Schema algebra — bump only on structure migrations. */
export const WORKBENCH_IDB_VERSION = 2

export const STORE_PROJECTS = 'projects'
export const STORE_TASKS = 'tasks'
export const STORE_EVENTS = 'events'
export const STORE_SNAPSHOTS = 'snapshots'
export const STORE_COMMANDS = 'commands'
export const STORE_SESSION = 'session'
export const STORE_METADATA = 'metadata'

export const SESSION_ROW_ID = 'current'

export type WorkbenchStoreName =
  | typeof STORE_PROJECTS
  | typeof STORE_TASKS
  | typeof STORE_EVENTS
  | typeof STORE_SNAPSHOTS
  | typeof STORE_COMMANDS
  | typeof STORE_SESSION
  | typeof STORE_METADATA

export const ALL_STORE_NAMES: readonly WorkbenchStoreName[] = [
  STORE_PROJECTS,
  STORE_TASKS,
  STORE_EVENTS,
  STORE_SNAPSHOTS,
  STORE_COMMANDS,
  STORE_SESSION,
  STORE_METADATA,
]

/** Session pointer row persisted in `session` store. */
export interface SessionPointerRecord {
  id: typeof SESSION_ROW_ID
  selectedProjectId: string | null
  selectedTaskId: string | null
  lastTaskByProject: Record<string, string | null>
  /** Serialized per-task layout map (optional restore). */
  taskLayoutsJson?: string
  navigatorOpen?: boolean
  updatedAt: string
}

export interface MetadataRecord {
  key: string
  value: unknown
}

function createWorkbenchStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
    db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains(STORE_TASKS)) {
    const tasks = db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
    tasks.createIndex('projectId', 'projectId', { unique: false })
  }
  if (!db.objectStoreNames.contains(STORE_EVENTS)) {
    const events = db.createObjectStore(STORE_EVENTS, {
      keyPath: ['taskId', 'taskSequence'],
    })
    events.createIndex('eventId', 'eventId', { unique: true })
    events.createIndex('taskId', 'taskId', { unique: false })
  }
  if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
    db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'taskId' })
  }
  if (!db.objectStoreNames.contains(STORE_COMMANDS)) {
    db.createObjectStore(STORE_COMMANDS, { keyPath: 'commandId' })
  }
  if (!db.objectStoreNames.contains(STORE_SESSION)) {
    db.createObjectStore(STORE_SESSION, { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains(STORE_METADATA)) {
    db.createObjectStore(STORE_METADATA, { keyPath: 'key' })
  }
}

/**
 * Schema upgrades. Version 2 drops local v1 event protocol data (wipe + recreate).
 * Called only from the shared shell's onupgradeneeded.
 */
export function upgradeWorkbenchIdb(
  db: IDBDatabase,
  oldVersion: number,
  _newVersion: number | null,
): void {
  if (oldVersion < 1) {
    createWorkbenchStores(db)
    return
  }

  if (oldVersion < 2) {
    for (const name of Array.from(db.objectStoreNames)) {
      db.deleteObjectStore(name)
    }
    createWorkbenchStores(db)
  }
}
