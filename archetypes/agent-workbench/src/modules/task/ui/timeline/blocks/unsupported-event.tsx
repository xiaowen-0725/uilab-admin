import type { TimelineBlockProps } from '../timeline-shared'

export function UnsupportedEventBlock({ item }: TimelineBlockProps) {
  return (
    <div
      className='tl-chrome rounded-md border border-dashed border-border px-3 py-2 text-muted-foreground'
      data-kind='unsupported-event'
      data-testid={`timeline-item-${item.id}`}
      data-category='unsupported-event'
    >
      <span className='font-mono text-xs'>{item.title}</span>
      {item.body ? <span className='ms-2'>{item.body}</span> : null}
    </div>
  )
}
