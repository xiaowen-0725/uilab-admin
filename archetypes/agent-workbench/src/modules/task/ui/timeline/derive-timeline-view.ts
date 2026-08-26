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
  | { kind: 'activity-group'; kinds: string[]; items: TimelineItem[] }
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

/** Auto-approved / rejected receipts stay in the model; the process fold does not paint them. */
function isResolvedApproval(item: TimelineItem): boolean {
  return item.category === 'approval-request' && item.status !== 'waiting'
}

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

function uniqueProcessKinds(items: readonly TimelineItem[]): string[] {
  const kinds: string[] = []
  for (const item of items) {
    const kind = processKindOf(item)
    if (!kinds.includes(kind)) kinds.push(kind)
  }
  return kinds
}

function clusterWorkingItems(items: readonly TimelineItem[]): WorkingEntry[] {
  const entries: WorkingEntry[] = []
  let tools: TimelineItem[] = []

  const flushTools = (): void => {
    if (tools.length === 0) return
    if (tools.length === 1) {
      entries.push({ kind: 'single', item: tools[0]! })
    } else {
      entries.push({
        kind: 'activity-group',
        kinds: uniqueProcessKinds(tools),
        items: tools,
      })
    }
    tools = []
  }

  for (const item of items) {
    if (isToolish(item)) {
      tools.push(item)
      continue
    }
    flushTools()
    entries.push({ kind: 'single', item })
  }
  flushTools()
  return entries
}

export function flattenWorkingEntries(
  entries: readonly WorkingEntry[],
): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const entry of entries) {
    if (entry.kind === 'activity-group') items.push(...entry.items)
    else items.push(entry.item)
  }
  return items
}

export function workingBlockFromItems(
  items: readonly TimelineItem[],
): Extract<TimelineViewBlock, { kind: 'working' }> {
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
    blocks.push(workingBlockFromItems(working))
    working = []
  }

  for (const item of bodyItems) {
    if (isResolvedApproval(item)) continue
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
