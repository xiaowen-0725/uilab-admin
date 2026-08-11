import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  LoaderCircle,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { StreamViewModel, ToolRowView } from '../../model/stream-events'
import { LiveStatusLine } from '../live-status-line'
import {
  FileChangeSummaryCard,
  parsePlusMinus,
} from '../markdown/file-change-summary-card'
import { SimpleMarkdown } from '../markdown/simple-markdown'
import { ToolActivityIcon } from '../tool-activity-icon'

export interface ExecutionStreamProps {
  stream: StreamViewModel
  /** Progressive timed replay in progress. */
  playing?: boolean
  /** 0..1 along capture timeline. */
  progress?: number
}

/**
 * Capture-driven task event stream UI with optional progressive playback.
 * Codex content-area contract:
 * - Running: tools visible (expanded while running)
 * - Completed: tools collapsed by default; 「已处理」toggles trajectory
 * - Prose + file cards remain outside tool fold
 */
export function ExecutionStream({
  stream,
  playing = false,
  progress,
}: ExecutionStreamProps) {
  const running = stream.turn.status === 'running' || playing
  const completed = stream.turn.status === 'completed' && !playing
  const hasTools = stream.turn.toolRows.length > 0

  /**
   * Codex S-done-collapsed: completed turns hide tool trajectory by default.
   * Running always shows tools.
   */
  const [toolsExpanded, setToolsExpanded] = useState(() => !completed)

  useEffect(() => {
    if (running) setToolsExpanded(true)
    else if (completed) setToolsExpanded(false)
  }, [running, completed, stream.turn.status, stream.captureId])

  const showTools = running || toolsExpanded
  const fileCards = deriveFileCardsFromTools(stream.turn.toolRows)

  return (
    <div
      className='flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3'
      data-slot='execution-stream'
      data-testid='execution-stream'
      data-capture-id={stream.captureId}
      data-playing={playing ? 'true' : 'false'}
      data-tools-expanded={showTools ? 'true' : 'false'}
      data-progress={
        progress !== undefined ? String(Math.round(progress * 100)) : undefined
      }
      aria-label='任务事件流（时序回放）'
    >
      <div className='mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-1'>
        <p
          className='mb-2 text-[11px] leading-4 text-muted-foreground/80'
          data-testid='fixture-disclosure'
        >
          {playing ? (
            <>
              <span className='inline-flex items-center gap-1'>
                <LoaderCircle className='size-3 animate-spin' aria-hidden />
                时序回放
              </span>
              {progress !== undefined ? (
                <span className='ms-1.5 tabular-nums'>
                  {Math.round(progress * 100)}%
                </span>
              ) : null}
              <span className='ms-1.5 font-mono opacity-70'>
                {stream.captureId}
              </span>
            </>
          ) : (
            <>
              事件流回放 · <span className='font-mono'>{stream.captureId}</span>
              · 非真实 Agent Runtime
            </>
          )}
        </p>

        {stream.userMessages.map((msg) => (
          <div
            key={msg.id}
            className='mb-3 flex w-full flex-col items-end py-2'
            data-kind='user'
            data-testid={`stream-user-${msg.id}`}
          >
            <div className='max-w-[77%] rounded-2xl bg-muted px-3.5 py-2.5 text-[14px] leading-[22px] text-foreground'>
              {msg.text}
            </div>
          </div>
        ))}

        <TurnHeader
          turn={stream.turn}
          streaming={running}
          completed={completed}
          toolsExpanded={showTools}
          canToggle={completed && hasTools}
          onToggleTools={() => setToolsExpanded((v) => !v)}
        />
        <Separator className='mb-2' />

        {showTools ? (
          <div
            className='flex flex-col gap-0.5 py-1'
            data-testid='stream-tool-rows'
            data-collapsed='false'
          >
            {stream.turn.toolRows.map((row) => (
              <ToolRow
                key={row.id}
                row={row}
                forceCollapsed={completed || row.status !== 'running'}
              />
            ))}
          </div>
        ) : (
          <div
            className='hidden'
            data-testid='stream-tool-rows'
            data-collapsed='true'
            aria-hidden
          />
        )}

        <div
          className='prose-stream space-y-0 text-[14px] leading-[22px] text-foreground'
          data-testid='stream-markdown'
        >
          {stream.turn.markdownParts.map((md, index) => (
            <SimpleMarkdown
              key={`md-${index}`}
              source={md}
              className='text-foreground'
              isAnimating={Boolean(running)}
            />
          ))}
          {running && stream.turn.markdownParts.length > 0 ? (
            <span
              className='ms-0.5 inline-block h-[1.1em] w-[2px] translate-y-0.5 animate-pulse bg-foreground/70'
              aria-hidden
              data-testid='stream-caret'
            />
          ) : null}
        </div>

        {/* Codex: file summary cards stay visible when tool trajectory is collapsed */}
        {fileCards.length > 0 ? (
          <div className='mt-3 flex flex-col gap-2' data-testid='stream-file-cards'>
            {fileCards.map((card) => (
              <FileChangeSummaryCard
                key={card.id}
                path={card.path}
                additions={card.additions}
                deletions={card.deletions}
                previewLines={card.previewLines}
                testId={`stream-file-card-${card.id}`}
              />
            ))}
          </div>
        ) : null}

        <LiveStatusLine status={running ? stream.liveStatus : null} className='mt-2' />
      </div>
    </div>
  )
}

