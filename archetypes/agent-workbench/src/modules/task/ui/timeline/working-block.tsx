import { useEffect, useState, type ReactNode } from 'react'
import {
  ThreadCollapse,
  ThreadTurnHeader,
} from '@/components/motion/agent-thread'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatDurationZh } from '../../model/stream-events'
import type { TimelineItem } from '../../projection/types'
import type { QuestionRespondHandler } from './question-card'
import { TimelineBlock } from './block-registry'
import { ActivityGroup } from './blocks/activity-group'
import { formatUsageHover } from './chinese-status-label'
import type { TimelineViewBlock, WorkingEntry } from './derive-timeline-view'
import { FoldableBody } from './foldable-body'
import { readStartedAtMs, type TimelineOpenFileRef } from './timeline-shared'
import {
  countProcessItems,
  formatWorkingHeader,
  workingChromeStatus,
  workingOutcomeLabel,
} from './working-header'

function ProcessAside({ item }: { item: TimelineItem }): ReactNode {
  const body = item.body?.trim()
  if (!body) return null
  return (
    <div
      data-kind='process-aside'
      data-testid={`timeline-process-aside-${item.id}`}
      className='px-0.5'
    >
      <FoldableBody itemId={item.id} body={body} muted compact />
    </div>
  )
}

function workingElapsedMs(
  running: boolean,
  clockStart: number | null,
  nowMs: number,
  settledMs: number | null | undefined,
): number | null {
  if (!running) return settledMs ?? null
  if (clockStart == null) return null
  return Math.max(0, nowMs - clockStart)
}

function workingHeaderOutcome(
  running: boolean,
  cancelling: boolean,
  terminalStatus: TimelineItem['status'] | undefined,
): string | undefined {
  if (running && cancelling) return '取消中'
  if (running) return undefined
  return workingOutcomeLabel(terminalStatus)
}

function workingEntryKey(entry: WorkingEntry, index: number): string {
  if (entry.kind === 'activity-group') {
    return `activity-${entry.kinds.join('-')}-${index}`
  }
  return entry.item.id
}

type WorkingProcessEntryProps = {
  entry: WorkingEntry
  running: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}

function WorkingProcessEntry({
  entry,
  running,
  onOpenFileRef,
  onRespondToQuestion,
}: WorkingProcessEntryProps): ReactNode {
  if (entry.kind === 'activity-group') {
    return <ActivityGroup kinds={entry.kinds} items={entry.items} />
  }
  if (entry.item.category === 'assistant-message') {
    return <ProcessAside item={entry.item} />
  }
  return (
    <TimelineBlock
      item={entry.item}
      runActive={running}
      forceToolCollapsed={entry.item.status === 'completed'}
      embeddedInProcess
      onOpenFileRef={onOpenFileRef}
      onRespondToQuestion={onRespondToQuestion}
    />
  )
}

type WorkingBlockProps = {
  block: Extract<TimelineViewBlock, { kind: 'working' }>
  terminal: TimelineItem | undefined
  runActive: boolean
  primaryChrome?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}

export function WorkingBlock({
  block,
  terminal,
  runActive,
  primaryChrome = false,
  onOpenFileRef,
  onRespondToQuestion,
}: WorkingBlockProps): ReactNode {
  const terminalSettled =
    terminal?.status === 'completed' ||
    terminal?.status === 'failed' ||
    terminal?.status === 'cancelled' ||
    terminal?.status === 'interrupted'
  const running =
    !terminalSettled && (runActive || block.status === 'running')
  const [open, setOpen] = useState(running)
  const [userTouched, setUserTouched] = useState(false)
  const startedAtMs = block.startedAt ? Date.parse(block.startedAt) : Number.NaN
  const terminalStartedAt = readStartedAtMs(terminal)
  const clockStart = Number.isFinite(startedAtMs)
    ? startedAtMs
    : terminalStartedAt
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!running || clockStart == null) return
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [running, clockStart])

  const itemCount = countProcessItems(block.items)
  const elapsedMs = workingElapsedMs(
    running,
    clockStart,
    nowMs,
    block.durationMs ?? terminal?.meta?.durationMs,
  )
  const durationLabel =
    elapsedMs != null ? formatDurationZh(elapsedMs) : null
  const headerShimmer = running
  const cancelling = terminal?.status === 'cancelling'
  const headerText = formatWorkingHeader({
    running,
    durationLabel,
    outcomeLabel: workingHeaderOutcome(running, cancelling, terminal?.status),
  })

  const canOpen = block.items.length > 0

  useEffect(() => {
    if (userTouched) return
    setOpen(running)
  }, [running, userTouched])

  const usageHover = formatUsageHover(terminal?.meta?.usage)
  const labelNode = (
    <span
      data-testid={primaryChrome ? 'timeline-turn-status-label' : undefined}
      className={cn(
        'inline-flex max-w-[min(100%,36rem)] items-baseline gap-1 truncate tabular-nums',
        headerShimmer && 'wb-live-status-shimmer',
      )}
      title={usageHover}
      aria-label={usageHover}
    >
      {headerText}
    </span>
  )

  return (
    <div
      data-kind='process-fold'
      data-testid='timeline-working-block'
      data-category='turn-terminal'
      data-status={workingChromeStatus(running, terminal?.status)}
      data-runtime-turn={terminal?.status}
      data-fold-open={open ? 'true' : 'false'}
      data-process-count={String(itemCount)}
    >
      {primaryChrome && terminal ? (
        <span className='sr-only' data-testid={`timeline-item-${terminal.id}`} />
      ) : null}
      {canOpen ? (
        <>
          <ThreadTurnHeader
            open={open}
            working={running}
            onOpenChange={(next) => {
              setUserTouched(true)
              setOpen(next)
            }}
            className='my-0 mx-0 px-0'
            data-testid={primaryChrome ? 'timeline-turn-toggle' : undefined}
          >
            {labelNode}
          </ThreadTurnHeader>
          <Separator
            className='bg-[var(--tl-rule)]'
            data-testid='timeline-process-rule'
          />
          <ThreadCollapse open={open}>
            <div
              className='flex flex-col gap-1 pt-2'
              data-slot='process-fold-body'
            >
              {block.items.map((entry, index) => (
                <WorkingProcessEntry
                  key={workingEntryKey(entry, index)}
                  entry={entry}
                  running={running}
                  onOpenFileRef={onOpenFileRef}
                  onRespondToQuestion={onRespondToQuestion}
                />
              ))}
            </div>
          </ThreadCollapse>
        </>
      ) : (
        <div className='tl-chrome inline-flex h-[26px] items-center text-black/50 dark:text-white/50'>
          {labelNode}
        </div>
      )}
    </div>
  )
}
