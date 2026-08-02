import { useState, type ReactNode } from 'react'
import { ChevronDown, Globe, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { StreamViewModel, ToolRowView } from '../../model/stream-events'
import { SimpleMarkdown } from '../markdown/simple-markdown'

export interface ExecutionStreamProps {
  stream: StreamViewModel
}

/**
 * Capture-driven task event stream UI (replay only).
 * shadcn: Alert disclosure, Badge turn status, Collapsible tool rows.
 */
export function ExecutionStream({ stream }: ExecutionStreamProps) {
  return (
    <div
      className='flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3'
      data-slot='execution-stream'
      data-testid='execution-stream'
      data-capture-id={stream.captureId}
      aria-label='任务事件流（回放）'
    >
      <div className='mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-1'>
        <Alert
          className='mb-2 border-dashed bg-muted/40'
          data-testid='fixture-disclosure'
        >
          <Info aria-hidden />
          <AlertDescription>
            事件流回放（capture:{' '}
            <span className='font-mono'>{stream.captureId}</span>
            ）— 非真实 Agent Runtime
          </AlertDescription>
        </Alert>

        {stream.userMessages.map((msg) => (
          <div
            key={msg.id}
            className='mb-3 flex w-full flex-col items-end py-2'
            data-kind='user'
            data-testid={`stream-user-${msg.id}`}
          >
            <div className='max-w-[77%] rounded-2xl bg-muted px-3 py-2 text-sm leading-[22px]'>
              {msg.text}
            </div>
          </div>
        ))}

        <TurnHeader turn={stream.turn} />
        <Separator className='mb-2' />

        <div className='flex flex-col gap-0.5 py-1' data-testid='stream-tool-rows'>
          {stream.turn.toolRows.map((row) => (
            <ToolRow key={row.id} row={row} />
          ))}
        </div>

        {stream.turn.markdownParts.map((md, index) => (
          <SimpleMarkdown
            key={`md-${index}`}
            source={md}
            className='text-foreground'
          />
        ))}
      </div>
    </div>
  )
}

function TurnHeader({ turn }: { turn: StreamViewModel['turn'] }) {
  const completed = turn.status === 'completed'
  return (
    <div
      className='mb-2 flex items-center gap-2 pt-1'
      data-testid='stream-turn-status'
      data-status={turn.status}
    >
      <span
        className={cn(
          'text-sm font-medium',
          completed ? 'text-muted-foreground' : 'text-foreground'
        )}
        data-testid='stream-status-label'
      >
        {turn.statusLabel}
      </span>
      {turn.durationLabel ? (
        <Badge
          variant='secondary'
          className='tabular-nums'
          data-testid='stream-status-duration'
        >
          {turn.durationLabel}
        </Badge>
      ) : null}
      {completed ? (
        <ChevronDown className='size-4 text-muted-foreground' aria-hidden />
      ) : null}
    </div>
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
      <Globe className='size-4 shrink-0 opacity-80' aria-hidden />
      <span
        className={
          row.status === 'running' ? 'animate-pulse text-foreground' : undefined
        }
      >
        {row.label}
      </span>
      {row.detail ? (
        <span className='min-w-0 truncate font-mono text-[12px] opacity-70'>
          {row.detail}
        </span>
      ) : null}
      {chevron}
    </>
  )
}

function ToolRow({ row }: { row: ToolRowView }) {
  const [open, setOpen] = useState(row.defaultExpanded)
  const hasItems = row.items.length > 0
  const rowProps = {
    className: 'py-1' as const,
    'data-testid': `stream-tool-${row.id}`,
    'data-tool-status': row.status,
  }

  if (!hasItems) {
    return (
      <div {...rowProps}>
        <div className='flex w-full items-center gap-2 py-0.5 text-sm text-muted-foreground'>
          <ToolRowLabel row={row} />
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} {...rowProps}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 py-0.5 text-left text-sm text-muted-foreground',
          'hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
        )}
      >
        <ToolRowLabel
          row={row}
          chevron={
            <ChevronDown
              className={cn(
                'ms-auto size-3.5 shrink-0 transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          }
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className='mt-1 flex flex-col gap-1 border-l border-border ps-4 ms-2 text-xs text-muted-foreground'>
          {row.items.map((item) => (
            <li key={item} className='truncate'>
              {item}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
