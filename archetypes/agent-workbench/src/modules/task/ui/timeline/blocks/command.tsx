import { cn } from '@/lib/utils'
import { ToolActivityIcon } from '../../tool-activity-icon'
import { FoldableBody } from '../foldable-body'
import { ToolStatusGlyph } from '../tool-status-glyph'
import type { TimelineBlockProps } from '../timeline-shared'

export function CommandBlock({ item }: TimelineBlockProps) {
  return (
    <div
      className='rounded-md'
      data-kind='command-execution'
      data-testid={`timeline-item-${item.id}`}
      data-category='command-execution'
      data-status={item.status}
    >
      <div className='tl-chrome inline-flex h-[26px] max-w-full items-center gap-1.5 self-start px-0.5 text-black/50 dark:text-white/50'>
        <ToolStatusGlyph status={item.status} />
        <ToolActivityIcon kind='command' />
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono',
            item.status === 'running' && 'text-foreground',
          )}
        >
          $ {item.title}
        </span>
      </div>
      {item.body ? (
        <div className='ps-7 pb-1 font-mono text-xs leading-5 text-muted-foreground'>
          <FoldableBody itemId={item.id} body={item.body} />
        </div>
      ) : null}
    </div>
  )
}
