import type { TimelineItem } from '../../projection/types'
import {
  applyStreamGate,
  streamItemsHitlPending,
  streamItemsToolActive,
  type StreamGateApplyResult,
} from './apply-stream-gate'
import {
  deriveTimelineView,
  flattenWorkingEntries,
} from './derive-timeline-view'
import type { StreamGate } from './stream-gate'

export type TimelineFollowTipInput = {
  segmentKey: string
  streamItems: readonly TimelineItem[]
  runSettled: boolean
  deliverablePaths?: readonly string[]
  prevGates?: Readonly<Record<string, StreamGate>>
  terminalId?: string
}

export type TimelineFollowTipResult = {
  tip: string
  gated: StreamGateApplyResult
}

function lastBlockIdentity(gated: StreamGateApplyResult): {
  kind: string
  id: string
  gate: string
} {
  const last = gated.blocks[gated.blocks.length - 1]
  if (!last) {
    return {
      kind: gated.quietText ? 'quiet' : 'empty',
      id: '',
      gate: gated.quietText ? 'quiet' : 'none',
    }
  }
  if (last.kind === 'working') {
    const flat = flattenWorkingEntries(last.items)
    const tail = flat[flat.length - 1]
    return {
      kind: 'working',
      id: tail?.id ?? '',
      gate: gated.quietText ? 'quiet' : 'none',
    }
  }
  return {
    kind: last.kind,
    id: last.item.id,
    gate:
      last.kind === 'prose' ? (gated.gates[last.item.id] ?? last.kind) : last.kind,
  }
}

/**
 * Tip identity for stick-to-bottom. Changes when the last run / block / item
 * or quiet→answer gate changes — not when the same bubble grows.
 */
export function computeTimelineFollowTip(
  input: TimelineFollowTipInput,
): TimelineFollowTipResult {
  const rawBlocks = deriveTimelineView(input.streamItems)
  const hasProcess = rawBlocks.some(
    (block) => block.kind === 'working' && block.items.length > 0,
  )
  const gated = applyStreamGate(
    rawBlocks,
    {
      hasProcess,
      toolActive: streamItemsToolActive(input.streamItems),
      hitlPending: streamItemsHitlPending(input.streamItems),
      runSettled: input.runSettled,
      deliverablePaths: input.deliverablePaths,
    },
    input.prevGates,
  )
  const last = lastBlockIdentity(gated)
  const tip = [
    input.segmentKey,
    last.kind,
    last.id,
    last.gate,
    input.terminalId ?? '',
  ].join('|')
  return { tip, gated }
}
