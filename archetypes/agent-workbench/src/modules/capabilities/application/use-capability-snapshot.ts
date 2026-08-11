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
  const normalizedTaskId = taskId?.trim() || null
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (!controller) return () => {}
      return controller.subscribe(() => onStoreChange())
    },
    () => controller?.getCached() ?? null,
    () => controller?.getCached() ?? null
  )

  useEffect(() => {
    if (!controller) return
    void controller.refresh(normalizedTaskId).catch(() => {
      // Sidecar may be down; Fake always succeeds.
    })
  }, [controller, normalizedTaskId])

  if (snapshot?.taskId !== normalizedTaskId) return null
  return snapshot
}

export function useCapabilitySnapshotError(
  controller: CapabilityController | null | undefined,
  taskId: string | null | undefined
): CapabilityControllerError | null {
  const normalizedTaskId = taskId?.trim() || null
  const error = useSyncExternalStore(
    (onStoreChange) =>
      controller?.subscribe(() => onStoreChange()) ?? (() => {}),
    () => controller?.getError() ?? null,
    () => controller?.getError() ?? null
  )
  return error?.taskId === normalizedTaskId ? error : null
}
