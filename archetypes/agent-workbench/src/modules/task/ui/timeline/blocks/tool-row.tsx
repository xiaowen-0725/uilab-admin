import { useEffect, useState, type ReactNode } from 'react'
import {
  ConversationChevron,
  conversationSentenceClassName,
  conversationSentenceChevronClassName,
} from '@/components/icons/conversation-icon'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ToolActivityIcon } from '../../tool-activity-icon'
import type { TimelineItem } from '../../../projection/types'
import { ToolStatusGlyph } from '../tool-status-glyph'

function isToolRunning(status: string | undefined): boolean {
  return status === 'running' || status === 'streaming'
}

function showLiveGlyph(status: string | undefined): boolean {
  return (
    status === 'failed' ||
    status === 'error' ||
    status === 'rejected'
  )
}

function toolRowDetails(item: TimelineItem): string[] {
  const lines = [...(item.meta?.children ?? [])]
  const path = item.meta?.path?.trim()
  if (path && !lines.includes(path)) lines.push(path)
  const additions = item.meta?.additions
  const deletions = item.meta?.deletions
  if (additions != null || deletions != null) {
    const bits: string[] = []
    if (additions != null) bits.push(`+${additions}`)
    if (deletions != null) bits.push(`−${deletions}`)
    lines.push(bits.join(' '))
  }
  if (lines.length > 0) return lines
  if (!item.body) return []
  return item.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

type ToolRowProps = {
  item: TimelineItem
  forceCollapsed?: boolean
}

export function ToolRow({
  item,
  forceCollapsed = false,
}: ToolRowProps): ReactNode {
  const children = toolRowDetails(item)
  const hasChildren = children.length > 0
  const running = isToolRunning(item.status)
  const wantOpen = !forceCollapsed && running && hasChildren
  const [open, setOpen] = useState(wantOpen)
  const [userTouched, setUserTouched] = useState(false)

  useEffect(() => {
    if (userTouched) return
    setOpen(wantOpen)
  }, [wantOpen, item.id, userTouched])

  const title = item.title ?? '工具'
  const liveGlyph = showLiveGlyph(item.status)
  const rowContent = (
    <>
      <ToolActivityIcon
        kind={item.meta?.processKind ?? item.meta?.toolKind ?? item.title}
      />
      <span
        className={cn(
          'min-w-0 truncate',
          running && 'text-foreground wb-live-status-shimmer',
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
        className='tl-chrome inline-flex h-[26px] max-w-full items-center gap-1.5 self-start px-0.5 text-black/50 dark:text-white/50'
        data-kind='tool-group'
        data-testid={`timeline-item-${item.id}`}
        data-category='tool-group'
        data-status={item.status}
        data-expanded='false'
      >
        {rowContent}
        {liveGlyph ? <ToolStatusGlyph status={item.status} /> : null}
      </div>
    )
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setUserTouched(true)
        setOpen(next)
      }}
    >
      <div
        data-kind='tool-group'
        data-testid={`timeline-item-${item.id}`}
        data-category='tool-group'
        data-status={item.status}
        data-expanded={open && hasChildren ? 'true' : 'false'}
      >
        <CollapsibleTrigger
          className={conversationSentenceClassName(
            cn(
              'tl-chrome h-[26px] gap-1.5 px-0.5',
              running && 'text-foreground',
            ),
          )}
          data-testid={`timeline-tool-trigger-${item.id}`}
        >
          {rowContent}
          <ConversationChevron
            open={open}
            data-slot='tool-row-chevron'
            className={conversationSentenceChevronClassName(open)}
          />
          {liveGlyph ? <ToolStatusGlyph status={item.status} /> : null}
        </CollapsibleTrigger>
        <CollapsibleContent className='max-h-40 overflow-y-auto pb-1 ps-6'>
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
