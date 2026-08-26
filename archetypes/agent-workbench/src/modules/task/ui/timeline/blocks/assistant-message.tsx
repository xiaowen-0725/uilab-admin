import {
  ThreadMessage,
  ThreadStreamingCaret,
} from '@/components/motion/agent-thread'
import { FoldableBody } from '../foldable-body'
import type { TimelineBlockProps } from '../timeline-shared'

export function AssistantMessageBlock({
  item,
  runActive,
  onOpenFileRef,
}: TimelineBlockProps) {
  const streaming = runActive && item.status === 'streaming'
  return (
    <div
      data-kind='assistant-message'
      data-testid={`timeline-item-${item.id}`}
      data-category='assistant-message'
      data-status={item.status}
      data-message-role={item.meta?.messageRole ?? 'final'}
    >
      <ThreadMessage>
        <FoldableBody
          itemId={item.id}
          body={item.body ?? ''}
          markdown
          streaming={streaming}
          enableFold={false}
          onOpenFileRef={onOpenFileRef}
        />
        {streaming ? (
          <span data-testid='timeline-stream-caret'>
            <ThreadStreamingCaret />
          </span>
        ) : null}
      </ThreadMessage>
    </div>
  )
}
