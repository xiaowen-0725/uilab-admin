import { useEffect, useRef } from 'react'
import {
  deliverableBasename,
  deliverableCompletionKey,
  featuredDeliverable,
  isNonTerminalTurnStatus,
  lastCompletedTurnId,
  shouldAutoOpenDeliverablePane,
  shouldRequestPaneOpenMotion,
  type TaskReadModel,
  type TimelineOpenFileRef,
} from '@/modules/task'

export type DeliverableAutoOpenOptions = {
  taskId: string | null
  readModel: TaskReadModel | null
  workSurfaceVisible: boolean
  onOpen: (info: TimelineOpenFileRef) => boolean
  onRequestOpenMotion?: () => void
}

/**
 * Auto-open the featured deliverable when this session first sees the turn finish.
 * Hydrated / replayed completions never open. Closing the pane this turn blocks reopen.
 */
export function useDeliverablePaneAutoOpen(
  options: DeliverableAutoOpenOptions,
): void {
  const { taskId, readModel, workSurfaceVisible, onOpen, onRequestOpenMotion } =
    options
  const observedActiveRef = useRef(new Set<string>())
  const openedRef = useRef(new Set<string>())
  const dismissedRef = useRef(new Set<string>())
  const prevVisibleRef = useRef(workSurfaceVisible)

  const completedTurnId = readModel
    ? lastCompletedTurnId(readModel)
    : null
  const currentTurnId = readModel?.activeTurnId ?? completedTurnId
  const featured = readModel
    ? featuredDeliverable(readModel.deliverables)
    : null

  useEffect(() => {
    if (!taskId || !currentTurnId) return
    if (isNonTerminalTurnStatus(readModel?.turnStatus ?? null)) {
      observedActiveRef.current.add(
        deliverableCompletionKey(taskId, currentTurnId),
      )
    }
  }, [taskId, currentTurnId, readModel?.turnStatus])

  useEffect(() => {
    const wasVisible = prevVisibleRef.current
    prevVisibleRef.current = workSurfaceVisible
    if (wasVisible && !workSurfaceVisible && taskId && currentTurnId) {
      dismissedRef.current.add(deliverableCompletionKey(taskId, currentTurnId))
    }
  }, [workSurfaceVisible, taskId, currentTurnId])

  useEffect(() => {
    if (!taskId || !completedTurnId || !featured?.path) return
    const featuredPath = featured.path
    const key = deliverableCompletionKey(taskId, completedTurnId)
    const shouldOpen = shouldAutoOpenDeliverablePane({
      completionKey: key,
      featuredPath,
      observedActive: observedActiveRef.current.has(key),
      alreadyOpened: openedRef.current.has(key),
      dismissed: dismissedRef.current.has(key),
    })
    if (!shouldOpen) return
    openedRef.current.add(key)
    const opened = onOpen({
      path: featuredPath,
      label: deliverableBasename(featuredPath),
    })
    if (shouldRequestPaneOpenMotion(opened, workSurfaceVisible)) {
      onRequestOpenMotion?.()
    }
  }, [
    taskId,
    completedTurnId,
    featured?.path,
    onOpen,
    onRequestOpenMotion,
    workSurfaceVisible,
  ])
}
