/**
 * Timeline — render TaskReadModel.timeline (Phase 4C–4F).
 * Chat density: 14px prose / 13px process chrome, tight slot gaps (grok-app rhythm).
 * UI never mutates Turn status; presentation only.
 *
 * 4D: reasoning / plan / tool / command / file / source / approval / input / error
 * 4F: long-body fold (>600) + smart scroll (follow vs user-pinned)
 */

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ChevronDown,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatDurationMs } from '../../model/stream-events'
import type { TurnStatus } from '../../model/lifecycle'
import type {
  DeliverableRef,
  TaskReadModel,
  TimelineItem,
  TimelineItemMeta,
  TokenUsage,
  ProcessSummary,
} from '../../projection/types'
import { FileChangeSummaryCard } from '../markdown/file-change-summary-card'
import { FileReferenceChip } from '../markdown/file-reference-chip'
import { SimpleMarkdown } from '../markdown/simple-markdown'
import { formatToolClusterCopy } from '../../projection/tool-activity-copy'
import { runtimeHonestyCopy } from '../../runtime/runtime-honesty'
import {
  deriveTimelineView,
  type TimelineViewBlock,
  type WorkingEntry,
} from './derive-timeline-view'
import { groupTimelineIntoTurns } from './group-timeline-turns'
import { PlanUpdateCard } from './plan-update-card'
import { QuestionCard, type QuestionRespondHandler } from './question-card'
import { ToolActivityIcon } from '../tool-activity-icon'

export const TIMELINE_FOLD_THRESHOLD = 600

const PROCESS_KIND_LABELS: Array<[
  keyof ProcessSummary['counts'],
  string,
]> = [
  ['read', '读取'],
  ['write', '写入'],
  ['list', '列出'],
  ['search', '搜索'],
  ['command', '命令'],
  ['other', '其他'],
]

