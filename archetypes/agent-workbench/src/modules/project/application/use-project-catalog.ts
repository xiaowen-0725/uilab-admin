import { useCallback, useSyncExternalStore } from 'react'
import type { ProjectCatalogController } from './project-catalog-controller'
import type { ProjectCatalogView } from './project-catalog-controller'

const EMPTY_VIEW: ProjectCatalogView = {
  projects: [],
  tasks: [],
  ready: false,
  error: null,
}

/**
 * React binding for ProjectCatalogController.
 * Subscribes via revision number (stable primitive snapshot).
 */
export function useProjectCatalog(
  controller: ProjectCatalogController | null,
): ProjectCatalogView {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!controller) return () => {}
      return controller.subscribe(onStoreChange)
    },
    [controller],
  )

  const getRevision = useCallback(
    () => controller?.getRevision() ?? 0,
    [controller],
  )

  useSyncExternalStore(subscribe, getRevision, () => 0)

  return controller?.getView() ?? EMPTY_VIEW
}
