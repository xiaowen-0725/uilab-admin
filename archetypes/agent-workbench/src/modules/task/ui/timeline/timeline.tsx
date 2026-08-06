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
import {
  ChevronDown,
  FileText,
  Globe,
  Info,
  Terminal,
  Wrench,
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
} from '../../projection/types'
import { LiveStatusLine } from '../live-status-line'
import { FileChangeSummaryCard } from '../markdown/file-change-summary-card'
import { SimpleMarkdown } from '../markdown/simple-markdown'
import {
  runtimeHonestyCopy,
  type RuntimeHonestyMode,
} from '../../runtime/runtime-honesty'
import { groupTimelineIntoTurns } from './group-timeline-turns'

export const TIMELINE_FOLD_THRESHOLD = 600

export interface TimelineProps {
  readModel: TaskReadModel
  onApprove?: (requestId: string) => void
  onReject?: (requestId: string) => void
  onProvideInput?: (requestId: string, text: string) => void
  onRetryTurn?: () => void
  onFollowModeChange?: (mode: 'follow' | 'user-pinned') => void
  /** Honesty mode for banner / HITL copy. Default fake. */
  honestyMode?: RuntimeHonestyMode
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

/** Turn chrome label without embedding duration (duration appended once by header). */
function chineseStatusLabel(item: TimelineItem): string {
  if (item.status === 'completed' || item.title === '已处理') {
    return '已处理'
  }
  if (item.title && /[\u4e00-\u9fff]/.test(item.title)) {
    if (item.title === '处理中' || item.title === '正在思考') {
      return item.status === 'running' ? '已处理' : item.title
    }
    return item.title
  }
  switch (item.status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '已处理'
    case 'completed':
      return '已处理'
    case 'cancelled':
      return '已取消'
    case 'failed':
      return '失败'
    case 'cancelling':
      return '取消中'
    case 'waiting_for_approval':
      return '等待审批'
    case 'waiting_for_input':
      return '等待输入'
    case 'interrupted':
      return '已中断'
    default:
      return item.title ?? item.status ?? '运行'
  }
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
  onApprove,
  onReject,
  onProvideInput,
  onRetryTurn,
  onFollowModeChange,
  honestyMode = 'fake',
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [followMode, setFollowMode] = useState<'follow' | 'user-pinned'>(
    readModel.scroll.followMode ?? 'follow',
  )
  const [localUnread, setLocalUnread] = useState(0)
  const prevLenRef = useRef(readModel.timeline.length)

  const runActive = isActiveRunStatus(readModel.runStatus)
  const runAttr =
    runActive || readModel.runStatus
      ? readModel.runStatus ?? 'unknown'
      : undefined

  // Chronological turn segments (user → chrome → tools/assistant per turn).
  const turnSegments = groupTimelineIntoTurns(readModel.timeline)

  const setMode = useCallback(
    (mode: 'follow' | 'user-pinned') => {
      setFollowMode(mode)
      if (mode === 'follow') setLocalUnread(0)
      onFollowModeChange?.(mode)
    },
    [onFollowModeChange],
  )

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (isNearBottom(el)) {
      if (followMode !== 'follow') setMode('follow')
    } else if (followMode === 'follow') {
      setMode('user-pinned')
    }
  }, [followMode, setMode])

  // Smart scroll: follow last item; pinned accumulates unread.
  useEffect(() => {
    const len = readModel.timeline.length
    const grew = len > prevLenRef.current
    prevLenRef.current = len
    if (!grew) return
    if (followMode === 'follow') {
      bottomRef.current?.scrollIntoView({ block: 'end' })
      setLocalUnread(0)
    } else {
      setLocalUnread((n) => n + 1)
    }
  }, [readModel.timeline, readModel.projectionVersion, followMode])

  const jumpToBottom = useCallback(() => {
    setMode('follow')
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [setMode])

  const honesty = runtimeHonestyCopy(honestyMode)

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
      data-honesty-mode={honestyMode}
      aria-label={honesty.timelineAriaLabel}
      onScroll={onScroll}
    >
      <div className='mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-1'>
        {/* Quiet honesty: thin line, never dominate first paint */}
        <p
          className='mb-2 text-[11px] leading-4 text-muted-foreground/80'
          data-testid='runtime-honesty-banner'
        >
          {honesty.banner}
        </p>

        {readModel.recoveryRequired ? (
          <p
            className='mb-2 text-[12px] text-amber-600 dark:text-amber-400'
            data-testid='runtime-recovery-notice'
          >
            {honesty.recovery}
          </p>
        ) : null}

        {readModel.runStatus === 'waiting_for_approval' ? (
          <p
            className='mb-2 text-[12px] text-muted-foreground'
            data-testid='runtime-approval-notice'
          >
            {honesty.waitingApproval}
          </p>
        ) : null}

        {readModel.runStatus === 'waiting_for_input' ? (
          <p
            className='mb-2 text-[12px] text-muted-foreground'
            data-testid='runtime-input-notice'
          >
            当前 Run 等待补充输入。请在下方 Composer 发送澄清内容（将路由到
            provideRunInput）。
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
                      onApprove={onApprove}
                      onReject={onReject}
                      onProvideInput={onProvideInput}
                    />
                  ))}

                  <TimelineTurnBlock
                    latestTerminal={seg.terminal}
                    streamItems={seg.bodyItems}
                    runActive={runActive && isLast}
                    onApprove={onApprove}
                    onReject={onReject}
                    onProvideInput={onProvideInput}
                    liveStatus={isLast ? readModel.liveStatus : null}
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
 * Codex process fold: header「已处理 Xs」(live while running) + body tools/commentary.
 * Final assistant renders outside; fold auto-collapses when completed.
 */
