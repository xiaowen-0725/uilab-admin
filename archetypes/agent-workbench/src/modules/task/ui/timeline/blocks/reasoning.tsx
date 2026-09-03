import { useState, type ReactElement } from 'react'
import {
  ConversationChevron,
  ConversationIcon,
  conversationSentenceClassName,
  conversationSentenceChevronClassName,
} from '@/components/icons/conversation-icon'
import { cn } from '@/lib/utils'
import { reasoningLabel, reasoningPreview } from '../reasoning-presentation'
import type { TimelineBlockProps } from '../timeline-shared'

export function ReasoningBlock({
  item,
  embeddedInProcess = false,
}: TimelineBlockProps): ReactElement | null {
  const streaming = item.status === 'streaming'
  const body = item.body ?? ''
  const preview = reasoningPreview(body)
  const canOpen = Boolean(body)
  const [open, setOpen] = useState(false)
  const label = reasoningLabel(streaming)

  if (embeddedInProcess && !body && !streaming) return null

  const header = (
    <>
      <ConversationIcon name='brain' className='size-4 shrink-0 opacity-80' />
      <span
        className={cn(
          'shrink-0 font-medium',
          streaming && 'text-foreground wb-live-status-shimmer',
        )}
      >
        {label}
      </span>
      {!open && preview ? (
        <span
          className='min-w-0 truncate text-foreground/40'
          data-slot='reasoning-preview'
        >
          {preview}
        </span>
      ) : null}
    </>
  )

  if (!canOpen) {
    return (
      <div
        data-kind='reasoning-section'
        data-testid={`timeline-item-${item.id}`}
        data-category='reasoning-section'
        data-status={item.status}
        data-embedded={embeddedInProcess ? 'true' : undefined}
        data-expanded='false'
        className={embeddedInProcess ? 'px-0.5' : undefined}
      >
        <div
          className={conversationSentenceClassName(
            'tl-chrome h-[26px] gap-1.5 px-0.5',
          )}
        >
          {header}
        </div>
      </div>
    )
  }

  return (
    <div
      data-kind='reasoning-section'
      data-testid={`timeline-item-${item.id}`}
      data-category='reasoning-section'
      data-status={item.status}
      data-embedded={embeddedInProcess ? 'true' : undefined}
      data-expanded={open ? 'true' : 'false'}
      className={embeddedInProcess ? 'px-0.5' : undefined}
    >
      <button
        type='button'
        aria-expanded={open}
        data-testid={`timeline-reasoning-trigger-${item.id}`}
        onClick={() => setOpen((value) => !value)}
        className={conversationSentenceClassName(
          cn('tl-chrome h-[26px] min-w-0 gap-1.5 px-0.5', streaming && 'text-foreground'),
        )}
      >
        {header}
        <ConversationChevron
          open={open}
          data-slot='reasoning-row-chevron'
          className={conversationSentenceChevronClassName(open)}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-[200ms] ease-[var(--ease-drawer-close)] motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
        data-slot='reasoning-collapse'
      >
        <div className='min-h-0 overflow-hidden'>
          <div
            className='tl-thought max-h-48 overflow-y-auto whitespace-pre-wrap pt-1 text-foreground/55'
            data-slot='reasoning-body'
          >
            {body}
          </div>
        </div>
      </div>
    </div>
  )
}
