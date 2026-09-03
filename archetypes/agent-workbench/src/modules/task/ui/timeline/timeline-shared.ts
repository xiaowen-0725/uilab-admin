import type { TimelineItem } from '../../projection/types'
import type { QuestionRespondHandler } from './question-card'

/** User intent to open a file/path or Interactive Artifact in Work Surface. */
export type TimelineOpenFileRef = {
  path?: string
  line?: number
  label: string
  /** When `interactive`, `path` is the artifact id — never a workspace path. */
  kind?: string
}

export interface TimelineBlockProps {
  item: TimelineItem
  runActive: boolean
  forceToolCollapsed?: boolean
  shimmerRunning?: boolean
  /** Reasoning inside the process fold — no second disclosure. */
  embeddedInProcess?: boolean
  onOpenFileRef?: (info: TimelineOpenFileRef) => void
  /** Completed-turn deliverable paths — suppress paperclip chips in assistant prose. */
  plainFilePaths?: readonly string[]
  onRespondToQuestion?: QuestionRespondHandler
  /** Latest failed Run only — retry sits next to the error, not above the thread. */
  onRetryTurn?: () => void
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
