import type { TimelineBlockProps } from '../timeline-shared'

export function ErrorBlock({ item }: TimelineBlockProps) {
  return (
    <div
      className='tl-prose rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive'
      data-kind='error'
      data-testid={`timeline-item-${item.id}`}
      data-category='error'
    >
      <div className='font-medium'>{item.title ?? '错误'}</div>
      {item.body ? (
        <div className='tl-chrome mt-1 opacity-90'>{item.body}</div>
      ) : null}
    </div>
  )
}
