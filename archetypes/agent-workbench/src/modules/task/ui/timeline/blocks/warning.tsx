import type { TimelineBlockProps } from '../timeline-shared'

export function WarningBlock({ item }: TimelineBlockProps) {
  return (
    <div
      className='tl-chrome rounded-md border border-amber-500/30 px-3 py-2 text-muted-foreground'
      data-kind='warning'
      data-testid={`timeline-item-${item.id}`}
      data-category='warning'
    >
      <div className='font-medium'>{item.title ?? '警告'}</div>
      {item.body ? <div className='mt-1 opacity-90'>{item.body}</div> : null}
    </div>
  )
}
