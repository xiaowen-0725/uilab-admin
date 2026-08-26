import type { TimelineItem } from '../../projection/types'
import type { QuestionRespondHandler } from './question-card'

/** User intent to open a file/path in Work Surface (Session open, not Host mutate). */
export type TimelineOpenFileRef = {
  path?: string
  line?: number
  label: string
}

export interface TimelineBlockProps {
  item: TimelineItem
  runActive: boolean
  forceToolCollapsed?: boolean
  shimmerRunning?: boolean
  /** Reasoning inside the process fold — no second disclosure. */
  embeddedInProcess?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  onRespondToQuestion?: QuestionRespondHandler
}

export function requestIdFromItem(item: TimelineItem, prefix: string): string {
  if (item.id.startsWith(prefix)) return item.id.slice(prefix.length)
  return item.id
}

export function readStartedAtMs(item: TimelineItem | undefined): number | null {
  if (!item?.meta) return null
  if (item.meta.startedAt) {
    const t = Date.parse(item.meta.startedAt)
    return Number.isFinite(t) ? t : null
  }
  const path = item.meta.path
  if (path?.startsWith('startedAt:')) {
    const t = Date.parse(path.slice('startedAt:'.length))
    return Number.isFinite(t) ? t : null
  }
  return null
}
