import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { ContextSection } from '../../model/types'
import type { PlanSnapshot } from '../../projection/plan-snapshot'
import { ContextPanelBlock } from './context-panel-block'
import { PlanBlock } from './plan-block'

export interface ContextPanelProps {
  open: boolean
  plan?: PlanSnapshot | null
  sections: ContextSection[]
  onClose?: () => void
}

/**
 * Adaptive Context Panel visual card (shadcn Button / ScrollArea / Separator).
 * Placement (reserved vs overlay) is controlled by CSS container queries on the Task Surface.
 * Card sizes to content up to available-height max (not default full-height).
 *
 * Blocks are isomorphic slots: Plan is always first; `sections` and future
 * blocks reuse {@link ContextPanelBlock}.
 */
export function ContextPanel({
  open,
  plan = null,
  sections,
  onClose,
}: ContextPanelProps) {
  const progress = plan?.progress

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
        <header className='flex shrink-0 items-center justify-between gap-2 px-3 py-2'>
          <h2 className='text-sm font-semibold'>任务上下文</h2>
          {onClose ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-7 px-2 text-xs text-muted-foreground'
              onClick={onClose}
              aria-label='关闭上下文面板'
            >
              关闭
            </Button>
          ) : null}
        </header>
        <Separator />
        <ScrollArea className='min-h-0 flex-1'>
          <div className='flex flex-col gap-4 p-3'>
            <ContextPanelBlock
              id='plan'
              title='计划'
              trailing={
                progress && progress.total > 0 ? (
                  <span
                    data-testid='context-panel-plan-progress'
                    className='text-xs tabular-nums text-muted-foreground'
                    aria-label={`进度 ${progress.completed}/${progress.total}`}
                  >
                    {progress.completed}/{progress.total}
                  </span>
                ) : null
              }
            >
              <PlanBlock plan={plan} />
            </ContextPanelBlock>
            {sections.map((section) => (
              <ContextPanelBlock key={section.id} id={section.id} title={section.title}>
                <ul className='flex flex-col gap-1 text-sm'>
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className='rounded-md bg-muted/40 px-2 py-1 text-foreground'
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </ContextPanelBlock>
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}
