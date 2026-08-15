/**
 * Group a Task timeline into chronological turn segments.
 *
 * A new turn starts when a `user-message` appears after non-user content
 * (assistant / tools / terminal). This preserves multi-turn order for retry
 * and follow-up instead of flattening all users then one body block.
 */

import type { TimelineItem } from '../../projection/types'

export interface TimelineTurnSegment {
  /** Stable key for React lists. */
  key: string
  /** User bubbles for this turn (usually 0–1). */
  userMessages: TimelineItem[]
  /** Latest turn-terminal chrome for this turn, if any. */
  terminal: TimelineItem | undefined
  /** Everything else in order (tools, reasoning, assistant, approval…). */
  bodyItems: TimelineItem[]
}

/**
 * Split `timeline` (full TaskReadModel.timeline) into turn segments.
 * Empty timeline → [].
 */
export function groupTimelineIntoTurns(
  timeline: readonly TimelineItem[],
): TimelineTurnSegment[] {
  if (timeline.length === 0) return []

  const groups: TimelineItem[][] = []
  let current: TimelineItem[] = []

  for (const item of timeline) {
    const startsNewTurn =
      item.category === 'user-message' &&
      item.meta?.inlineResponse !== true &&
      current.length > 0 &&
      current.some((i) => i.category !== 'user-message')

    if (startsNewTurn) {
      groups.push(current)
      current = [item]
      continue
    }
    current.push(item)
  }
  if (current.length > 0) groups.push(current)

  return groups.map((items, index) => {
    const userMessages = items.filter(
      (i) => i.category === 'user-message' && i.meta?.inlineResponse !== true,
    )
    const terminals = items.filter((i) => i.category === 'turn-terminal')
    const terminal = terminals[terminals.length - 1]
    const bodyItems = items.filter(
      (i) =>
        i.category !== 'turn-terminal' &&
        (i.category !== 'user-message' || i.meta?.inlineResponse === true),
    )
    const key =
      terminal?.id ??
      userMessages[0]?.id ??
      bodyItems[0]?.id ??
      `turn-seg-${index}`
    return { key, userMessages, terminal, bodyItems }
  })
}
