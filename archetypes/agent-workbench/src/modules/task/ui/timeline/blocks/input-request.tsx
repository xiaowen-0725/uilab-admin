import { QuestionCard } from '../question-card'
import type { TimelineBlockProps } from '../timeline-shared'
import { requestIdFromItem } from '../timeline-shared'

export function InputRequestBlock({
  item,
  onRespondToQuestion,
}: TimelineBlockProps) {
  const requestId = requestIdFromItem(item, 'input-request:')
  if (item.meta?.question) {
    return (
      <QuestionCard
        item={item}
        requestId={requestId}
        onRespond={onRespondToQuestion}
      />
    )
  }
  const waiting = item.status === 'waiting'
  return (
    <div
      className='tl-prose rounded-md border border-border/60 bg-muted/40 px-3 py-2'
      data-kind='input-request'
      data-testid={`timeline-item-${item.id}`}
      data-category='input-request'
      data-status={item.status}
      data-request-id={requestId}
    >
      <div className='font-medium'>{item.title ?? '需要补充信息'}</div>
      {item.body ? (
        <div className='tl-chrome mt-1 whitespace-pre-wrap text-muted-foreground'>
          {item.body}
        </div>
      ) : null}
      {waiting ? (
        <p className='tl-chrome mt-2 text-muted-foreground'>
          请在下方输入框直接回复
        </p>
      ) : (
        <div className='tl-chrome mt-1 text-muted-foreground'>已提供</div>
      )}
    </div>
  )
}
