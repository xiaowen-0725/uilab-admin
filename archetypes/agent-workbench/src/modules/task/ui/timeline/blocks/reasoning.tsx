import { useState } from 'react'
import { ConversationChevron } from '@/components/icons/conversation-icon'
import { ThreadThinking } from '@/components/motion/agent-thread'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { FoldableBody } from '../foldable-body'
import type { TimelineBlockProps } from '../timeline-shared'

export function ReasoningBlock({
  item,
  embeddedInProcess = false,
}: TimelineBlockProps) {
  const [open, setOpen] = useState(false)
  const streaming = item.status === 'streaming'
  const body = item.body ?? ''

  if (embeddedInProcess) {
    if (!body && !streaming) return null
    return (
      <div
        data-kind='reasoning-section'
        data-testid={`timeline-item-${item.id}`}
        data-category='reasoning-section'
        data-status={item.status}
        data-embedded='true'
        className='px-0.5'
      >
        <ThreadThinking
          thinking={streaming}
          label={streaming ? '正在深度思考…' : '深度思考'}
        >
          {body ? <span className='whitespace-pre-wrap'>{body}</span> : null}
        </ThreadThinking>
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        data-kind='reasoning-section'
        data-testid={`timeline-item-${item.id}`}
        data-category='reasoning-section'
        data-status={item.status}
      >
        <CollapsibleTrigger className='tl-chrome inline-flex min-h-6 max-w-full items-center gap-2 self-start px-1 py-1 text-left text-muted-foreground hover:text-foreground'>
          <ConversationChevron open={open} className='opacity-70' />
          <span>{streaming ? '思考中…' : '思考过程'}</span>
          {item.title && item.title !== '思考过程' ? (
            <span className='truncate opacity-70'>· {item.title}</span>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent className='tl-thought px-1 pb-1 text-muted-foreground'>
          <FoldableBody itemId={item.id} body={body} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