function formatUsageHover(usage?: TokenUsage | null): string | undefined {
  if (!usage) return undefined
  const parts: string[] = []
  if (usage.inputTokens != null) parts.push(`输入 ${usage.inputTokens}`)
  if (usage.outputTokens != null) parts.push(`输出 ${usage.outputTokens}`)
  if (parts.length === 0 && usage.totalTokens != null) {
    parts.push(`共 ${usage.totalTokens}`)
  }
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function processSummaryDetail(summary: ProcessSummary | undefined): string | null {
  if (!summary || summary.stepCount === 0) return null
  const parts = PROCESS_KIND_LABELS.flatMap(([kind, label]) => {
    const count = summary.counts[kind]
    return count ? [`${label} ${count}`] : []
  })
  return parts.length > 0 ? parts.join(' · ') : null
}

/** User intent to open a file/path in Work Surface (Session open, not Host mutate). */
export type TimelineOpenFileRef = {
  path?: string
  line?: number
  label: string
}

export interface TimelineProps {
  readModel: TaskReadModel
  onRetryTurn?: () => void
  onFollowModeChange?: (mode: 'follow' | 'user-pinned') => void
  /**
   * Timeline file chip / file-change card → open Work Surface tab.
   * Must be wired by Composition through Session; Task never owns openTabs.
   */
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
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

/**
 * Turn chrome label without embedding duration (duration appended once by header).
 *
 * Status wins over title for active runs. Projection may historically stamp title
 * 「已处理」while status is still `running` (Codex-shaped "Worked for Xs"); in Chinese
 * that past-tense reads as completed — never show 「已处理」until status is completed.
 * Align present-tense with liveStatus (「正在思考」/「处理中」).
 */
export function chineseStatusLabel(item: TimelineItem): string {
  switch (item.status) {
    case 'queued':
      return '排队中'
    case 'running': {
      // Present tense only while active. Prefer explicit thinking/process titles.
      if (item.title === '正在思考') return '正在思考'
      if (item.title === '处理中') return '处理中'
      // title「已处理」or missing/English under running → present tense (stream early chrome).
      return '正在思考'
    }
    case 'cancelling':
      return '取消中'
    case 'waiting_for_approval':
      return '等待审批'
    case 'waiting_for_input':
      return '等待输入'
    case 'completed':
      return '已处理'
    case 'cancelled':
      return '已取消'
    case 'failed':
      return '失败'
    case 'interrupted':
      return '已中断'
    default:
      break
  }
  if (item.title === '已处理') return '已处理'
  if (item.title && /[\u4e00-\u9fff]/.test(item.title)) return item.title
  return item.title ?? item.status ?? '运行'
}

function readStartedAtMs(item: TimelineItem | undefined): number | null {
  if (!item?.meta) return null
  if (item.meta.startedAt) {
    const t = Date.parse(item.meta.startedAt)
    return Number.isFinite(t) ? t : null
  }
  const path = item.meta.path
  if (path?.startsWith('startedAt:')) {
    const t = Date.parse(path.slice('startedAt:'.length))
    return Number.isFinite(t) ? t : null
  }
  return null
}

function requestIdFromItem(item: TimelineItem, prefix: string): string {
  if (item.id.startsWith(prefix)) return item.id.slice(prefix.length)
  return item.id
}

function isNearBottom(el: HTMLElement, threshold = 80): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

export function Timeline({
  readModel,
  onRetryTurn,
  onFollowModeChange,
  onOpenFileRef,
  onRespondToQuestion,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [followMode, setFollowMode] = useState<'follow' | 'user-pinned'>(
    readModel.scroll.followMode ?? 'follow',
  )
  const followModeRef = useRef(followMode)
  const [localUnread, setLocalUnread] = useState(0)

  const runActive = isActiveTurnStatus(readModel.turnStatus)
  const runAttr =
    runActive || readModel.turnStatus
      ? readModel.turnStatus ?? 'unknown'
      : undefined

  // Chronological turn segments (user → chrome → tools/assistant per turn).
  const turnSegments = groupTimelineIntoTurns(readModel.timeline)

  const setMode = useCallback(
    (mode: 'follow' | 'user-pinned') => {
      followModeRef.current = mode
      setFollowMode(mode)
      if (mode === 'follow') setLocalUnread(0)
      onFollowModeChange?.(mode)
    },
    [onFollowModeChange],
  )

  useEffect(() => {
    followModeRef.current = followMode
  }, [followMode])

  useEffect(() => {
    setMode('follow')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [readModel.taskId, setMode])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (isNearBottom(el)) {
      if (followMode !== 'follow') setMode('follow')
    } else if (followMode === 'follow') {
      setMode('user-pinned')
    }
  }, [followMode, setMode])

  // Follow actual rendered height, not only item count: message.delta updates an
  // existing item and Markdown/table layout may grow after the projection pass.
  useEffect(() => {
    const content = contentRef.current
    const scroller = scrollRef.current
    if (!content || !scroller || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (followModeRef.current === 'follow') {
          scroller.scrollTop = scroller.scrollHeight
          setLocalUnread(0)
        } else {
          setLocalUnread((count) => Math.max(1, count))
        }
      })
    })
    observer.observe(content)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const jumpToBottom = useCallback(() => {
    setMode('follow')
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [setMode])

  const honesty = runtimeHonestyCopy()

  return (
    <div
      ref={scrollRef}
      className='relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3'
      data-slot='task-timeline'
      data-testid='task-timeline'
      data-runtime-turn={runAttr}
      data-turn-status={readModel.turnStatus ?? undefined}
      data-recovery={readModel.recoveryRequired ? 'true' : undefined}
      data-follow-mode={followMode}
      data-honesty-mode="voltagent"
      aria-label={honesty.timelineAriaLabel}
      onScroll={onScroll}
    >
      <div
        ref={contentRef}
        className='mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-4'
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

        {readModel.turnStatus === 'failed' && onRetryTurn ? (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              data-testid='timeline-retry-turn'
              onClick={() => onRetryTurn()}
            >
              重试本轮
            </Button>
          </div>
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
                className='flex flex-col gap-2.5'
                data-testid={`timeline-turn-${seg.key}`}
                data-turn-index={String(index)}
              >
                {seg.userMessages.map((item) => (
                  <TimelineRow
                    key={item.id}
                    item={item}
                    runActive={runActive && isLast}
                    onOpenFileRef={onOpenFileRef}
                    onRespondToQuestion={onRespondToQuestion}
                  />
                ))}

                <TimelineTurnBlock
                  latestTerminal={seg.terminal}
                  streamItems={seg.bodyItems}
                  runActive={runActive && isLast}
                  liveStatus={isLast ? readModel.liveStatus : null}
                  deliverables={
                    seg.terminal?.meta?.deliverables ??
                    (isLast ? readModel.deliverables : undefined)
                  }
                  onOpenFileRef={onOpenFileRef}
                  onRespondToQuestion={onRespondToQuestion}
                />
              </div>
            )
          })
        )}
        <div ref={bottomRef} data-testid='timeline-bottom-anchor' />
      </div>

      {followMode === 'user-pinned' && localUnread > 0 ? (
        <div className='pointer-events-none sticky bottom-3 z-10 flex justify-center'>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='pointer-events-auto shadow-md'
            data-testid='timeline-new-content'
            onClick={jumpToBottom}
          >
            有新内容{localUnread > 1 ? `（${localUnread}）` : ''}
          </Button>
        </div>
      ) : null}
    </div>
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

function deliverableChipLabel(item: DeliverableRef): string {
  const base = item.path.split('/').pop() || item.path
  if (item.changeKind === 'deleted') return `已删除 ${base}`
  if (item.title && item.title !== item.path) return item.title
  return base
}

function DeliverableZone({
  items,
  onOpenFileRef,
}: {
  items: readonly DeliverableRef[]
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
}) {
  if (items.length === 0) return null
  return (
    <div
      className='flex flex-col gap-2'
      data-testid='timeline-deliverables'
      data-kind='deliverables'
    >
      <p className='tl-chrome text-muted-foreground'>
        本次产出 · {items.length} 个文件
      </p>
      <div className='flex flex-wrap gap-x-3 gap-y-1.5'>
        {items.map((item) => (
          <FileReferenceChip
            key={item.path}
            label={deliverableChipLabel(item)}
            path={item.path}
            onOpen={
              onOpenFileRef
                ? (info) =>
                    onOpenFileRef({
                      path: info.path ?? item.path,
                      line: info.line,
                      label: item.path.split('/').pop() || item.path,
                    })
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

function TimelineTurnBlock({
  latestTerminal,
  streamItems,
  runActive,
  liveStatus,
  deliverables,
  onOpenFileRef,
  onRespondToQuestion,
}: {
  latestTerminal: TimelineItem | undefined
  streamItems: TimelineItem[]
  runActive: boolean
  liveStatus: string | null | undefined
  deliverables?: readonly DeliverableRef[]
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}) {
  const blocks = deriveTimelineView(streamItems)
  const hasWorking = blocks.some((block) => block.kind === 'working')
  const lastWorkingIndex = blocks.findLastIndex((block) => block.kind === 'working')
  const completed = latestTerminal?.status === 'completed' && !runActive

  return (
    <div className='flex flex-col gap-2.5'>
      {runActive && !hasWorking ? (
        <WorkingBlock
          block={emptyWorkingBlock()}
          terminal={latestTerminal}
          runActive
          liveStatus={liveStatus ?? '正在思考'}
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
              liveStatus={liveStatus}
              primaryChrome={isLastWorking}
              onOpenFileRef={onOpenFileRef}
              onRespondToQuestion={onRespondToQuestion}
            />
          )
        }
        return (
          <TimelineRow
            key={block.item.id}
            item={block.item}
            runActive={runActive}
            onOpenFileRef={onOpenFileRef}
            onRespondToQuestion={onRespondToQuestion}
          />
        )
      })}

      {completed && latestTerminal && !hasWorking ? (
        <div
          className='tl-chrome pt-1 text-muted-foreground'
          data-kind='process-fold'
          data-testid={`timeline-item-${latestTerminal.id}`}
          data-category='turn-terminal'
          data-status={latestTerminal.status}
        >
          <span
            data-testid='timeline-turn-status-label'
            title={formatUsageHover(latestTerminal.meta?.usage)}
            aria-label={formatUsageHover(latestTerminal.meta?.usage)}
          >
            {chineseStatusLabel(latestTerminal)}
            {latestTerminal.meta?.durationMs != null
              ? ` ${formatDurationMs(latestTerminal.meta.durationMs)}`
              : ''}
          </span>
        </div>
      ) : null}

      {completed && deliverables && deliverables.length > 0 ? (
        <DeliverableZone items={deliverables} onOpenFileRef={onOpenFileRef} />
      ) : null}
    </div>
  )
}

function workingEntryHasRunningTool(entries: readonly WorkingEntry[]): boolean {
  return entries.some((entry) => {
    if (entry.kind === 'single') {
      return (
        (entry.item.category === 'tool-group' ||
          entry.item.category === 'command-execution') &&
        entry.item.status === 'running'
      )
    }
    return false
  })
}

function WorkingBlock({
  block,
  terminal,
  runActive,
  liveStatus,
  primaryChrome = false,
  onOpenFileRef,
  onRespondToQuestion,
}: {
  block: Extract<TimelineViewBlock, { kind: 'working' }>
  terminal: TimelineItem | undefined
  runActive: boolean
  liveStatus: string | null | undefined
  primaryChrome?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}) {
  const reduceMotion = useReducedMotion() ?? false
  const running = runActive || block.status === 'running'
  const [open, setOpen] = useState(() => running)
  const hasRunningTool = workingEntryHasRunningTool(block.items)
  const startedAtMs =
    (block.startedAt ? Date.parse(block.startedAt) : Number.NaN)
  const terminalStartedAt = readStartedAtMs(terminal)
  const clockStart = Number.isFinite(startedAtMs)
    ? startedAtMs
    : terminalStartedAt
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (running) setOpen(true)
    else setOpen(false)
  }, [running])

  useEffect(() => {
    if (!running || clockStart == null) return
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [running, clockStart])

  const elapsedMs = running
    ? clockStart != null
      ? Math.max(0, nowMs - clockStart)
      : null
    : (block.durationMs ?? terminal?.meta?.durationMs ?? null)
  const durationLabel =
    elapsedMs != null ? formatDurationMs(elapsedMs) : null
  const summaryDetail = processSummaryDetail(block.summary)
  const headerShimmer = running && !hasRunningTool
  const headerText = running
    ? (liveStatus ?? '正在思考')
    : [durationLabel ? `已处理 ${durationLabel}` : '已处理', summaryDetail]
        .filter(Boolean)
        .join(' · ')

  const statusClass = cn(
    'tl-chrome',
    running ? 'text-foreground' : 'text-muted-foreground',
  )

  const usageHover = formatUsageHover(terminal?.meta?.usage)
  const labelNode = (
    <span
      data-testid={primaryChrome ? 'timeline-turn-status-label' : undefined}
      className={cn(
        'inline-flex items-baseline gap-1',
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
      data-status={running ? 'running' : 'completed'}
      data-runtime-turn={terminal?.status}
      data-fold-open={open ? 'true' : 'false'}
    >
      {primaryChrome && terminal ? (
        <span className='sr-only' data-testid={`timeline-item-${terminal.id}`} />
      ) : null}
      <div className='flex items-center gap-2 pt-1'>
        <button
          type='button'
          className={cn(
            'inline-flex min-h-7 items-center gap-1 rounded-md border border-transparent px-0.5',
            'focus-visible:ring-2 focus-visible:ring-ring/50',
            'active:scale-[0.96] transition-transform',
            statusClass,
          )}
          aria-expanded={open}
          data-testid={primaryChrome ? 'timeline-turn-toggle' : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {labelNode}
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 opacity-70 transition-transform duration-150 ease-out',
              open ? 'rotate-0' : '-rotate-90',
            )}
            aria-hidden
          />
        </button>
      </div>
      <Separator className='opacity-80' />
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.14, ease: [0.2, 0, 0, 1] }}
            className='flex flex-col gap-0.5 border-s border-border/40 ps-3'
            data-slot='process-fold-body'
          >
            {block.items.map((entry, index) =>
              entry.kind === 'tool-cluster' ? (
                <ToolCluster
                  key={`cluster-${entry.toolKind}-${index}`}
                  toolKind={entry.toolKind}
                  items={entry.items}
                />
              ) : (
                <TimelineRow
                  key={entry.item.id}
                  item={entry.item}
                  runActive={running}
                  shimmerRunning={hasRunningTool}
                  forceToolCollapsed={entry.item.status === 'completed'}
                  onOpenFileRef={onOpenFileRef}
                  onRespondToQuestion={onRespondToQuestion}
                />
              ),
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ToolCluster({
  toolKind,
  items,
}: {
  toolKind: string
  items: TimelineItem[]
}) {
  const [open, setOpen] = useState(false)
  const title = formatToolClusterCopy(toolKind, items.length)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className='rounded-md'
        data-kind='tool-cluster'
        data-testid={`timeline-tool-cluster-${toolKind}`}
        data-expanded={open ? 'true' : 'false'}
      >
        <CollapsibleTrigger
          className={cn(
            'tl-chrome flex h-7 w-full items-center gap-2 rounded-md px-1 py-1 text-left',
            'text-foreground/85 hover:bg-wb-hover-subtle',
            'active:scale-[0.96] transition-transform',
          )}
        >
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 opacity-70 transition-transform duration-150 ease-out',
              !open && '-rotate-90',
            )}
            aria-hidden
          />
          <ToolActivityIcon kind={toolKind} />
          <span className='min-w-0 flex-1 truncate'>{title}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className='flex flex-col gap-1 pb-1'>
          {items.map((item) => (
            <ToolRow key={item.id} item={item} forceCollapsed />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function FoldableBody({
  itemId,
  body,
  markdown = false,
  muted = false,
  streaming = false,
  onOpenFileRef,
}: {
  itemId: string
  body: string
  markdown?: boolean
  muted?: boolean
  streaming?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
}) {
  const long = body.length > TIMELINE_FOLD_THRESHOLD
  const [open, setOpen] = useState(!long)
  const mdClass = muted
    ? 'tl-thought text-muted-foreground'
    : 'text-foreground'
  if (!long) {
    return markdown ? (
      <SimpleMarkdown
        source={body}
        className={mdClass}
        isAnimating={streaming}
        onOpenFileRef={onOpenFileRef}
      />
    ) : (
      <div className={cn('whitespace-pre-wrap tl-thought', muted && 'text-muted-foreground')}>
        {body}
      </div>
    )
  }
  const preview = body.slice(0, TIMELINE_FOLD_THRESHOLD)
  return (
    <div data-testid={`timeline-fold-${itemId}`}>
      {open ? (
        markdown ? (
          <SimpleMarkdown
            source={body}
            className={mdClass}
            isAnimating={streaming}
            onOpenFileRef={onOpenFileRef}
          />
        ) : (
          <div className={cn('whitespace-pre-wrap tl-thought', muted && 'text-muted-foreground')}>
            {body}
          </div>
        )
      ) : markdown ? (
        <SimpleMarkdown
          source={`${preview}…`}
          className={mdClass}
          onOpenFileRef={onOpenFileRef}
        />
      ) : (
        <div className='tl-thought whitespace-pre-wrap text-muted-foreground'>
          {preview}…
        </div>
      )}
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='mt-1 h-7 px-2 text-xs active:scale-[0.96] transition-transform'
        data-testid={`timeline-fold-toggle-${itemId}`}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '收起' : '展开全文'}
      </Button>
    </div>
  )
}

function UserBubble({ item }: { item: TimelineItem }) {
  return (
    <div
      className='flex w-full flex-col items-end'
      data-kind='user-message'
      data-testid={`timeline-item-${item.id}`}
      data-category='user-message'
    >
      <div className='tl-prose max-w-[min(100%,36rem)] [overflow-wrap:anywhere] whitespace-pre-wrap rounded-[14px] bg-muted px-3.5 py-2.5'>
        {item.body}
      </div>
    </div>
  )
}

function ToolRow({
  item,
  forceCollapsed = false,
  shimmerRunning = false,
}: {
  item: TimelineItem
  forceCollapsed?: boolean
  shimmerRunning?: boolean
}) {
  const children =
    item.meta?.children ??
    (item.body
      ? item.body
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      : [])
  const hasChildren = children.length > 0
  const wantOpen =
    !forceCollapsed && item.status !== 'completed' && hasChildren
  const [open, setOpen] = useState(wantOpen)
  useEffect(() => {
    setOpen(wantOpen)
  }, [wantOpen, item.id, item.status])

  const title = item.title ?? '工具'
  const rowContent = (
    <>
      <ToolActivityIcon kind={item.meta?.toolKind ?? item.title} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          item.status === 'running' && 'text-foreground',
          item.status === 'running' && shimmerRunning && 'wb-live-status-shimmer',
          item.status === 'error' && 'text-destructive',
        )}
        title={title}
      >
        {title}
      </span>
    </>
  )

  if (!hasChildren) {
    return (
      <div
        className='tl-chrome flex h-7 w-full items-center gap-2 rounded-md px-1 py-1 text-foreground/85'
        data-kind='tool-group'
        data-testid={`timeline-item-${item.id}`}
        data-category='tool-group'
        data-status={item.status}
        data-expanded='false'
      >
        <span className='size-3.5 shrink-0' aria-hidden />
        {rowContent}
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className='rounded-md'
        data-kind='tool-group'
        data-testid={`timeline-item-${item.id}`}
        data-category='tool-group'
        data-status={item.status}
        data-expanded={open && hasChildren ? 'true' : 'false'}
      >
        <CollapsibleTrigger
          className={cn(
            'tl-chrome flex h-7 w-full items-center gap-2 rounded-md px-1 py-1 text-left',
            'text-foreground/85 hover:bg-wb-hover-subtle',
            'active:scale-[0.96] transition-transform',
            item.status === 'running' && 'text-foreground',
          )}
          data-testid={`timeline-tool-trigger-${item.id}`}
        >
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 opacity-70 transition-transform duration-150 ease-out',
              !open && '-rotate-90',
            )}
            aria-hidden
          />
          {rowContent}
        </CollapsibleTrigger>
        <CollapsibleContent className='pb-1 ps-7'>
          <ul className='space-y-0.5 text-xs leading-5 text-muted-foreground'>
            {children.map((child, index) => (
              <li
                key={`${child}:${index}`}
                className='[overflow-wrap:anywhere] whitespace-pre-wrap font-mono'
              >
                {child}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function FileDiffCard({
  item,
  onOpenFileRef,
}: {
  item: TimelineItem
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
}) {
  const meta: TimelineItemMeta | undefined = item.meta
  const path = meta?.path ?? item.title ?? 'file'
  const additions = meta?.additions
  const deletions = meta?.deletions
  const diffLines = meta?.diffLines
  const hasDiff = Boolean(diffLines && diffLines.length > 0)

  const previewLines =
    hasDiff && diffLines
      ? diffLines.map((l) =>
          `${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}${l.text}`,
        )
      : item.body
        ? item.body.split('\n')
        : undefined

  const base = path.split('/').pop() || path

  return (
    <div data-kind={item.category} data-category={item.category}>
      <FileChangeSummaryCard
        path={path}
        additions={additions}
        deletions={deletions}
        changeKind={meta?.changeKind}
        previewLines={previewLines}
        testId={`timeline-item-${item.id}`}
        onOpen={
          onOpenFileRef
            ? (p) =>
                onOpenFileRef({
                  path: p,
                  label: base,
                })
            : undefined
        }
      />
    </div>
  )
}

function ReasoningRow({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false)
  const streaming = item.status === 'streaming'

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        data-kind='reasoning-section'
        data-testid={`timeline-item-${item.id}`}
        data-category='reasoning-section'
        data-status={item.status}
      >
        <CollapsibleTrigger className='tl-chrome flex min-h-6 w-full items-center gap-2 rounded-md px-1 py-1 text-left text-muted-foreground hover:bg-wb-hover-subtle'>
          <ChevronDown
            className={cn(
              'size-3.5 opacity-70 transition-transform duration-150 ease-out',
              !open && '-rotate-90',
            )}
            aria-hidden
          />
          <span>{streaming ? '思考中…' : '思考过程'}</span>
          {item.title && item.title !== '思考过程' ? (
            <span className='truncate opacity-70'>· {item.title}</span>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent className='tl-thought px-1 pb-1 ps-6 text-muted-foreground'>
          <FoldableBody itemId={item.id} body={item.body ?? ''} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

const TimelineRow = memo(function TimelineRow({
  item,
  runActive,
  forceToolCollapsed = false,
  shimmerRunning = false,
  onOpenFileRef,
  onRespondToQuestion,
}: {
  item: TimelineItem
  runActive: boolean
  forceToolCollapsed?: boolean
  shimmerRunning?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}) {
  switch (item.category) {
    case 'user-message':
      return <UserBubble item={item} />
    case 'assistant-message':
      return (
        <div
          className='tl-prose text-foreground'
          data-kind='assistant-message'
          data-testid={`timeline-item-${item.id}`}
          data-category='assistant-message'
          data-status={item.status}
          data-message-role={item.meta?.messageRole ?? 'final'}
        >
          <FoldableBody
            itemId={item.id}
            body={item.body ?? ''}
            markdown
            streaming={runActive && item.status === 'streaming'}
            onOpenFileRef={onOpenFileRef}
          />
          {runActive && item.status === 'streaming' ? (
            <span
              className='ms-0.5 inline-block h-[1.1em] w-[2px] translate-y-0.5 animate-pulse bg-foreground/70'
              aria-hidden
              data-testid='timeline-stream-caret'
            />
          ) : null}
        </div>
      )
    case 'reasoning-section':
      return <ReasoningRow item={item} />
    case 'plan-update':
      return <PlanUpdateCard item={item} />
    case 'tool-group':
      return (
        <ToolRow
          item={item}
          forceCollapsed={forceToolCollapsed}
          shimmerRunning={shimmerRunning}
        />
      )
    case 'command-execution':
      return (
        <div
          className='rounded-md'
          data-kind='command-execution'
          data-testid={`timeline-item-${item.id}`}
          data-category='command-execution'
          data-status={item.status}
        >
          <div className='tl-chrome flex items-center gap-2 rounded-md px-1 py-1 text-muted-foreground hover:bg-wb-hover-subtle'>
            <ToolActivityIcon kind='command' />
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-mono',
                item.status === 'running' && shimmerRunning && 'wb-live-status-shimmer',
              )}
            >
              $ {item.title}
            </span>
          </div>
          {item.body ? (
            <div className='ps-7 pb-1 font-mono text-xs leading-5 text-muted-foreground'>
              <FoldableBody itemId={item.id} body={item.body} />
            </div>
          ) : null}
        </div>
      )
    case 'file-change':
    case 'artifact':
      return <FileDiffCard item={item} onOpenFileRef={onOpenFileRef} />
    case 'source-group':
      return (
        <div
          className='tl-chrome rounded-md px-1 py-1 text-muted-foreground'
          data-kind='source-group'
          data-testid={`timeline-item-${item.id}`}
          data-category='source-group'
        >
          <div className='flex items-center gap-2 font-medium text-foreground/80'>
            <Info className='size-3.5 opacity-70' aria-hidden />
            来源{item.title ? ` · ${item.title}` : ''}
          </div>
          <div className='whitespace-pre-wrap ps-5 font-mono text-xs'>{item.body}</div>
        </div>
      )
    case 'approval-request': {
      const requestId = requestIdFromItem(item, 'approval-request:')
      const waiting = item.status === 'waiting'
      const approved = item.status === 'approved'
      return (
        <div
          className='tl-prose rounded-md border border-border/60 bg-muted/30 px-3 py-2'
          data-kind='approval-request'
          data-testid={`timeline-item-${item.id}`}
          data-category='approval-request'
          data-status={item.status}
          data-request-id={requestId}
        >
          <div className='font-medium'>
            {waiting
              ? (item.title ?? '需要审批')
              : approved
                ? '已批准'
                : item.title ?? '审批'}
          </div>
          {item.body ? (
            <div className='tl-chrome mt-1 whitespace-pre-wrap text-muted-foreground'>
              {item.body}
            </div>
          ) : null}
          {waiting ? (
            <p className='tl-chrome mt-2 text-muted-foreground'>
              请在下方选择允许或拒绝
            </p>
          ) : null}
        </div>
      )
    }
    case 'input-request': {
      const requestId = requestIdFromItem(item, 'input-request:')
      if (item.meta?.question) {
        return (
          <QuestionCard
            item={item}
            requestId={requestId}
            onRespond={onRespondToQuestion}
          />
        )
      }
      const waiting = item.status === 'waiting'
      return (
        <div
          className='tl-prose rounded-md border border-border/60 bg-muted/40 px-3 py-2'
          data-kind='input-request'
          data-testid={`timeline-item-${item.id}`}
          data-category='input-request'
          data-status={item.status}
          data-request-id={requestId}
        >
          <div className='font-medium'>{item.title ?? '需要补充信息'}</div>
          {item.body ? (
            <div className='tl-chrome mt-1 whitespace-pre-wrap text-muted-foreground'>
              {item.body}
            </div>
          ) : null}
          {waiting ? (
            <p className='tl-chrome mt-2 text-muted-foreground'>
              请在下方输入框直接回复
            </p>
          ) : (
            <div className='tl-chrome mt-1 text-muted-foreground'>已提供</div>
          )}
        </div>
      )
    }
    case 'error':
      return (
        <div
          className='tl-prose rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive'
          data-kind='error'
          data-testid={`timeline-item-${item.id}`}
          data-category='error'
        >
          <div className='font-medium'>{item.title ?? '错误'}</div>
          {item.body ? (
            <div className='tl-chrome mt-1 opacity-90'>{item.body}</div>
          ) : null}
        </div>
      )
    case 'warning':
      return (
        <div
          className='tl-chrome rounded-md border border-amber-500/30 px-3 py-2 text-muted-foreground'
          data-kind='warning'
          data-testid={`timeline-item-${item.id}`}
          data-category='warning'
        >
          <div className='font-medium'>{item.title ?? '警告'}</div>
          {item.body ? (
            <div className='mt-1 opacity-90'>{item.body}</div>
          ) : null}
        </div>
      )
    case 'turn-terminal':
      return (
        <div
          className='tl-chrome pt-1 text-muted-foreground'
          data-kind='turn-terminal'
          data-testid={`timeline-item-${item.id}`}
          data-category='turn-terminal'
          data-status={item.status}
        >
          <span data-testid='timeline-turn-status-label'>
            {chineseStatusLabel(item)}
            {item.meta?.durationMs != null
              ? ` ${formatDurationMs(item.meta.durationMs)}`
              : ''}
          </span>
        </div>
      )
    case 'unsupported-event':
      return (
        <div
          className='tl-chrome rounded-md border border-dashed border-border px-3 py-2 text-muted-foreground'
          data-kind='unsupported-event'
          data-testid={`timeline-item-${item.id}`}
          data-category='unsupported-event'
        >
          <span className='font-mono text-xs'>{item.title}</span>
          {item.body ? <span className='ms-2'>{item.body}</span> : null}
        </div>
      )
    default:
      return (
        <div
          className='tl-chrome rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-muted-foreground'
          data-kind={item.category}
          data-testid={`timeline-item-${item.id}`}
          data-category={item.category}
        >
          <span className='font-medium text-foreground/80'>
            [{item.category}]
          </span>{' '}
          {item.title ?? item.body ?? item.id}
        </div>
      )
  }
})
