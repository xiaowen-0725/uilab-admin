import { isInteractiveArtifactKind } from '../../model/interactive-artifact'
import type { TimelineItem } from '../../projection/types'
import {
  flattenWorkingEntries,
  workingBlockFromItems,
  type TimelineViewBlock,
} from './derive-timeline-view'
import {
  STREAM_GATE_THRESHOLD,
  isAssistantStreaming,
  nextStreamGate,
  type StreamGate,
} from './stream-gate'

export type StreamGateApplyInput = {
  hasProcess: boolean
  toolActive: boolean
  hitlPending?: boolean
  runSettled?: boolean
  threshold?: number
  /** Paths already shown in DeliverableZone; omit matching file/artifact rows. */
  deliverablePaths?: readonly string[]
}

export type StreamGateApplyResult = {
  blocks: TimelineViewBlock[]
  quietText?: string
  gates: Record<string, StreamGate>
}

export function streamItemsToolActive(items: readonly TimelineItem[]): boolean {
  return items.some(
    (item) =>
      (item.category === 'tool-group' ||
        item.category === 'command-execution') &&
      (item.status === 'running' || item.status === 'streaming'),
  )
}

export function streamItemsHitlPending(items: readonly TimelineItem[]): boolean {
  return items.some(
    (item) =>
      (item.category === 'approval-request' ||
        item.category === 'input-request') &&
      item.status === 'waiting',
  )
}

function lastProseItemId(
  blocks: readonly TimelineViewBlock[],
): string | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block?.kind === 'prose') return block.item.id
  }
  return undefined
}

function isConversationBeat(item: TimelineItem): boolean {
  if (item.category === 'input-request') return true
  return item.category === 'user-message' && item.meta?.inlineResponse === true
}

function isPendingHitl(item: TimelineItem): boolean {
  return (
    (item.category === 'approval-request' ||
      item.category === 'input-request') &&
    item.status === 'waiting'
  )
}

function isAlertInline(item: TimelineItem): boolean {
  return (
    item.category === 'warning' ||
    item.category === 'error' ||
    item.category === 'unsupported-event'
  )
}

function isSettledFoldableInline(item: TimelineItem): boolean {
  return (
    item.category === 'file-change' ||
    item.category === 'artifact' ||
    item.category === 'source-group'
  )
}

function itemDeliverablePath(item: TimelineItem): string | undefined {
  if (item.category !== 'file-change' && item.category !== 'artifact') {
    return undefined
  }
  if (isInteractiveArtifactKind(item.meta?.kind)) {
    return item.meta?.id?.trim() || undefined
  }
  const path = item.meta?.path ?? item.title
  return path?.trim() || undefined
}

function isCoveredByDeliverables(
  item: TimelineItem,
  paths: ReadonlySet<string>,
): boolean {
  if (paths.size === 0) return false
  const path = itemDeliverablePath(item)
  return Boolean(path && paths.has(path))
}

/**
 * Drop hold/quiet prose from first-class bubbles. After the run settles,
 * fold asides and adjacent working segments into one process block so the
 * answer (and pending HITL) stay first-class.
 */
export function applyStreamGate(
  blocks: readonly TimelineViewBlock[],
  input: StreamGateApplyInput,
  prev: Readonly<Record<string, StreamGate>> = {},
): StreamGateApplyResult {
  const threshold = input.threshold ?? STREAM_GATE_THRESHOLD
  const runSettled = Boolean(input.runSettled)
  const hitlPending = Boolean(input.hitlPending)
  const deliverablePathSet = new Set(
    (input.deliverablePaths ?? []).filter((path) => path.trim().length > 0),
  )
  const lastProseId = lastProseItemId(blocks)
  const gates: Record<string, StreamGate> = { ...prev }
  const next: TimelineViewBlock[] = []
  let pending: TimelineItem[] = []
  let quietText: string | undefined

  const flushPending = (): void => {
    if (pending.length === 0) return
    next.push(workingBlockFromItems(pending))
    pending = []
  }

  for (const block of blocks) {
    if (block.kind === 'working') {
      pending.push(...flattenWorkingEntries(block.items))
      continue
    }

    if (block.kind === 'prose') {
      const item = block.item
      const gate = nextStreamGate(prev[item.id] ?? 'none', {
        charCount: item.body?.length ?? 0,
        hasProcess: input.hasProcess,
        toolActive: input.toolActive,
        messageCompleted: !isAssistantStreaming(item.status),
        threshold,
        hitlPending,
        isFinalMessage: runSettled && item.id === lastProseId,
      })
      gates[item.id] = gate
      const showAnswer = gate === 'answer' && (!runSettled || item.id === lastProseId)
      if (showAnswer) {
        flushPending()
        next.push(block)
        continue
      }
      if (item.body?.trim()) {
        quietText = item.body.trim()
        if (runSettled) pending.push(item)
      }
      continue
    }

    if (isPendingHitl(block.item) || isConversationBeat(block.item) || isAlertInline(block.item)) {
      flushPending()
      next.push(block)
      continue
    }

    if (runSettled && isCoveredByDeliverables(block.item, deliverablePathSet)) {
      continue
    }

    if (runSettled && isSettledFoldableInline(block.item)) {
      pending.push(block.item)
      continue
    }

    flushPending()
    next.push(block)
  }
  flushPending()

  return { blocks: next, quietText, gates }
}
