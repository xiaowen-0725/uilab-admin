/**
 * Subscribe CapabilityController for the selected Task.
 */

import { useEffect, useSyncExternalStore } from 'react'
import type { CapabilityController } from './capability-controller'
import type { CapabilitySnapshot } from '../ports/capability-snapshot-port'

export function useCapabilitySnapshot(
  controller: CapabilityController | null | undefined,
  taskId: string | null | undefined,
): CapabilitySnapshot | null {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (!controller) return () => {}
      return controller.subscribe(() => onStoreChange())
    },
    () => controller?.getCached() ?? null,
    () => controller?.getCached() ?? null,
  )

  useEffect(() => {
    if (!controller || !taskId) return
    void controller.refresh(taskId).catch(() => {
      // Sidecar may be down; Fake always succeeds.
    })
  }, [controller, taskId])

  if (!taskId || snapshot?.taskId !== taskId) return null
  return snapshot
}
