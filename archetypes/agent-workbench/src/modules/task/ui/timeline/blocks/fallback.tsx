import type { TimelineBlockProps } from '../timeline-shared'

export function FallbackBlock({ item }: TimelineBlockProps) {
  return (
    <div
      className='tl-chrome rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-muted-foreground'
      data-kind={item.category}
      data-testid={`timeline-item-${item.id}`}
      data-category={item.category}
    >
      <span className='font-medium text-foreground/80'>
        [{item.category}]
      </span>{' '}
      {item.title ?? item.body ?? item.id}
    </div>
  )
}
