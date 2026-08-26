import type { ReactElement, ReactNode } from 'react'
import { ThreadThinking } from '@/components/motion/agent-thread'
import { FoldableBody } from '../foldable-body'
import type { TimelineBlockProps } from '../timeline-shared'

function reasoningBody(
  itemId: string,
  body: string,
  embeddedInProcess: boolean,
): ReactNode {
  if (!body) return null
  if (embeddedInProcess) {
    return <span className='whitespace-pre-wrap'>{body}</span>
  }
  return <FoldableBody itemId={itemId} body={body} />
}

export function ReasoningBlock({
  item,
  embeddedInProcess = false,
}: TimelineBlockProps): ReactElement | null {
  const streaming = item.status === 'streaming'
  const body = item.body ?? ''

  if (embeddedInProcess && !body && !streaming) return null

  return (
    <div
      data-kind='reasoning-section'
      data-testid={`timeline-item-${item.id}`}
      data-category='reasoning-section'
      data-status={item.status}
      data-embedded={embeddedInProcess ? 'true' : undefined}
      className={embeddedInProcess ? 'px-0.5' : undefined}
    >
      <ThreadThinking
        thinking={streaming}
        label={streaming ? '正在深度思考…' : '深度思考'}
      >
        {reasoningBody(item.id, body, embeddedInProcess)}
      </ThreadThinking>
    </div>
  )
}
