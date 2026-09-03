import { useState, type ReactElement } from 'react'
import {
  ConversationChevron,
  ConversationIcon,
  conversationSentenceClassName,
  conversationSentenceChevronClassName,
} from '@/components/icons/conversation-icon'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { TimelineItem } from '../../../projection/types'
import { ToolActivityIcon } from '../../tool-activity-icon'
import {
  commandInputText,
  commandRunStatus,
  commandRunStatusLabel,
  presentCommandOutput,
  type CommandRunStatus,
} from '../command-presentation'
import type { TimelineBlockProps } from '../timeline-shared'

function commandRowAttrs(item: TimelineItem, expanded: boolean) {
  return {
    'data-kind': 'command-execution',
    'data-testid': `timeline-item-${item.id}`,
    'data-category': 'command-execution',
    'data-status': item.status,
    'data-expanded': expanded ? 'true' : 'false',
  } as const
}

function CommandRunGlyph({
  status,
}: {
  status: CommandRunStatus
}): ReactElement | null {
  if (status === 'success') {
    return <ConversationIcon name='check' className='size-3.5 opacity-70' />
  }
  if (status === 'failed') {
    return <ConversationIcon name='close' className='size-3.5' />
  }
  return null
}

function CommandInputCard({
  command,
  output,
  runStatus,
}: {
  command?: string
  output?: string
  runStatus: CommandRunStatus
}): ReactElement {
  return (
    <div
      className='w-full max-w-[min(100%,36rem)] rounded-2xl bg-neutral-100 px-3.5 py-3 dark:bg-white/8'
      data-slot='command-input-card'
    >
      <div className='font-mono text-[11px] leading-4 text-muted-foreground'>
        bash
      </div>
      {command ? (
        <pre
          className='mt-1.5 whitespace-pre-wrap break-all font-mono text-[13px] leading-5 text-foreground'
          data-slot='command-input'
        >
          {command}
        </pre>
      ) : null}
      {output ? (
        <pre className='mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-muted-foreground'>
          {output}
        </pre>
      ) : null}
      <div
        className={cn(
          'mt-3 flex items-center gap-1 text-xs',
          runStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground',
        )}
        data-slot='command-run-status'
        data-status={runStatus}
      >
        <span>{commandRunStatusLabel(runStatus)}</span>
        <CommandRunGlyph status={runStatus} />
      </div>
    </div>
  )
}

export function CommandBlock({ item }: TimelineBlockProps): ReactElement {
  const command = commandInputText(item)
  const output = presentCommandOutput(item.body)
  const canOpen = Boolean(command || output)
  const [open, setOpen] = useState(false)
  const runStatus = commandRunStatus(item.status)
  const running = runStatus === 'running'
  const title = item.title?.trim() || '命令'

  const header = (
    <>
      <ToolActivityIcon kind='command' />
      <span
        className={cn(
          'min-w-0 truncate',
          running && 'text-foreground wb-live-status-shimmer',
          runStatus === 'failed' && 'text-destructive',
        )}
        title={title}
      >
        {title}
      </span>
    </>
  )

  if (!canOpen) {
    return (
      <div
        className='tl-chrome inline-flex h-[26px] max-w-full items-center gap-1.5 self-start px-0.5 text-black/50 dark:text-white/50'
        {...commandRowAttrs(item, false)}
      >
        {header}
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div {...commandRowAttrs(item, open)}>
        <CollapsibleTrigger
          className={conversationSentenceClassName(
            cn('tl-chrome h-[26px] gap-1.5 px-0.5', running && 'text-foreground'),
          )}
          data-testid={`timeline-command-trigger-${item.id}`}
        >
          {header}
          <ConversationChevron
            open={open}
            data-slot='command-row-chevron'
            className={conversationSentenceChevronClassName(open)}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className='pb-1 ps-6'>
          <CommandInputCard
            command={command}
            output={output}
            runStatus={runStatus}
          />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
