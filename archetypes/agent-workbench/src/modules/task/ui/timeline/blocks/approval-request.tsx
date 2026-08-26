import type { TimelineBlockProps } from '../timeline-shared'
import { requestIdFromItem } from '../timeline-shared'

export function ApprovalRequestBlock({ item }: TimelineBlockProps) {
  const requestId = requestIdFromItem(item, 'approval-request:')
  const waiting = item.status === 'waiting'
  const approved = item.status === 'approved'
  return (
    <div
      className='tl-prose rounded-md border border-border/60 bg-muted/30 px-3 py-2'
      data-kind='approval-request'
      data-testid={`timeline-item-${item.id}`}
      data-category='approval-request'
      data-status={item.status}
      data-request-id={requestId}
    >
      <div className='font-medium'>
        {waiting
          ? (item.title ?? '需要审批')
          : approved
            ? '已批准'
            : item.title ?? '审批'}
      </div>
      {item.body ? (
        <div className='tl-chrome mt-1 whitespace-pre-wrap text-muted-foreground'>
          {item.body}
        </div>
      ) : null}
      {waiting ? (
        <p className='tl-chrome mt-2 text-muted-foreground'>
          请在下方选择允许或拒绝
        </p>
      ) : null}
    </div>
  )
}
