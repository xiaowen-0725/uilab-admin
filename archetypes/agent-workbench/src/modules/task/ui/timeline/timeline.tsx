/**
 * Timeline — render TaskReadModel.timeline (Phase 4C–4F).
 * Codex-aligned density: user → turn chrome → tools/reasoning → assistant + live status.
 * UI never mutates Run status; presentation only.
 *
 * 4D: reasoning / plan / tool / command / file / source / approval / input / error
 * 4F: long-body fold (>600) + smart scroll (follow vs user-pinned)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
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
import type { RunStatus } from '../../model/lifecycle'
import type {
  TaskReadModel,
  TimelineItem,
  TimelineItemMeta,
  ProcessSummary,
} from '../../projection/types'
import { LiveStatusLine } from '../live-status-line'
import { FileChangeSummaryCard } from '../markdown/file-change-summary-card'
import { SimpleMarkdown } from '../markdown/simple-markdown'
import { runtimeHonestyCopy } from '../../runtime/runtime-honesty'
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

function isActiveRunStatus(status: RunStatus | null): boolean {
  if (!status) return false
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'waiting_for_approval' ||
    status === 'waiting_for_input' ||
    status === 'cancelling'
  )
}

function statusTone(status: string | undefined): string {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    return 'text-muted-foreground'
  }
  if (
    status === 'running' ||
    status === 'queued' ||
    status === 'cancelling' ||
    status === 'waiting_for_approval' ||
    status === 'waiting_for_input'
  ) {
    return 'text-foreground'
  }
  return 'text-foreground'
}

/**
 * Turn chrome label without embedding duration (duration appended once by header).
 *
 * Status wins over title for active runs. Projection may historically stamp title
 * 「已处理」while status is still `running` (Codex-shaped "Worked for Xs"); in Chinese
 * that past-tense reads as completed — never show 「已处理」until status is completed.
 * Align present-tense with ExecutionStream / liveStatus (「正在思考」/「处理中」).
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

/** Process-fold body: tools + commentary + reasoning (not final assistant). */
function isProcessFoldItem(item: TimelineItem): boolean {
  if (
    item.category === 'tool-group' ||
    item.category === 'command-execution' ||
    item.category === 'reasoning-section' ||
    item.category === 'plan-update' ||
    item.category === 'source-group' ||
    item.category === 'file-change'
  ) {
    return true
  }
  if (item.category === 'assistant-message') {
    return item.meta?.messageRole === 'commentary'
  }
  return false
}

