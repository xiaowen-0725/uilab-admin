import type { ReactNode } from 'react'

export interface ContextPanelBlockProps {
  id: string
  title: string
  trailing?: ReactNode
  children: ReactNode
}

/** Shared chrome for Task Context Panel blocks. */
export function ContextPanelBlock({
  id,
  title,
  trailing,
  children,
}: ContextPanelBlockProps) {
  return (
    <section
      aria-labelledby={`ctx-${id}`}
      data-testid={`context-panel-block-${id}`}
    >
      <div className='mb-1.5 flex items-baseline justify-between gap-2'>
        <h3
          id={`ctx-${id}`}
          className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'
        >
          {title}
        </h3>
        {trailing}
      </div>
      {children}
    </section>
  )
}
