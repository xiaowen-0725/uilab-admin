import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RunStatus } from '../../model/lifecycle'
import type { StreamViewModel } from '../../model/stream-events'
import type {
  ContextSection,
  LaunchAction,
  TaskContentMode,
} from '../../model/types'
import type { TaskReadModel } from '../../projection/types'
import type {
  CommandAcknowledgement,
  TurnComposerContext,
} from '../../protocol/commands'
import {
  autoApproveReason,
  decideApprovalResponse,
  usePermissionPreset,
} from '../../application/permission-preset'
import {
  ApprovalDock,
  findPendingApproval,
} from '../approval-dock/approval-dock'
import { Composer } from '../composer/composer'
import { ContextPanel } from '../context-panel/context-panel'
import { EmptyHub } from '../empty-hub/empty-hub'
import { ExecutionStream } from '../execution-stream/execution-stream'
import { Timeline, type TimelineOpenFileRef } from '../timeline/timeline'

export interface TaskSurfaceView {
  taskId: string
  title: string
  subtitle?: string
  projectName: string
  mode: TaskContentMode
  stream: StreamViewModel | null
  /** Progressive capture replay (true timed playback). */
  streamPlaying?: boolean
  streamProgress?: number
  /** Present when mode === 'runtime'. */
  readModel?: TaskReadModel | null
  launchActions: LaunchAction[]
  contextSections: ContextSection[]
  contextPanelOpen: boolean
}

export interface TaskSurfaceComposerRuntime {
  mode: 'local-sim' | 'runtime'
  runStatus?: RunStatus | null
  onSubmitText?: (
    text: string,
    composerContext?: TurnComposerContext
  ) => Promise<CommandAcknowledgement | null>
  onCancelRun?: () => void | Promise<void>
  runtimeNotice?: string | null
  onApprove?: (
    requestId: string,
    reason?: string,
  ) => void | Promise<void | CommandAcknowledgement | null>
  onReject?: (
    requestId: string,
  ) => void | Promise<void | CommandAcknowledgement | null>
  onProvideInput?: (requestId: string, text: string) => void | Promise<void>
  onRetryTurn?: () => void | Promise<void>
  onFollowModeChange?: (mode: 'follow' | 'user-pinned') => void
  /** Runtime-owned label; runtime mode does not pretend a local picker is wired. */
  modelLabel?: string
  /** Capability Surface controller (Composition-owned). */
  capabilityController?:
    | import('@/modules/capabilities').CapabilityController
    | null
  /** Active task id for capability selection persistence. */
  capabilityTaskId?: string | null
  /** Open the shared global capability management Surface. */
  onManageCapabilities?: () => void
}

export interface TaskSurfaceProps {
  view: TaskSurfaceView
  onCloseContextPanel?: () => void
  /** Fixture-honest: parent may switch to stream capture. */
  onLaunchAction?: (action: LaunchAction) => void
  /** Dual-path composer: default local-sim; runtime for Fake vertical slice. */
  composerRuntime?: TaskSurfaceComposerRuntime
  /**
   * Open a path/file from Timeline chips/cards into Work Surface.
   * Composition wires Session.openWorkSurfaceTab; Task does not own openTabs.
   */
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
}

const claimedAutoRespond = new Set<string>()

