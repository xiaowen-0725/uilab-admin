/**
 * Timeline — TaskReadModel → Layer 4 shell + Layer 5 block registry.
 * Kernel (projection / envelope / turn.* = Run) is not mutated here.
 */

import { useRef, type MutableRefObject } from 'react'
import type { TurnStatus } from '../../model/lifecycle'
import type { TaskReadModel, TimelineItem } from '../../projection/types'
import { VOLTAGENT_RUNTIME_HONESTY_COPY } from '../../runtime/runtime-honesty'
import {
  applyStreamGate,
  streamItemsHitlPending,
  streamItemsToolActive,
} from './apply-stream-gate'
import { TimelineBlock } from './block-registry'
import {
  DeliverableZone,
  type OpenDeliverablesRequest,
} from './blocks/deliverables'
import { TurnTerminalBlock } from './blocks/turn-terminal'
import {
  deriveTimelineView,
  type TimelineViewBlock,
} from './derive-timeline-view'
import { groupTimelineIntoTurns } from './group-timeline-turns'
import { MessageScroller } from './message-scroller'
import type { QuestionRespondHandler } from './question-card'
import type { StreamGate } from './stream-gate'
import { computeTimelineFollowTip } from './timeline-follow-tip'
import type { TimelineOpenFileRef } from './timeline-shared'
import { WorkingBlock } from './working-block'

export { TIMELINE_FOLD_THRESHOLD } from './foldable-body'
export { chineseStatusLabel } from './chinese-status-label'
export type { TimelineOpenFileRef } from './timeline-shared'
export type { OpenDeliverablesRequest } from './blocks/deliverables'

export interface TimelineProps {
  readModel: TaskReadModel
  onRetryTurn?: () => void
  onFollowModeChange?: (mode: 'follow' | 'user-pinned') => void
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onOpenDeliverables?: (request: OpenDeliverablesRequest) => void
  onRespondToQuestion?: QuestionRespondHandler
}

function isActiveTurnStatus(status: TurnStatus | null): boolean {
  if (!status) return false
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'waiting_for_approval' ||
    status === 'waiting_for_input' ||
    status === 'cancelling'
  )
}

function isSettledRunStatus(status: string | undefined): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'interrupted'
  )
}

function emptyWorkingBlock(): Extract<TimelineViewBlock, { kind: 'working' }> {
  return {
    kind: 'working',
    items: [],
    status: 'running',
    summary: { stepCount: 0, counts: {} },
  }
}

export function Timeline({
  readModel,
  onRetryTurn,
  onFollowModeChange,
  onOpenFileRef,
  onOpenDeliverables,
  onRespondToQuestion,
}: TimelineProps) {
  const runActive = isActiveTurnStatus(readModel.turnStatus)
  const runAttr =
    runActive || readModel.turnStatus
      ? readModel.turnStatus ?? 'unknown'
      : undefined
  const turnSegments = groupTimelineIntoTurns(readModel.timeline)
  const lastSegment = turnSegments[turnSegments.length - 1]
  const lastDeliverables =
    lastSegment?.terminal?.meta?.deliverables ?? readModel.deliverables
  const lastGatesRef = useRef<Record<string, StreamGate>>({})
  const lastFollow = lastSegment
    ? computeTimelineFollowTip({
        segmentKey: lastSegment.key,
        streamItems: lastSegment.bodyItems,
        runSettled: !runActive,
        deliverablePaths: lastDeliverables?.map((item) => item.path),
        prevGates: lastGatesRef.current,
        terminalId: lastSegment.terminal?.id,
      })
    : undefined
  if (lastFollow) lastGatesRef.current = lastFollow.gated.gates
  const honesty = VOLTAGENT_RUNTIME_HONESTY_COPY

  return (
    <MessageScroller
      taskId={readModel.taskId}
      followTip={lastFollow?.tip ?? ''}
      followMode={readModel.scroll.followMode ?? 'follow'}
      onFollowModeChange={onFollowModeChange}
      aria-label={honesty.timelineAriaLabel}
      data-runtime-turn={runAttr}
      data-turn-status={readModel.turnStatus ?? undefined}
      data-recovery={readModel.recoveryRequired ? 'true' : undefined}
      data-honesty-mode='voltagent'
    >
      <span
        className='sr-only'
        role='status'
        aria-live='polite'
        data-testid='timeline-turn-announcement'
      >
        {readModel.turnStatus === 'completed'
          ? '回复已完成'
          : readModel.turnStatus === 'failed'
            ? '回复失败'
            : ''}
      </span>
      <span className='sr-only' data-testid='runtime-honesty-banner'>
        {honesty.banner}
      </span>

      {readModel.recoveryRequired ? (
        <p
          className='sr-only'
          role='status'
          aria-live='polite'
          data-testid='runtime-recovery-notice'
        >
          {honesty.recovery}
        </p>
      ) : null}

      {readModel.turnStatus === 'waiting_for_approval' ? (
        <p
          className='sr-only'
          role='status'
          aria-live='polite'
          data-testid='runtime-approval-notice'
        >
          {honesty.waitingApproval}
        </p>
      ) : null}

      {readModel.turnStatus === 'waiting_for_input' ? (
        <p
          className='sr-only'
          role='status'
          aria-live='polite'
          data-testid='runtime-input-notice'
        >
          {honesty.waitingInput}
        </p>
      ) : null}

      {readModel.timeline.length === 0 ? (
        <p
          className='py-6 text-center text-sm text-muted-foreground'
          data-testid='timeline-empty'
        >
          {honesty.emptyTimeline}
        </p>
      ) : (
        turnSegments.map((seg, index) => {
          const isLast = index === turnSegments.length - 1
          return (
            <div
              key={seg.key}
              className='flex flex-col gap-[var(--tl-speaker-gap)]'
              data-testid={`timeline-turn-${seg.key}`}
              data-turn-index={String(index)}
              data-run-segment=''
            >
              {seg.userMessages.map((item) => (
                <TimelineBlock
                  key={item.id}
                  item={item}
                  runActive={runActive && isLast}
                  onOpenFileRef={onOpenFileRef}
                  onRespondToQuestion={onRespondToQuestion}
                />
              ))}

              <TimelineRunBody
                latestTerminal={seg.terminal}
                streamItems={seg.bodyItems}
                runActive={runActive && isLast}
                persistGatesRef={isLast ? lastGatesRef : undefined}
                deliverables={
                  seg.terminal?.meta?.deliverables ??
                  (isLast ? readModel.deliverables : undefined)
                }
                onOpenFileRef={onOpenFileRef}
                onOpenDeliverables={onOpenDeliverables}
                onRespondToQuestion={onRespondToQuestion}
                onRetryTurn={
                  isLast && readModel.turnStatus === 'failed'
                    ? onRetryTurn
                    : undefined
                }
              />
            </div>
          )
        })
      )}
    </MessageScroller>
  )
}

