import { ThreadUserMessage } from '@/components/motion/agent-thread'
import type { TimelineBlockProps } from '../timeline-shared'

export function UserMessageBlock({ item }: TimelineBlockProps) {
  return (
    <div
      className='min-w-0'
      data-kind='user-message'
      data-testid={`timeline-item-${item.id}`}
      data-category='user-message'
      data-scroll-anchor='user'
    >
      <ThreadUserMessage>
        <span className='whitespace-pre-wrap'>{item.body}</span>
      </ThreadUserMessage>
    </div>
  )
}
