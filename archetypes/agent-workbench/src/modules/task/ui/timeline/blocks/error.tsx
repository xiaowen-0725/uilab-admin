import { useState, type ReactElement } from 'react'
import { humanizeRuntimeFailure } from '../../../runtime/runtime-honesty'
import type { TimelineBlockProps } from '../timeline-shared'

export function ErrorBlock({
  item,
  onRetryTurn,
}: TimelineBlockProps): ReactElement {
  const copy = humanizeRuntimeFailure(item.body ?? item.title)
  const [pending, setPending] = useState(false)

  function handleRetry(): void {
    if (!onRetryTurn || pending) return
    setPending(true)
    void onRetryTurn()
  }

  return (
    <div
      className='flex flex-col items-start gap-1'
      data-kind='error'
      data-testid={`timeline-item-${item.id}`}
      data-category='error'
      role='alert'
    >
      <div className='tl-prose text-foreground'>
        <p className='m-0'>{copy.title}</p>
        {copy.body ? (
          <p className='tl-chrome m-0 mt-1 text-foreground/55'>{copy.body}</p>
        ) : null}
      </div>
      {onRetryTurn ? (
        <button
          type='button'
          className='tl-chrome -mx-1 rounded-sm px-1 text-foreground/70 transition-colors duration-[var(--tl-motion-fast)] ease-[var(--tl-ease-standard)] hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'
          data-testid='timeline-retry-turn'
          disabled={pending}
          onClick={handleRetry}
        >
          {pending ? '正在重试' : '重试本轮'}
        </button>
      ) : null}
    </div>
  )
}
