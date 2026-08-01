import type { ContextSection } from '../../model/types'

export interface ContextPanelProps {
  open: boolean
  sections: ContextSection[]
  onClose?: () => void
}

/**
 * Adaptive Context Panel visual card.
 * Placement (reserved vs overlay) is controlled by CSS container queries on the Task Surface.
 * Card sizes to content up to available-height max (not default full-height).
 */
export function ContextPanel({ open, sections, onClose }: ContextPanelProps) {
  return (
    <aside
      className='context-panel-slot'
      data-open={open ? 'true' : 'false'}
      data-slot='context-panel'
      data-testid='context-panel'
      aria-hidden={!open}
      aria-label='任务上下文面板'
    >
      <div className='context-panel-card min-h-0'>
        <header className='flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2'>
          <h2 className='text-sm font-semibold'>任务上下文</h2>
          {onClose ? (
            <button
              type='button'
              className='rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
              onClick={onClose}
              aria-label='关闭上下文面板'
            >
              关闭
            </button>
          ) : null}
        </header>
        <div className='min-h-0 space-y-4 overflow-y-auto p-3'>
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`ctx-${section.id}`}>
              <h3
                id={`ctx-${section.id}`}
                className='mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase'
              >
                {section.title}
              </h3>
              <ul className='space-y-1 text-sm'>
                {section.items.map((item) => (
                  <li
                    key={item}
                    className='rounded-md bg-muted/40 px-2 py-1 text-foreground'
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </aside>
  )
}
