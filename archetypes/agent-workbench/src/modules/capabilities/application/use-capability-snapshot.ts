/**
 * Subscribe CapabilityController for the selected Task.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { CapabilitySnapshot } from '../ports/capability-snapshot-port'
import type { CapabilityController } from './capability-controller'
import type { CapabilityControllerError } from './capability-controller'

export function useCapabilitySnapshot(
  controller: CapabilityController | null | undefined,
  taskId: string | null | undefined
): CapabilitySnapshot | null {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (!controller) return () => {}
      return controller.subscribe(() => onStoreChange())
    },
    () => controller?.getCached() ?? null,
    () => controller?.getCached() ?? null
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

export function useCapabilitySnapshotError(
  controller: CapabilityController | null | undefined,
  taskId: string | null | undefined
): CapabilityControllerError | null {
  const error = useSyncExternalStore(
    (onStoreChange) =>
      controller?.subscribe(() => onStoreChange()) ?? (() => {}),
    () => controller?.getError() ?? null,
    () => controller?.getError() ?? null
  )
  return error?.taskId === taskId ? error : null
}
