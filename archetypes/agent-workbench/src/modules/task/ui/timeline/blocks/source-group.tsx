import { ConversationIcon } from '@/components/icons/conversation-icon'
import type { TimelineBlockProps } from '../timeline-shared'

/** Replay-only: v2 dropped `source.grouped`; no fake Sources chrome. */
export function SourceGroupBlock({ item }: TimelineBlockProps) {
  return (
    <div
      className='tl-chrome rounded-md px-1 py-1 text-muted-foreground'
      data-kind='source-group'
      data-testid={`timeline-item-${item.id}`}
      data-category='source-group'
    >
      <div className='flex items-center gap-2 font-medium text-foreground/80'>
        <ConversationIcon name='link' className='opacity-70' />
        来源{item.title ? ` · ${item.title}` : ''}
      </div>
      <div className='whitespace-pre-wrap ps-5 font-mono text-xs'>{item.body}</div>
    </div>
  )
}
