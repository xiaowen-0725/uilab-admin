/**
 * Pure render-grouping layer for a turn's body items.
 * Working process (reasoning / tool / command / plan) folds; prose and
 * inline cards stay first-class and chronological.
 */

import type {
  ProcessStepKind,
  ProcessSummary,
  TimelineItem,
  TimelineItemCategory,
} from '../../projection/types'

export type WorkingEntry =
  | { kind: 'tool-cluster'; toolKind: string; items: TimelineItem[] }
  | { kind: 'single'; item: TimelineItem }

export type TimelineViewBlock =
  | {
      kind: 'working'
      items: WorkingEntry[]
      status: 'running' | 'done'
      startedAt?: string
      durationMs?: number
      summary: ProcessSummary
    }
  | { kind: 'prose'; item: TimelineItem }
  | { kind: 'inline'; item: TimelineItem }

const WORKING_CATEGORIES = new Set<TimelineItemCategory>([
  'reasoning-section',
  'tool-group',
  'command-execution',
  'plan-update',
])

function isWorkingItem(item: TimelineItem): boolean {
  return WORKING_CATEGORIES.has(item.category)
}

function isProseItem(item: TimelineItem): boolean {
  return item.category === 'assistant-message'
}

function isToolish(item: TimelineItem): boolean {
  return item.category === 'tool-group' || item.category === 'command-execution'
}

function isRunningItem(item: TimelineItem): boolean {
  return item.status === 'running' || item.status === 'streaming'
}

function processKindOf(item: TimelineItem): string {
  return item.meta?.processKind ?? 'other'
}

function summarizeWorkingItems(items: readonly TimelineItem[]): ProcessSummary {
  const steps = items.filter(isToolish)
  const counts: Partial<Record<ProcessStepKind, number>> = {}
  for (const step of steps) {
    const kind = step.meta?.processKind ?? 'other'
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return { stepCount: steps.length, counts }
}

function workingTimes(items: readonly TimelineItem[]): {
  startedAt?: string
  durationMs?: number
} {
  const startedAt = items
    .map((item) => item.meta?.startedAt)
    .find((value): value is string => Boolean(value))
  const endedAt = [...items]
    .reverse()
    .map((item) => item.meta?.endedAt ?? item.meta?.startedAt)
    .find((value): value is string => Boolean(value))
  if (!startedAt || !endedAt) return startedAt ? { startedAt } : {}
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { startedAt }
  }
  return { startedAt, durationMs: end - start }
}

function clusterWorkingItems(items: readonly TimelineItem[]): WorkingEntry[] {
  const entries: WorkingEntry[] = []
  let cluster: TimelineItem[] = []
  let clusterKind: string | null = null

  const flush = (): void => {
    if (cluster.length === 0) return
    if (cluster.length === 1) {
      entries.push({ kind: 'single', item: cluster[0]! })
    } else {
      entries.push({
        kind: 'tool-cluster',
        toolKind: clusterKind ?? 'other',
        items: cluster,
      })
    }
    cluster = []
    clusterKind = null
  }

  for (const item of items) {
    if (!isToolish(item) || isRunningItem(item)) {
      flush()
      entries.push({ kind: 'single', item })
      continue
    }
    const kind = processKindOf(item)
    if (cluster.length > 0 && clusterKind === kind) {
      cluster.push(item)
      continue
    }
    flush()
    cluster = [item]
    clusterKind = kind
  }
  flush()
  return entries
}

function toWorkingBlock(items: TimelineItem[]): TimelineViewBlock {
  const running = items.some(isRunningItem)
  return {
    kind: 'working',
    items: clusterWorkingItems(items),
    status: running ? 'running' : 'done',
    ...workingTimes(items),
    summary: summarizeWorkingItems(items),
  }
}

function sameTimelineItems(
  left: readonly TimelineItem[] | null,
  right: readonly TimelineItem[],
): boolean {
  if (left === right) return true
  if (left == null || left.length !== right.length) return false
  for (let i = 0; i < right.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}

const VIEW_CACHE_LIMIT = 16
const viewCache: Array<{
  input: readonly TimelineItem[]
  output: TimelineViewBlock[]
}> = []

function cachedTimelineView(
  bodyItems: readonly TimelineItem[],
): TimelineViewBlock[] | null {
  for (const entry of viewCache) {
    if (sameTimelineItems(entry.input, bodyItems)) return entry.output
  }
  return null
}

function rememberTimelineView(
  bodyItems: readonly TimelineItem[],
  output: TimelineViewBlock[],
): void {
  viewCache.unshift({ input: bodyItems, output })
  if (viewCache.length > VIEW_CACHE_LIMIT) viewCache.pop()
}

/**
 * Group a turn's `bodyItems` into chronological render blocks.
 * Does not consume user-message turn openers or turn-terminal chrome.
 * Returns the previous array when item identities are unchanged.
 */
export function deriveTimelineView(
  bodyItems: readonly TimelineItem[],
): TimelineViewBlock[] {
  const cached = cachedTimelineView(bodyItems)
  if (cached) return cached

  const blocks: TimelineViewBlock[] = []
  let working: TimelineItem[] = []

  const flushWorking = (): void => {
    if (working.length === 0) return
    blocks.push(toWorkingBlock(working))
    working = []
  }

  for (const item of bodyItems) {
    if (isWorkingItem(item)) {
      const prevStep = working[working.length - 1]?.meta?.stepId
      const nextStep = item.meta?.stepId
      if (nextStep && prevStep !== nextStep) {
        flushWorking()
      }
      working.push(item)
      continue
    }
    flushWorking()
    if (isProseItem(item)) {
      blocks.push({ kind: 'prose', item })
      continue
    }
    blocks.push({ kind: 'inline', item })
  }
  flushWorking()
  rememberTimelineView(bodyItems, blocks)
  return blocks
}