export function TaskSurface({
  view,
  onCloseContextPanel,
  onLaunchAction,
  composerRuntime,
  onOpenFileRef,
}: TaskSurfaceProps) {
  const [lastActionId, setLastActionId] = useState<string | null>(null)
  const { preset } = usePermissionPreset(view.taskId)
  const autoRespondedRef = useRef<string | null>(null)
  const [autoApproveFailedId, setAutoApproveFailedId] = useState<string | null>(
    null,
  )

  const handleLaunch = (action: LaunchAction) => {
    setLastActionId(action.id)
    onLaunchAction?.(action)
  }

  const composerMode = composerRuntime?.mode ?? 'local-sim'

  // Codex: pending tool approval docks at bottom and replaces Composer —
  // unless the permission preset auto-answers first (no Dock flash).
  const pendingApproval = useMemo(
    () =>
      view.mode === 'runtime'
        ? findPendingApproval(view.readModel?.timeline)
        : null,
    [view.mode, view.readModel?.timeline],
  )
  const approvalDecision = pendingApproval
    ? decideApprovalResponse(preset, pendingApproval.toolName)
    : null
  const showDock =
    Boolean(pendingApproval) &&
    (approvalDecision === 'dock' ||
      autoApproveFailedId === pendingApproval?.requestId)

  useLayoutEffect(() => {
    if (!pendingApproval || approvalDecision !== 'approve') return
    if (autoApproveFailedId === pendingApproval.requestId) return
    if (autoRespondedRef.current === pendingApproval.requestId) return
    const claimKey = `${view.taskId}:${pendingApproval.requestId}`
    if (claimedAutoRespond.has(claimKey)) return
    const onApprove = composerRuntime?.onApprove
    if (!onApprove) return
    autoRespondedRef.current = pendingApproval.requestId
    claimedAutoRespond.add(claimKey)
    const requestId = pendingApproval.requestId
    const reason = autoApproveReason(preset)
    void Promise.resolve(onApprove(requestId, reason)).then((result) => {
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        result.status === 'rejected'
      ) {
        setAutoApproveFailedId(requestId)
      }
    })
  }, [
    pendingApproval,
    approvalDecision,
    autoApproveFailedId,
    composerRuntime?.onApprove,
    preset,
    view.taskId,
  ])

  return (
    <section
      className='task-container relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background'
      data-slot='task-surface'
      data-testid='task-surface'
      data-task-id={view.taskId}
      data-content-mode={view.mode}
      data-last-launch-action={lastActionId ?? undefined}
      data-approval-dock={showDock ? 'open' : undefined}
      aria-label={`任务表面：${view.title}`}
    >
      <div className='relative flex min-h-0 flex-1'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {view.mode === 'runtime' && view.readModel ? (
            <Timeline
              readModel={view.readModel}
              onRetryTurn={composerRuntime?.onRetryTurn}
              onFollowModeChange={composerRuntime?.onFollowModeChange}
              onOpenFileRef={onOpenFileRef}
            />
          ) : view.mode === 'stream' && view.stream ? (
            <ExecutionStream
              stream={view.stream}
              playing={view.streamPlaying}
              progress={view.streamProgress}
            />
          ) : (
            <EmptyHub
              projectName={view.projectName}
              actions={view.launchActions}
              onSelectAction={handleLaunch}
            />
          )}
          {showDock && pendingApproval ? (
            <ApprovalDock
              approval={pendingApproval}
              onApprove={(id) => void composerRuntime?.onApprove?.(id)}
              onReject={(id) => void composerRuntime?.onReject?.(id)}
            />
          ) : (
            <Composer
              projectLabel={view.projectName}
              mode={composerMode}
              runStatus={composerRuntime?.runStatus}
              onSubmitText={composerRuntime?.onSubmitText}
              onCancelRun={composerRuntime?.onCancelRun}
              runtimeNotice={composerRuntime?.runtimeNotice}
              modelLabel={composerRuntime?.modelLabel}
              capabilityController={composerRuntime?.capabilityController}
              capabilityTaskId={
                composerRuntime?.capabilityTaskId ?? view.taskId
              }
              onManageCapabilities={composerRuntime?.onManageCapabilities}
              // Codex top-rail stack: rail always on for depth; project chip only on empty hub.
              showContextBar
              showProjectChip={view.mode === 'empty'}
            />
          )}
        </div>
        <ContextPanel
          open={view.contextPanelOpen}
          sections={view.contextSections}
          onClose={onCloseContextPanel}
        />
      </div>
    </section>
  )
}
