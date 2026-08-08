import { useMemo, useState } from 'react'
import type { RunStatus } from '../../model/lifecycle'
import type {
  CommandAcknowledgement,
  TurnComposerContext,
} from '../../protocol/commands'
import type { ContextSection, LaunchAction, TaskContentMode } from '../../model/types'
import type { TaskReadModel } from '../../projection/types'
import type { StreamViewModel } from '../../model/stream-events'
import {
  ApprovalDock,
  findPendingApproval,
} from '../approval-dock/approval-dock'
import { Composer } from '../composer/composer'
import { ContextPanel } from '../context-panel/context-panel'
import { EmptyHub } from '../empty-hub/empty-hub'
import { ExecutionStream } from '../execution-stream/execution-stream'
import type { RuntimeHonestyMode } from '../../runtime/runtime-honesty'
import {
  Timeline,
  type TimelineOpenFileRef,
} from '../timeline/timeline'

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
    composerContext?: TurnComposerContext,
  ) => Promise<CommandAcknowledgement | null>
  onCancelRun?: () => void | Promise<void>
  runtimeNotice?: string | null
  onApprove?: (requestId: string) => void | Promise<void>
  onReject?: (requestId: string) => void | Promise<void>
  onProvideInput?: (requestId: string, text: string) => void | Promise<void>
  onRetryTurn?: () => void | Promise<void>
  onFollowModeChange?: (mode: 'follow' | 'user-pinned') => void
  /** Runtime honesty copy mode when mode === 'runtime'. */
  honestyMode?: RuntimeHonestyMode
  /** Runtime-owned label; runtime mode does not pretend a local picker is wired. */
  modelLabel?: string
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

export function TaskSurface({
  view,
  onCloseContextPanel,
  onLaunchAction,
  composerRuntime,
  onOpenFileRef,
}: TaskSurfaceProps) {
  const [lastActionId, setLastActionId] = useState<string | null>(null)

  const handleLaunch = (action: LaunchAction) => {
    setLastActionId(action.id)
    onLaunchAction?.(action)
  }

  const composerMode = composerRuntime?.mode ?? 'local-sim'
  const honestyMode = composerRuntime?.honestyMode ?? 'fake'

  // Codex: pending tool approval docks at bottom and replaces Composer.
  const pendingApproval = useMemo(
    () =>
      view.mode === 'runtime'
        ? findPendingApproval(view.readModel?.timeline)
        : null,
    [view.mode, view.readModel?.timeline],
  )

  return (
    <section
      className='task-container relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background'
      data-slot='task-surface'
      data-testid='task-surface'
      data-task-id={view.taskId}
      data-content-mode={view.mode}
      data-last-launch-action={lastActionId ?? undefined}
      data-approval-dock={pendingApproval ? 'open' : undefined}
      aria-label={`任务表面：${view.title}`}
    >
      <div className='relative flex min-h-0 flex-1'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {view.mode === 'runtime' && view.readModel ? (
            <Timeline
              readModel={view.readModel}
              onRetryTurn={composerRuntime?.onRetryTurn}
              onFollowModeChange={composerRuntime?.onFollowModeChange}
              honestyMode={honestyMode}
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
          {pendingApproval ? (
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
              honestyMode={honestyMode}
              modelLabel={composerRuntime?.modelLabel}
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