function isFinalAssistantItem(item: TimelineItem): boolean {
  return (
    item.category === 'assistant-message' &&
    item.meta?.messageRole !== 'commentary'
  )
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

  const runActive = isActiveRunStatus(readModel.runStatus)
  const runAttr =
    runActive || readModel.runStatus
      ? readModel.runStatus ?? 'unknown'
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

  // Follow actual rendered height, not only item count: output.delta updates an
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
      data-runtime-run={runAttr}
      data-run-status={readModel.runStatus ?? undefined}
      data-recovery={readModel.recoveryRequired ? 'true' : undefined}
      data-follow-mode={followMode}
      data-honesty-mode="voltagent"
      aria-label={honesty.timelineAriaLabel}
      onScroll={onScroll}
    >
      <div
        ref={contentRef}
        className='mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-1'
      >
        <span
          className='sr-only'
          role='status'
          aria-live='polite'
          data-testid='timeline-run-announcement'
        >
          {readModel.runStatus === 'completed'
            ? '回复已完成'
            : readModel.runStatus === 'failed'
              ? '回复失败'
              : ''}
        </span>
        {/* Product UI: no visible honesty/status chrome; keep live regions for a11y/tests */}
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

        {readModel.runStatus === 'waiting_for_approval' ? (
          <p
            className='sr-only'
            role='status'
            aria-live='polite'
            data-testid='runtime-approval-notice'
          >
            {honesty.waitingApproval}
          </p>
        ) : null}

        {readModel.runStatus === 'waiting_for_input' ? (
          <p
            className='sr-only'
            role='status'
            aria-live='polite'
            data-testid='runtime-input-notice'
          >
            {honesty.waitingInput}
          </p>
        ) : null}

        {readModel.runStatus === 'failed' && onRetryTurn ? (
          <div className='mb-2 flex items-center gap-2'>
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
            暂无时间线条目。发送消息后将显示用户消息与 Fake 运行结果。
          </p>
        ) : (
          <>
            {/* Per-turn: user → chrome → tools/reasoning → assistant (chronological) */}
            {turnSegments.map((seg, index) => {
              const isLast = index === turnSegments.length - 1
              return (
                <div
                  key={seg.key}
                  className='flex flex-col gap-1'
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
                    onOpenFileRef={onOpenFileRef}
                    onRespondToQuestion={onRespondToQuestion}
                  />
                </div>
              )
            })}
          </>
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

/**
 * Codex process fold: header「正在思考/处理中 Xs」while run active; 「已处理 Xs」when complete.
 * Final assistant renders outside; fold auto-collapses when completed.
 */
function TimelineTurnBlock({
  latestTerminal,
  streamItems,
  runActive,
  liveStatus,
  onOpenFileRef,
  onRespondToQuestion,
}: {
  latestTerminal: TimelineItem | undefined
  streamItems: TimelineItem[]
  runActive: boolean
  liveStatus: string | null | undefined
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}) {
  const completed = latestTerminal?.status === 'completed' && !runActive
  const processItems = streamItems.filter(isProcessFoldItem)
  const finalItems = streamItems.filter(
    (i) =>
      isFinalAssistantItem(i) ||
      i.category === 'approval-request' ||
      i.category === 'input-request' ||
      i.category === 'error' ||
      i.category === 'warning' ||
      i.category === 'unsupported-event',
  )
  // Legacy assistant without messageRole lands in finalItems via isFinalAssistantItem.
  const orphanItems = streamItems.filter(
    (i) => !processItems.includes(i) && !finalItems.includes(i),
  )

  const [foldOpen, setFoldOpen] = useState(() => !completed)

  useEffect(() => {
    if (runActive) setFoldOpen(true)
    else if (completed) setFoldOpen(false)
  }, [runActive, completed, latestTerminal?.id])

  const hasRunningTool = processItems.some(
    (i) =>
      (i.category === 'tool-group' || i.category === 'command-execution') &&
      i.status === 'running',
  )
  // better-ui: never dual-paint tool row + live bar. Bootstrap only when
  // process body is empty (pre-tool thinking).
  const liveForBar =
    runActive && !hasRunningTool && processItems.length === 0
      ? (liveStatus ?? '正在思考')
      : null

  // Always show process chrome when a run-terminal exists.
  const showFold = Boolean(latestTerminal)
  // Chevron while running (expanded) or completed with process body.
  const canToggle = processItems.length > 0 || runActive

  return (
    <>
      {showFold && latestTerminal ? (
        <ProcessFold
          terminal={latestTerminal}
          runActive={runActive}
          open={foldOpen}
          onOpenChange={setFoldOpen}
          canToggle={canToggle}
        >
          {processItems.map((item) => (
            <TimelineRow
              key={item.id}
              item={item}
              runActive={runActive}
              forceToolCollapsed={
                (!runActive && completed) || item.status === 'completed'
              }
              onOpenFileRef={onOpenFileRef}
              onRespondToQuestion={onRespondToQuestion}
            />
          ))}
          {liveForBar ? (
            // Shimmer only for bootstrap「正在思考」(no open tool row).
            <LiveStatusLine status={liveForBar} className='mt-1' />
          ) : null}
        </ProcessFold>
      ) : null}

      {[...finalItems, ...orphanItems].map((item) => (
        <TimelineRow
          key={item.id}
          item={item}
          runActive={runActive}
          onOpenFileRef={onOpenFileRef}
          onRespondToQuestion={onRespondToQuestion}
        />
      ))}
    </>
  )
}

function ProcessFold({
  terminal,
  runActive,
  open,
  onOpenChange,
  canToggle,
  children,
}: {
  terminal: TimelineItem
  runActive: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  canToggle: boolean
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion() ?? false
  const startedAtMs = readStartedAtMs(terminal)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!runActive || startedAtMs == null) return
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [runActive, startedAtMs])

  const elapsedMs = runActive
    ? startedAtMs != null
      ? Math.max(0, nowMs - startedAtMs)
      : null
    : (terminal.meta?.durationMs ?? null)

  const baseLabel = chineseStatusLabel(terminal)
  const durationLabel =
    elapsedMs != null ? formatDurationMs(elapsedMs) : null
  const processSummary = terminal.meta?.processSummary
  const summaryDetail = processSummaryDetail(processSummary)

  const statusClass = cn(
    'text-[14px] font-[445] leading-[21px]',
    !runActive && terminal.status === 'completed'
      ? 'text-muted-foreground'
      : statusTone(terminal.status),
  )

  const labelNode = (
    <span data-testid='timeline-run-status-label' className='inline-flex items-baseline gap-1'>
      <span>{baseLabel}</span>
      {durationLabel ? (
        <span className='tabular-nums'>{durationLabel}</span>
      ) : null}
      {processSummary && processSummary.stepCount > 0 ? (
        <span>· {processSummary.stepCount} 个动作</span>
      ) : null}
    </span>
  )

  const header = canToggle ? (
    <button
      type='button'
      className={cn(
        'inline-flex min-h-7 items-center gap-1 rounded-md border border-transparent px-0.5',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
        'active:scale-[0.96] transition-transform',
        statusClass,
      )}
      aria-expanded={open}
      data-testid='timeline-turn-toggle'
      onClick={() => onOpenChange(!open)}
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
  ) : (
    <span className={statusClass}>{labelNode}</span>
  )

  return (
    <div
      className='mb-3'
      data-kind='process-fold'
      data-testid={`timeline-item-${terminal.id}`}
      data-category='run-terminal'
      data-status={terminal.status}
      data-runtime-run={terminal.status}
      data-fold-open={open ? 'true' : 'false'}
    >
      <div className='mb-1 flex items-center gap-2 pt-1'>{header}</div>
      {!open && summaryDetail ? (
        <p className='mb-1 text-[12px] leading-5 text-muted-foreground/80'>
          {summaryDetail}
        </p>
      ) : null}
      <Separator className='mb-2 opacity-80' />
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.14, ease: [0.2, 0, 0, 1] }}
            className={cn(
              'flex flex-col gap-0.5 border-s border-border/40 ps-3',
              'text-[13px]',
            )}
            data-slot='process-fold-body'
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
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
    ? 'text-[13px] leading-[20px] text-muted-foreground'
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
      <div className={cn('whitespace-pre-wrap text-sm', muted && 'text-muted-foreground')}>
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
          <div className={cn('whitespace-pre-wrap text-sm', muted && 'text-muted-foreground')}>
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
        <div className='whitespace-pre-wrap text-sm text-muted-foreground'>
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
      className='mb-3 flex w-full flex-col items-end py-2'
      data-kind='user-message'
      data-testid={`timeline-item-${item.id}`}
      data-category='user-message'
    >
      <div className='max-w-[77%] [overflow-wrap:anywhere] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm leading-[22px]'>
        {item.body}
      </div>
    </div>
  )
}

