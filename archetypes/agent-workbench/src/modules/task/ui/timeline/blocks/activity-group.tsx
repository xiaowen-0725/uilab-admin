import { useState, type ReactNode } from 'react'
import {
  ConversationChevron,
  ConversationIcon,
  conversationSentenceClassName,
  conversationSentenceChevronClassName,
} from '@/components/icons/conversation-icon'
import { cn } from '@/lib/utils'
import {
  formatActivityGroupCopy,
  formatActivityGroupRunningCopy,
} from '../../../projection/tool-activity-copy'
import type { TimelineItem } from '../../../projection/types'
import { ToolRow } from './tool-row'

function isToolRunning(item: TimelineItem): boolean {
  return item.status === 'running' || item.status === 'streaming'
}

type ActivityGroupProps = {
  kinds: readonly string[]
  items: readonly TimelineItem[]
}

export function ActivityGroup({
  kinds,
  items,
}: ActivityGroupProps): ReactNode {
  const runningItems = items.filter(isToolRunning)
  const live = runningItems.length > 0
  const [open, setOpen] = useState(false)
  const title = live
    ? formatActivityGroupRunningCopy(
        runningItems.map((item) => item.meta?.processKind ?? 'other'),
      )
    : formatActivityGroupCopy(kinds)
  const testId = `timeline-activity-group-${kinds.join('-') || 'other'}`

  return (
    <div
      className='min-w-0'
      data-kind='activity-group'
      data-testid={testId}
      data-expanded={open ? 'true' : 'false'}
      data-status={live ? 'running' : 'completed'}
    >
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={conversationSentenceClassName('tl-chrome h-[26px] min-w-0')}
      >
        <ConversationIcon name='list-controls' className='me-1.5 opacity-80' />
        <span
          className={cn(
            'min-w-0 truncate',
            live && 'text-foreground wb-live-status-shimmer',
          )}
        >
          {title}
        </span>
        <ConversationChevron
          open={open}
          className={cn('ms-1', conversationSentenceChevronClassName(open))}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-[var(--tl-motion-base)] ease-[var(--tl-ease-standard)] motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className='overflow-hidden'>
          <div className='relative flex flex-col ps-[22px] before:absolute before:bottom-1 before:start-[7px] before:top-1 before:w-px before:bg-border'>
            {items.map((item) => (
              <ToolRow key={item.id} item={item} forceCollapsed />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