type TimelineRunBodyProps = {
  latestTerminal: TimelineItem | undefined
  streamItems: TimelineItem[]
  runActive: boolean
  persistGatesRef?: MutableRefObject<Record<string, StreamGate>>
  deliverables?: TaskReadModel['deliverables']
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onOpenDeliverables?: (request: OpenDeliverablesRequest) => void
  onRespondToQuestion?: QuestionRespondHandler
  onRetryTurn?: () => void
}

function TimelineRunBody({
  latestTerminal,
  streamItems,
  runActive,
  persistGatesRef,
  deliverables,
  onOpenFileRef,
  onOpenDeliverables,
  onRespondToQuestion,
  onRetryTurn,
}: TimelineRunBodyProps) {
  const localGatesRef = useRef<Record<string, StreamGate>>({})
  const gatesRef = persistGatesRef ?? localGatesRef
  const rawBlocks = deriveTimelineView(streamItems)
  const hasProcess = rawBlocks.some(
    (block) => block.kind === 'working' && block.items.length > 0,
  )
  const runSettled = !runActive
  const deliverablePaths = deliverables?.map((item) => item.path)
  const gated = applyStreamGate(
    rawBlocks,
    {
      hasProcess,
      toolActive: streamItemsToolActive(streamItems),
      hitlPending: streamItemsHitlPending(streamItems),
      runSettled,
      deliverablePaths,
    },
    gatesRef.current,
  )
  gatesRef.current = gated.gates
  const blocks = gated.blocks
  const hasWorking = blocks.some((block) => block.kind === 'working')
  const lastWorkingIndex = blocks.findLastIndex((block) => block.kind === 'working')
  const completed = latestTerminal?.status === 'completed' && runSettled
  const plainFilePaths =
    completed && deliverables && deliverables.length > 0
      ? deliverables.map((item) => item.path)
      : undefined
  const hasErrorItem = streamItems.some((item) => item.category === 'error')
  const hideFailedChrome =
    latestTerminal?.status === 'failed' && hasErrorItem
  const standaloneTerminal =
    runSettled &&
    !hasWorking &&
    latestTerminal &&
    isSettledRunStatus(latestTerminal.status) &&
    !hideFailedChrome
      ? latestTerminal
      : undefined

  return (
    <div
      className='flex flex-col gap-[var(--tl-run-gap)]'
      data-slot='timeline-run-body'
    >
      {runActive && !hasWorking ? (
        <WorkingBlock
          block={emptyWorkingBlock()}
          terminal={latestTerminal}
          runActive
          primaryChrome
          onOpenFileRef={onOpenFileRef}
          onRespondToQuestion={onRespondToQuestion}
        />
      ) : null}

      {blocks.map((block, index) => {
        if (block.kind === 'working') {
          const isLastWorking = index === lastWorkingIndex
          return (
            <WorkingBlock
              key={`working-${index}`}
              block={block}
              terminal={latestTerminal}
              runActive={
                runActive && (block.status === 'running' || isLastWorking)
              }
              primaryChrome={isLastWorking}
              onOpenFileRef={onOpenFileRef}
              onRespondToQuestion={onRespondToQuestion}
            />
          )
        }
        return (
          <TimelineBlock
            key={block.item.id}
            item={block.item}
            runActive={runActive}
            onOpenFileRef={onOpenFileRef}
            plainFilePaths={plainFilePaths}
            onRespondToQuestion={onRespondToQuestion}
            onRetryTurn={
              block.item.category === 'error' ? onRetryTurn : undefined
            }
          />
        )
      })}

      {standaloneTerminal ? (
        <TurnTerminalBlock item={standaloneTerminal} runActive={false} />
      ) : null}

      {completed && deliverables && deliverables.length > 0 ? (
        <DeliverableZone
          items={deliverables}
          onOpenFileRef={onOpenFileRef}
          onOpenDeliverables={onOpenDeliverables}
        />
      ) : null}
    </div>
  )
}