function deriveFileCardsFromTools(rows: ToolRowView[]): Array<{
  id: string
  path: string
  additions?: number
  deletions?: number
  previewLines?: string[]
}> {
  const out: Array<{
    id: string
    path: string
    additions?: number
    deletions?: number
    previewLines?: string[]
  }> = []
  for (const row of rows) {
    if (row.status !== 'completed') continue
    const isWrite =
      /已写入|已编辑|write|edit/i.test(row.label) ||
      /\+\d+/.test(row.detail ?? '') ||
      /\+\d+/.test(row.label)
    if (!isWrite) continue
    const path =
      row.items.find((i) => isLikelyPath(i)) ||
      (row.detail && isLikelyPath(row.detail.split(/\s+/)[0] ?? '')
        ? row.detail.split(/\s+/)[0]
        : undefined) ||
      extractPathFromLabel(row.label) ||
      'file'
    const pm = parsePlusMinus(row.detail) 
    const previewLines = row.items.filter(
      (i) => i.startsWith('+') || i.startsWith('-') || i.startsWith(' '),
    )
    out.push({
      id: row.id,
      path: path!,
      additions: pm.additions,
      deletions: pm.deletions,
      previewLines: previewLines.length ? previewLines : row.items.slice(0, 8),
    })
  }
  return out
}

function isLikelyPath(s: string): boolean {
  const t = s.trim()
  return (
    /^[\w./@-]+\.\w{1,10}$/.test(t) ||
    /^[\w./@-]+\/[\w./@-]+$/.test(t)
  )
}

function extractPathFromLabel(label: string): string | undefined {
  const m = label.match(
    /([\w./@-]+\.\w{1,10})/,
  )
  return m?.[1]
}

