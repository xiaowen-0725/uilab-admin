import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../../projection/types'
import { groupTimelineIntoTurns } from './group-timeline-turns'

function item(
  partial: Pick<TimelineItem, 'id' | 'category'> &
    Partial<TimelineItem>,
): TimelineItem {
  return {
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
    ...partial,
  }
}

describe('groupTimelineIntoTurns', () => {
  it('returns empty for empty timeline', () => {
    expect(groupTimelineIntoTurns([])).toEqual([])
  })

  it('keeps a single turn as one segment in chronological order', () => {
    const timeline = [
      item({ id: 'u1', category: 'user-message', body: 'hello' }),
      item({ id: 'rt1', category: 'run-terminal', status: 'completed' }),
      item({ id: 't1', category: 'tool-group', title: '已搜索' }),
      item({ id: 'a1', category: 'assistant-message', body: 'done' }),
    ]
    const segs = groupTimelineIntoTurns(timeline)
    expect(segs).toHaveLength(1)
    expect(segs[0].userMessages.map((i) => i.id)).toEqual(['u1'])
    expect(segs[0].terminal?.id).toBe('rt1')
    expect(segs[0].bodyItems.map((i) => i.id)).toEqual(['t1', 'a1'])
  })

  it('splits multi-turn so earlier assistant stays with earlier user', () => {
    const timeline = [
      item({ id: 'u1', category: 'user-message', body: 'first' }),
      item({ id: 'rt1', category: 'run-terminal', status: 'completed' }),
      item({ id: 'a1', category: 'assistant-message', body: 'answer-1' }),
      item({ id: 'u2', category: 'user-message', body: 'second' }),
      item({ id: 'rt2', category: 'run-terminal', status: 'completed' }),
      item({ id: 'a2', category: 'assistant-message', body: 'answer-2' }),
    ]
    const segs = groupTimelineIntoTurns(timeline)
    expect(segs).toHaveLength(2)
    expect(segs[0].userMessages[0]?.body).toBe('first')
    expect(segs[0].bodyItems.map((i) => i.body)).toEqual(['answer-1'])
    expect(segs[0].terminal?.id).toBe('rt1')
    expect(segs[1].userMessages[0]?.body).toBe('second')
    expect(segs[1].bodyItems.map((i) => i.body)).toEqual(['answer-2'])
    expect(segs[1].terminal?.id).toBe('rt2')
  })

  it('keeps inline question answers in the same turn body', () => {
    const timeline = [
      item({ id: 'u1', category: 'user-message', body: '写一篇推文' }),
      item({ id: 'rt1', category: 'run-terminal', status: 'running' }),
      item({ id: 'a1', category: 'assistant-message', body: '先确认受众。' }),
      item({ id: 'q1', category: 'input-request', title: '受众是谁？' }),
      item({
        id: 'user:inline:q1',
        category: 'user-message',
        body: '职场新人',
        meta: { inlineResponse: true },
      }),
      item({ id: 'a2', category: 'assistant-message', body: '好。' }),
    ]
    const segs = groupTimelineIntoTurns(timeline)
    expect(segs).toHaveLength(1)
    expect(segs[0].userMessages.map((i) => i.id)).toEqual(['u1'])
    expect(segs[0].bodyItems.map((i) => i.id)).toEqual([
      'a1',
      'q1',
      'user:inline:q1',
      'a2',
    ])
  })

  it('does not split consecutive user messages before any non-user content', () => {
    const timeline = [
      item({ id: 'u1', category: 'user-message', body: 'a' }),
      item({ id: 'u2', category: 'user-message', body: 'b' }),
      item({ id: 'a1', category: 'assistant-message', body: 'c' }),
    ]
    const segs = groupTimelineIntoTurns(timeline)
    expect(segs).toHaveLength(1)
    expect(segs[0].userMessages.map((i) => i.id)).toEqual(['u1', 'u2'])
  })
})
