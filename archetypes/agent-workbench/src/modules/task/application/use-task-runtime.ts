/**
 * Thin React adapter over TaskRuntimeController.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { RunStatus } from '../model/lifecycle'
import type {
  CommandAcknowledgement,
  TurnComposerContext,
} from '../protocol/commands'
import type { TaskReadModel } from '../projection/types'
import type { TimelineFollowMode } from '../projection/types'
import type { TaskRuntimeController } from './task-runtime-controller'

export interface UseTaskRuntimeResult {
  readModel: TaskReadModel
  busy: boolean
  notice: string | null
  runStatus: RunStatus | null
  submitText: (
    text: string,
    composerContext?: TurnComposerContext,
  ) => Promise<CommandAcknowledgement | null>
  cancelActiveRun: () => Promise<void>
  respondToApproval: (
    requestId: string,
    decision: 'approved' | 'rejected',
  ) => Promise<void>
  provideRunInput: (text: string, requestId?: string) => Promise<void>
  retryTurn: () => Promise<void>
  setFollowMode: (mode: TimelineFollowMode) => void
  ready: boolean
}

function emptyReadModel(taskId: string, title?: string): TaskReadModel {
  return {
    taskId: taskId as TaskReadModel['taskId'],
    projectId: '' as TaskReadModel['projectId'],
    title: title ?? '未命名任务',
    titleSource: 'local',
    projectionVersion: 0,
    runStatus: null,
    activeRunId: null,
    activeTurnId: null,
    liveStatus: null,
    timeline: [],
    recoveryRequired: false,
    lastTaskSequence: 0,
    scroll: { followMode: 'follow', unreadCount: 0 },
  }
}

/**
 * Subscribe to a controller bound to `taskId`.
 * When `enabled` is false, does not attach and returns an inert stub.
 */
export function useTaskRuntime(
  controller: TaskRuntimeController | null,
  taskId: string,
  options?: { enabled?: boolean; title?: string },
): UseTaskRuntimeResult {
  const enabled = options?.enabled ?? true
  const title = options?.title
  const [ready, setReady] = useState(false)

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

  // Re-render when controller revision bumps; then read live fields.
  useSyncExternalStore(subscribe, getRevision, () => 0)

  useEffect(() => {
    if (!controller || !enabled || !taskId) {
      setReady(false)
      return
    }
    let cancelled = false
    setReady(false)
    void controller.attach(taskId, { title }).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
    // `title` is only the seed used when a task is first attached. Runtime
    // title projection may later rename the navigator entry; that must not
    // re-attach the same task and restart this lifecycle effect.
  }, [controller, enabled, taskId])

  const submitText = useCallback(
    async (text: string, composerContext?: TurnComposerContext) => {
      if (!controller || !enabled) return null
      return controller.submitText(text, composerContext)
    },
    [controller, enabled],
  )

  const cancelActiveRun = useCallback(async () => {
    if (!controller || !enabled) return
    await controller.cancelActiveRun()
  }, [controller, enabled])

  const respondToApproval = useCallback(
    async (requestId: string, decision: 'approved' | 'rejected') => {
      if (!controller || !enabled) return
      await controller.respondToApproval(requestId, decision)
    },
    [controller, enabled],
  )

  const provideRunInput = useCallback(
    async (text: string, requestId?: string) => {
      if (!controller || !enabled) return
      await controller.provideRunInput(text, requestId)
    },
    [controller, enabled],
  )

  const retryTurn = useCallback(async () => {
    if (!controller || !enabled) return
    await controller.retryTurn()
  }, [controller, enabled])

  const setFollowMode = useCallback(
    (mode: TimelineFollowMode) => {
      if (!controller || !enabled) return
      controller.setFollowMode(mode)
    },
    [controller, enabled],
  )

  if (!controller || !enabled) {
    return {
      readModel: emptyReadModel(taskId, title),
      busy: false,
      notice: null,
      runStatus: null,
      ready: false,
      submitText,
      cancelActiveRun,
      respondToApproval,
      provideRunInput,
      retryTurn,
      setFollowMode,
    }
  }

  return {
    readModel: controller.readModel,
    busy: controller.isBusy(),
    notice: controller.getNotice(),
    runStatus: controller.getRunStatus(),
    ready,
    submitText,
    cancelActiveRun,
    respondToApproval,
    provideRunInput,
    retryTurn,
    setFollowMode,
  }
}