function TurnHeader({
  turn,
  streaming,
  completed,
  toolsExpanded,
  canToggle,
  onToggleTools,
}: {
  turn: StreamViewModel['turn']
  streaming: boolean
  completed: boolean
  toolsExpanded: boolean
  canToggle: boolean
  onToggleTools: () => void
}) {
  let label = turn.statusLabel
  if (streaming && turn.status === 'running') {
    label =
      turn.statusLabel === '处理中' ? '正在思考' : turn.statusLabel
  } else if (completed && turn.durationLabel) {
    label = `已处理 ${turn.durationLabel}`
  }

  const statusClass = cn(
    'text-[14px] font-[445] leading-[21px]',
    completed
      ? 'text-[color:color(srgb_0.988235_0.988235_0.988235_/_0.65)]'
      : 'text-foreground',
  )

  if (canToggle) {
    return (
      <div className='mb-1 pt-1' data-testid='stream-turn-status' data-status='completed'>
        <button
          type='button'
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-transparent',
            'focus-visible:ring-2 focus-visible:ring-ring/50',
            statusClass,
          )}
          aria-expanded={toolsExpanded}
          data-testid='stream-turn-toggle'
          onClick={onToggleTools}
        >
          <span data-testid='stream-status-label'>{label}</span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 opacity-70 transition-transform',
              toolsExpanded ? 'rotate-0' : '-rotate-90',
            )}
            aria-hidden
          />
        </button>
        {turn.durationLabel ? (
          <span className='sr-only' data-testid='stream-status-duration'>
            {turn.durationLabel}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className='mb-1 flex items-center gap-2 pt-1'
      data-testid='stream-turn-status'
      data-status={streaming ? 'running' : turn.status}
    >
      {streaming ? (
        <LoaderCircle
          className='size-3.5 animate-spin text-muted-foreground'
          aria-hidden
        />
      ) : null}
      {streaming ? (
        <span data-testid='stream-status-label'>
          <span className='wb-live-status-shimmer'>{label}</span>
        </span>
      ) : (
        <span className={statusClass} data-testid='stream-status-label'>
          {label}
        </span>
      )}
      {turn.durationLabel && completed ? (
        <span className='sr-only' data-testid='stream-status-duration'>
          {turn.durationLabel}
        </span>
      ) : null}
    </div>
  )
}

function ToolRow({
  row,
  forceCollapsed,
}: {
  row: ToolRowView
  /** When true, children stay collapsed (Codex single-line summary). */
  forceCollapsed: boolean
}) {
  const hasChildren = row.items.length > 0
  const wantOpen =
    !forceCollapsed && (row.defaultExpanded || row.status === 'running')
  const [open, setOpen] = useState(wantOpen)

  useEffect(() => {
    setOpen(wantOpen)
  }, [wantOpen, row.id, row.status])

  return (
    <Collapsible open={open && hasChildren} onOpenChange={setOpen}>
      <div
        className='rounded-md'
        data-testid={`stream-tool-${row.id}`}
        data-status={row.status}
        data-expanded={open && hasChildren ? 'true' : 'false'}
      >
        <CollapsibleTrigger
          className={cn(
            'flex h-7 w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[13px] leading-4 font-[445]',
            'text-foreground/85 hover:bg-wb-hover-subtle',
            row.status === 'running' && 'text-foreground',
          )}
          disabled={!hasChildren}
        >
          <ToolRowLabel
            row={row}
            chevron={
              hasChildren ? (
                open ? (
                  <ChevronDown className='size-3.5 shrink-0 opacity-70' />
                ) : (
                  <ChevronDown className='size-3.5 shrink-0 -rotate-90 opacity-70' />
                )
              ) : (
                <span className='size-3.5 shrink-0' />
              )
            }
          />
        </CollapsibleTrigger>
        {hasChildren ? (
          <CollapsibleContent className='pb-1 ps-7'>
            <ul className='space-y-0.5 font-mono text-[12px] leading-4 text-muted-foreground'>
              {row.items.map((item, i) => (
                <li key={i} className='truncate'>
                  {item}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
  )
}

function ToolRowLabel({
  row,
  chevron,
}: {
  row: ToolRowView
  chevron?: ReactNode
}) {
  return (
    <>
      {chevron}
      <ToolActivityIcon kind={row.toolKind} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          row.status === 'running' && 'text-foreground',
        )}
      >
        {row.label}
      </span>
      {row.detail ? (
        <span className='hidden max-w-[40%] truncate text-[11px] opacity-70 sm:inline'>
          {row.detail}
        </span>
      ) : null}
    </>
  )
}
