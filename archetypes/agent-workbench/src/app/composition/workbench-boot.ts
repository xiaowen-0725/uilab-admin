/**
 * Workbench Boot unit — open store, hydrate catalog, resolve session pointers.
 * Composition Root consumes results; does not own product Shell chrome.
 */

import { useEffect, useRef, useState } from 'react'
import {
  getSessionPointer,
  openWorkbenchIdb,
} from '@/app/persistence/workbench-idb'
import {
  createIdbProjectCatalog,
  createMemoryProjectCatalog,
  DEFAULT_PROJECT_ID,
  ProjectCatalogController,
} from '@/modules/project'
import type { EventStorePort } from '@/modules/task'
import {
  createIdbEventStore,
  createMemoryEventStore,
} from '@/modules/task'
export type WorkbenchPersistence = 'idb' | 'memory'

/** Initial selection pointers produced by cold-start hydrate. */
export type WorkbenchBootPointer = {
  selectedProjectId: string
  selectedTaskId: string | null
  lastTaskByProject?: Record<string, string | null>
  navigatorOpen?: boolean
}

export interface WorkbenchBootResult {
  catalogController: ProjectCatalogController
  eventStore: EventStorePort
  /** Non-null only on successful IDB open. */
  db: IDBDatabase | null
  pointer: WorkbenchBootPointer
  /**
   * Set when product path failed and degraded to Memory (honest banner).
   * Null on clean Memory or clean IDB boot.
   */
  error: string | null
}

export interface BootWorkbenchOptions {
  persistence: WorkbenchPersistence
  idbName?: string
  /** Return true to abort applying side effects after async gaps. */
  isCancelled?: () => boolean
}

const DEFAULT_POINTER: WorkbenchBootPointer = {
  selectedProjectId: DEFAULT_PROJECT_ID,
  selectedTaskId: null,
}

function memoryBoot(): WorkbenchBootResult {
  const catalog = createMemoryProjectCatalog()
  const controller = new ProjectCatalogController(catalog)
  return {
    catalogController: controller,
    eventStore: createMemoryEventStore(),
    db: null,
    pointer: { ...DEFAULT_POINTER },
    error: null,
  }
}

/**
 * Resolve session pointer against hydrated catalog (invalid / cross-project → null task).
 */
export function resolveBootPointer(
  controller: ProjectCatalogController,
  raw: {
    selectedProjectId?: string | null
    selectedTaskId?: string | null
    lastTaskByProject?: Record<string, string | null>
    navigatorOpen?: boolean
  } | null,
): WorkbenchBootPointer {
  const projects = controller.getView().projects
  const projectId =
    raw?.selectedProjectId &&
    projects.some((p) => p.id === raw.selectedProjectId)
      ? raw.selectedProjectId
      : DEFAULT_PROJECT_ID

  controller.setFocusedProject(projectId)

  let selectedTaskId = raw?.selectedTaskId ?? null
  if (selectedTaskId && !controller.getTaskRow(selectedTaskId)) {
    selectedTaskId = null
  }
  if (
    selectedTaskId &&
    controller.getTaskRow(selectedTaskId)?.projectId !== projectId
  ) {
    selectedTaskId = null
  }

  return {
    selectedProjectId: projectId,
    selectedTaskId,
    lastTaskByProject: raw?.lastTaskByProject,
    navigatorOpen: raw?.navigatorOpen,
  }
}

/**
 * Pure-ish cold-start boot. Safe to unit-test with Memory; IDB path may degrade.
 */
export async function bootWorkbench(
  options: BootWorkbenchOptions,
): Promise<WorkbenchBootResult> {
  const { persistence, idbName, isCancelled } = options
  const cancelled = () => isCancelled?.() === true

  if (persistence === 'memory') {
    const result = memoryBoot()
    await result.catalogController.hydrate()
    if (cancelled()) {
      return result
    }
    return result
  }

  try {
    const database = await openWorkbenchIdb(
      idbName ? { name: idbName } : undefined,
    )
    if (cancelled()) {
      database.close()
      return memoryBoot()
    }

    const catalog = createIdbProjectCatalog(database)
    const controller = new ProjectCatalogController(catalog)
    const eventStore = createIdbEventStore(database)
    await controller.hydrate()
    if (cancelled()) {
      database.close()
      return memoryBoot()
    }

    const stored = await getSessionPointer(database)
    if (cancelled()) {
      database.close()
      return memoryBoot()
    }

    const pointer = resolveBootPointer(controller, stored)

    return {
      catalogController: controller,
      eventStore,
      db: database,
      pointer,
      error: null,
    }
  } catch (err) {
    if (cancelled()) {
      return memoryBoot()
    }
    // Degrade to memory so the shell still opens (D14 honesty).
    const result = memoryBoot()
    await result.catalogController.hydrate()
    return {
      ...result,
      error: err instanceof Error ? err.message : '无法初始化本地存储',
    }
  }
}

export interface UseWorkbenchBootOptions {
  persistence: WorkbenchPersistence
  idbName?: string
  onHydratePointers: (pointer: WorkbenchBootPointer) => void
}

export interface UseWorkbenchBootState {
  ready: boolean
  error: string | null
  db: IDBDatabase | null
  catalogController: ProjectCatalogController | null
  eventStore: EventStorePort | null
}

/**
 * React binding for cold-start boot. Hydrates session pointers once via callback.
 */
export function useWorkbenchBoot(
  options: UseWorkbenchBootOptions,
): UseWorkbenchBootState {
  const { persistence, idbName, onHydratePointers } = options
  const hydrateRef = useRef(onHydratePointers)
  hydrateRef.current = onHydratePointers

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [db, setDb] = useState<IDBDatabase | null>(null)
  const [catalogController, setCatalogController] =
    useState<ProjectCatalogController | null>(null)
  const [eventStore, setEventStore] = useState<EventStorePort | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const result = await bootWorkbench({
        persistence,
        idbName,
        isCancelled: () => cancelled,
      })
      if (cancelled) {
        result.db?.close()
        return
      }
      setDb(result.db)
      setCatalogController(result.catalogController)
      setEventStore(result.eventStore)
      setError(result.error)
      hydrateRef.current(result.pointer)
      setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [persistence, idbName])

  return {
    ready,
    error,
    db,
    catalogController,
    eventStore,
  }
}