function TimelineTurnBlock({
  latestTerminal,
  streamItems,
  runActive,
  onApprove,
  onReject,
  onProvideInput,
  liveStatus,
}: {
  latestTerminal: TimelineItem | undefined
  streamItems: TimelineItem[]
  runActive: boolean
  onApprove?: (requestId: string) => void
  onReject?: (requestId: string) => void
  onProvideInput?: (requestId: string, text: string) => void
  liveStatus: string | null | undefined
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

  // Avoid double-painting the same tool line as liveStatus.
  const liveForBar =
    runActive && liveStatus
      ? processItems.some(
          (i) =>
            (i.category === 'tool-group' ||
              i.category === 'command-execution') &&
            i.status === 'running' &&
            i.title === liveStatus,
        )
        ? null
        : liveStatus
      : null

  // Always show process chrome when a run-terminal exists (even text-only turns).
  const showFold = Boolean(latestTerminal)

  return (
    <>
      {showFold && latestTerminal ? (
        <ProcessFold
          terminal={latestTerminal}
          runActive={runActive}
          open={foldOpen}
          onOpenChange={setFoldOpen}
          canToggle={!runActive && processItems.length > 0}
        >
          {processItems.map((item) => (
            <TimelineRow
              key={item.id}
              item={item}
              runActive={runActive}
              onApprove={onApprove}
              onReject={onReject}
              onProvideInput={onProvideInput}
              forceToolCollapsed={
                (!runActive && completed) || item.status === 'completed'
              }
            />
          ))}
          {runActive && processItems.length === 0 ? (
            <LiveStatusLine
              status={liveForBar ?? '正在思考'}
              className='mt-1'
            />
          ) : null}
        </ProcessFold>
      ) : null}

      {[...finalItems, ...orphanItems].map((item) => (
        <TimelineRow
          key={item.id}
          item={item}
          runActive={runActive}
          onApprove={onApprove}
          onReject={onReject}
          onProvideInput={onProvideInput}
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
  const display =
    baseLabel === '已处理' && durationLabel
      ? `已处理 ${durationLabel}`
      : durationLabel
        ? `${baseLabel} ${durationLabel}`
        : baseLabel

  const statusClass = cn(
    'text-[14px] font-[445] leading-[21px]',
    !runActive && terminal.status === 'completed'
      ? 'text-[color:color(srgb_0.988235_0.988235_0.988235_/_0.65)]'
      : statusTone(terminal.status),
  )

  const header = canToggle ? (
    <button
      type='button'
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-transparent',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
        statusClass,
      )}
      aria-expanded={open}
      data-testid='timeline-turn-toggle'
      onClick={() => onOpenChange(!open)}
    >
      <span data-testid='timeline-run-status-label'>{display}</span>
      <ChevronDown
        className={cn(
          'size-3.5 shrink-0 opacity-70 transition-transform',
          open ? 'rotate-0' : '-rotate-90',
        )}
        aria-hidden
      />
    </button>
  ) : (
    <span className={statusClass} data-testid='timeline-run-status-label'>
      {display}
    </span>
  )

  return (
    <div
      className='mb-2'
      data-kind='process-fold'
      data-testid={`timeline-item-${terminal.id}`}
      data-category='run-terminal'
      data-status={terminal.status}
      data-runtime-run={terminal.status}
      data-fold-open={open ? 'true' : 'false'}
    >
      <div className='mb-1 flex items-center gap-2 pt-1'>{header}</div>
      <Separator className='mb-2' />
      {open ? <div className='flex flex-col gap-0.5'>{children}</div> : null}
    </div>
  )
}

function FoldableBody({
  itemId,
  body,
  markdown = false,
}: {
  itemId: string
  body: string
  markdown?: boolean
}) {
  const long = body.length > TIMELINE_FOLD_THRESHOLD
  const [open, setOpen] = useState(!long)
  if (!long) {
    return markdown ? (
      <SimpleMarkdown source={body} className='text-foreground' />
    ) : (
      <div className='whitespace-pre-wrap text-sm'>{body}</div>
    )
  }
  const preview = body.slice(0, TIMELINE_FOLD_THRESHOLD)
  return (
    <div data-testid={`timeline-fold-${itemId}`}>
      {open ? (
        markdown ? (
          <SimpleMarkdown source={body} className='text-foreground' />
        ) : (
          <div className='whitespace-pre-wrap text-sm'>{body}</div>
        )
      ) : markdown ? (
        <SimpleMarkdown source={`${preview}…`} className='text-foreground' />
      ) : (
        <div className='whitespace-pre-wrap text-sm text-muted-foreground'>
          {preview}…
        </div>
      )}
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='mt-1 h-7 px-2 text-xs'
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
      <div className='max-w-[77%] rounded-2xl bg-muted px-3 py-2 text-sm leading-[22px]'>
        {item.body}
      </div>
    </div>
  )
}

function ToolKindIcon({ kind }: { kind?: string }) {
  const cls = 'size-3.5 shrink-0 opacity-80'
  const k = (kind ?? '').toLowerCase()
  if (/search|web|搜索/.test(k)) return <Globe className={cls} aria-hidden />
  if (/read|file|读取/.test(k)) return <FileText className={cls} aria-hidden />
  if (/command|shell|cmd|命令/.test(k))
    return <Terminal className={cls} aria-hidden />
  return <Wrench className={cls} aria-hidden />
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
  return (
    <Collapsible open={open && hasChildren} onOpenChange={setOpen}>
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
            item.status === 'running' && 'text-foreground',
          )}
          data-testid={`timeline-tool-trigger-${item.id}`}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className='size-3.5 shrink-0 opacity-70' />
            ) : (
              <ChevronDown className='size-3.5 shrink-0 -rotate-90 opacity-70' />
            )
          ) : (
            <span className='size-3.5 shrink-0' />
          )}
          <ToolKindIcon kind={item.meta?.toolKind ?? item.title} />
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              item.status === 'running' && 'text-foreground',
            )}
          >
            {item.title ?? '工具'}
          </span>
        </CollapsibleTrigger>
        {hasChildren ? (
          <CollapsibleContent className='pb-1 ps-7'>
            <ul className='space-y-0.5 text-[12px] leading-5 text-muted-foreground'>
              {children.map((c, i) => (
                <li key={i} className='truncate font-mono'>
                  {c}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
  )
}

function FileDiffCard({ item }: { item: TimelineItem }) {
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

  return (
    <div data-kind='file-change' data-category='file-change'>
      <FileChangeSummaryCard
        path={path}
        additions={additions}
        deletions={deletions}
        previewLines={previewLines}
        testId={`timeline-item-${item.id}`}
      />
    </div>
  )
}

function TimelineRow({
  item,
  runActive,
  onApprove,
  onReject,
  forceToolCollapsed = false,
}: {
  item: TimelineItem
  runActive: boolean
  onApprove?: (requestId: string) => void
  onReject?: (requestId: string) => void
  /** Reserved for inline input UI; Composer currently owns provideRunInput. */
  onProvideInput?: (requestId: string, text: string) => void
  forceToolCollapsed?: boolean
}) {
  switch (item.category) {
    case 'user-message':
      return <UserBubble item={item} />
    case 'assistant-message':
      return (
        <div
          className='mb-3 py-1 text-[14px] leading-[22px]'
          data-kind='assistant-message'
          data-testid={`timeline-item-${item.id}`}
          data-category='assistant-message'
          data-status={item.status}
        >
          <FoldableBody
            itemId={item.id}
            body={item.body ?? ''}
            markdown
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
      return (
        <Collapsible defaultOpen={(item.body?.length ?? 0) < TIMELINE_FOLD_THRESHOLD}>
          <div
            className='mb-1'
            data-kind='reasoning-section'
            data-testid={`timeline-item-${item.id}`}
            data-category='reasoning-section'
            data-status={item.status}
          >
            <CollapsibleTrigger className='flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-wb-hover-subtle'>
              <ChevronDown className='size-3.5 opacity-70' />
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
    case 'plan-update':
      return (
        <div
          className='mb-2 rounded-md px-1 py-1.5 text-sm'
          data-kind='plan-update'
          data-testid={`timeline-item-${item.id}`}
          data-category='plan-update'
        >
          <div className='mb-1 text-[12px] font-medium text-muted-foreground'>
            计划{item.title ? ` · ${item.title}` : ''}
          </div>
          <div className='whitespace-pre-wrap text-[12px] text-muted-foreground'>
            {item.body}
          </div>
        </div>
      )
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
            <Terminal className='size-3.5 shrink-0 opacity-80' aria-hidden />
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
      return <FileDiffCard item={item} />
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
      const requestId = requestIdFromItem(item, 'approval-request:')
      const waiting = item.status === 'waiting'
      return (
        <div
          className='mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm'
          data-kind='approval-request'
          data-testid={`timeline-item-${item.id}`}
          data-category='approval-request'
          data-status={item.status}
          data-request-id={requestId}
        >
          <div className='font-medium'>{item.title ?? '需要审批'}</div>
          {item.body ? (
            <div className='mt-1 whitespace-pre-wrap text-xs text-muted-foreground'>
              {item.body}
            </div>
          ) : null}
          {waiting ? (
            <div className='mt-2 flex gap-2'>
              <Button
                type='button'
                size='sm'
                data-testid={`timeline-approve-${requestId}`}
                onClick={() => onApprove?.(requestId)}
              >
                允许一次
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                data-testid={`timeline-reject-${requestId}`}
                onClick={() => onReject?.(requestId)}
              >
                拒绝
              </Button>
            </div>
          ) : (
            <div className='mt-1 text-xs text-muted-foreground'>
              {item.status === 'approved'
                ? '已允许'
                : item.status === 'rejected'
                  ? '已拒绝'
                  : item.status}
            </div>
          )}
        </div>
      )
    }
    case 'input-request': {
      const requestId = requestIdFromItem(item, 'input-request:')
      const waiting = item.status === 'waiting'
      return (
        <div
          className='mb-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm'
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
              请在 Composer 中输入并发送（将调用 provideRunInput）
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
          {item.title ?? item.body}
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
