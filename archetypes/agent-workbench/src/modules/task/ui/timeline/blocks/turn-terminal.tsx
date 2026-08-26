import { formatDurationMs } from '../../../model/stream-events'
import { chineseStatusLabel, formatUsageHover } from '../chinese-status-label'
import type { TimelineBlockProps } from '../timeline-shared'

export function TurnTerminalBlock({ item }: TimelineBlockProps) {
  const usageHover = formatUsageHover(item.meta?.usage)
  return (
    <div
      className='tl-chrome pt-1 text-muted-foreground'
      data-kind='turn-terminal'
      data-testid={`timeline-item-${item.id}`}
      data-category='turn-terminal'
      data-status={item.status}
    >
      <span
        data-testid='timeline-turn-status-label'
        title={usageHover}
        aria-label={usageHover}
      >
        {chineseStatusLabel(item)}
        {item.meta?.durationMs != null
          ? ` ${formatDurationMs(item.meta.durationMs)}`
          : ''}
      </span>
    </div>
  )
}
