import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../../projection/types'
import { computeTimelineFollowTip } from './timeline-follow-tip'

function item(
  partial: Pick<TimelineItem, 'id' | 'category'> & Partial<TimelineItem>,
): TimelineItem {
  return {
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
    ...partial,
  }
}

describe('computeTimelineFollowTip', () => {
  it('stays stable when the same answer bubble grows', () => {
    const streamItems = [
      item({
        id: 'a1',
        category: 'assistant-message',
        body: `${'答案已经晋升。'.repeat(20)}`,
        status: 'streaming',
      }),
    ]
    const first = computeTimelineFollowTip({
      segmentKey: 'run-1',
      streamItems,
      runSettled: false,
    })
    const grown = computeTimelineFollowTip({
      segmentKey: 'run-1',
      streamItems: [
        item({
          id: 'a1',
          category: 'assistant-message',
          body: `${'答案已经晋升。'.repeat(40)}`,
          status: 'streaming',
        }),
      ],
      runSettled: false,
      prevGates: first.gated.gates,
    })
    expect(first.gated.gates.a1).toBe('answer')
    expect(grown.tip).toBe(first.tip)
  })

  it('changes when quiet prose is promoted to the answer slot', () => {
    const mid: TimelineItem[] = [
      item({
        id: 't1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({
        id: 'a1',
        category: 'assistant-message',
        body: '写好了。',
        status: 'completed',
      }),
    ]
    const live = computeTimelineFollowTip({
      segmentKey: 'run-1',
      streamItems: mid,
      runSettled: false,
    })
    const settled = computeTimelineFollowTip({
      segmentKey: 'run-1',
      streamItems: mid,
      runSettled: true,
      terminalId: 'term-1',
      prevGates: live.gated.gates,
    })
    expect(live.tip).toContain('|quiet|')
    expect(settled.tip).toContain('|answer|')
    expect(settled.tip).not.toBe(live.tip)
  })
})