function ToolRow({
  item,
  forceCollapsed = false,
}: {
  item: TimelineItem
  forceCollapsed?: boolean
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
        className='flex h-7 w-full items-center gap-2 rounded-md px-1 py-1 text-[13px] leading-4 font-[445] text-foreground/85'
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
            'flex h-7 w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[13px] leading-4 font-[445]',
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
          <ul className='space-y-0.5 text-[12px] leading-5 text-muted-foreground'>
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
    <div data-kind='file-change' data-category='file-change'>
      <FileChangeSummaryCard
        path={path}
        additions={additions}
        deletions={deletions}
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
  const [open, setOpen] = useState(
    item.status === 'streaming' ||
      (item.body?.length ?? 0) < TIMELINE_FOLD_THRESHOLD,
  )

  useEffect(() => {
    if (item.status === 'streaming') setOpen(true)
  }, [item.status])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className='mb-1'
        data-kind='reasoning-section'
        data-testid={`timeline-item-${item.id}`}
        data-category='reasoning-section'
        data-status={item.status}
      >
        <CollapsibleTrigger className='flex min-h-7 w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-wb-hover-subtle'>
          <ChevronDown
            className={cn(
              'size-3.5 opacity-70 transition-transform duration-150 ease-out',
              !open && '-rotate-90',
            )}
            aria-hidden
          />
          <span>思考过程</span>
          {item.title && item.title !== '思考过程' ? (
            <span className='truncate opacity-70'>· {item.title}</span>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent className='px-1 pb-1 ps-6 text-[12px] text-muted-foreground'>
          <FoldableBody itemId={item.id} body={item.body ?? ''} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function TimelineRow({
  item,
  runActive,
  forceToolCollapsed = false,
  onOpenFileRef,
  onRespondToQuestion,
}: {
  item: TimelineItem
  runActive: boolean
  forceToolCollapsed?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}) {
  switch (item.category) {
    case 'user-message':
      return <UserBubble item={item} />
    case 'assistant-message': {
      const isCommentary = item.meta?.messageRole === 'commentary'
      return (
        <div
          className={cn(
            'mb-2 py-1',
            isCommentary
              ? 'text-[13px] leading-[20px] text-muted-foreground'
              : 'mb-3 text-[14px] leading-[22px] text-foreground',
          )}
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
            muted={isCommentary}
            streaming={runActive && item.status === 'streaming'}
            onOpenFileRef={onOpenFileRef}
          />
          {runActive && item.status === 'streaming' ? (
            <span
              className={cn(
                'ms-0.5 inline-block h-[1.1em] w-[2px] translate-y-0.5 animate-pulse',
                isCommentary ? 'bg-muted-foreground/70' : 'bg-foreground/70',
              )}
              aria-hidden
              data-testid='timeline-stream-caret'
            />
          ) : null}
        </div>
      )
    }
    case 'reasoning-section':
      return <ReasoningRow item={item} />
    case 'plan-update':
      return <PlanUpdateCard item={item} />
    case 'tool-group':
      return <ToolRow item={item} forceCollapsed={forceToolCollapsed} />
    case 'command-execution':
      return (
        <div
          className='mb-1 rounded-md'
          data-kind='command-execution'
          data-testid={`timeline-item-${item.id}`}
          data-category='command-execution'
          data-status={item.status}
        >
          <div className='flex items-center gap-2 rounded-md px-1 py-1.5 text-[13px] text-muted-foreground hover:bg-wb-hover-subtle'>
            <ToolActivityIcon kind='command' />
            <span className='min-w-0 flex-1 truncate font-mono'>
              $ {item.title}
            </span>
          </div>
          {item.body ? (
            <div className='ps-7 pb-1 font-mono text-[12px] text-muted-foreground'>
              <FoldableBody itemId={item.id} body={item.body} />
            </div>
          ) : null}
        </div>
      )
    case 'file-change':
      return <FileDiffCard item={item} onOpenFileRef={onOpenFileRef} />
    case 'source-group':
      return (
        <div
          className='mb-1 rounded-md px-1 py-1.5 text-[12px] text-muted-foreground'
          data-kind='source-group'
          data-testid={`timeline-item-${item.id}`}
          data-category='source-group'
        >
          <div className='mb-0.5 flex items-center gap-2 font-medium text-foreground/80'>
            <Info className='size-3.5 opacity-70' aria-hidden />
            来源{item.title ? ` · ${item.title}` : ''}
          </div>
          <div className='whitespace-pre-wrap ps-5 font-mono'>{item.body}</div>
        </div>
      )
    case 'approval-request': {
      // Waiting HITL stays in ApprovalDock only; resolved rows show reason in Timeline.
      if (item.status === 'waiting') return null
      const requestId = requestIdFromItem(item, 'approval-request:')
      const approved = item.status === 'approved'
      return (
        <div
          className='mb-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm'
          data-kind='approval-request'
          data-testid={`timeline-item-${item.id}`}
          data-category='approval-request'
          data-status={item.status}
          data-request-id={requestId}
        >
          <div className='font-medium'>
            {approved ? '已批准' : item.title ?? '审批'}
          </div>
          {item.body ? (
            <div className='mt-1 whitespace-pre-wrap text-xs text-muted-foreground'>
              {item.body}
            </div>
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
          className='mb-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm'
          data-kind='input-request'
          data-testid={`timeline-item-${item.id}`}
          data-category='input-request'
          data-status={item.status}
          data-request-id={requestId}
        >
          <div className='font-medium'>{item.title ?? '需要补充信息'}</div>
          {item.body ? (
            <div className='mt-1 whitespace-pre-wrap text-xs text-muted-foreground'>
              {item.body}
            </div>
          ) : null}
          {waiting ? (
            <p className='mt-2 text-xs text-muted-foreground'>
              请在下方输入框直接回复
            </p>
          ) : (
            <div className='mt-1 text-xs text-muted-foreground'>已提供</div>
          )}
        </div>
      )
    }
    case 'error':
      return (
        <div
          className='mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive'
          data-kind='error'
          data-testid={`timeline-item-${item.id}`}
          data-category='error'
        >
          <div className='font-medium'>{item.title ?? '错误'}</div>
          {item.body ? (
            <div className='mt-1 text-xs opacity-90'>{item.body}</div>
          ) : null}
        </div>
      )
    case 'warning':
      return (
        <div
          className='mb-2 rounded-md border border-amber-500/30 px-3 py-2 text-xs text-muted-foreground'
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
    case 'run-terminal':
      // Normally rendered via ProcessFold; keep a minimal fallback if orphaned.
      return (
        <div
          className='mb-1 pt-1 text-[14px] font-[445] text-muted-foreground'
          data-kind='run-terminal'
          data-testid={`timeline-item-${item.id}`}
          data-category='run-terminal'
          data-status={item.status}
        >
          <span data-testid='timeline-run-status-label'>
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
          className='mb-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground'
          data-kind='unsupported-event'
          data-testid={`timeline-item-${item.id}`}
          data-category='unsupported-event'
        >
          <span className='font-mono'>{item.title}</span>
          {item.body ? <span className='ms-2'>{item.body}</span> : null}
        </div>
      )
    default:
      return (
        <div
          className='mb-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground'
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
}
