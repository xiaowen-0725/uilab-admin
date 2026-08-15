import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../../projection/types'
import { deriveTimelineView } from './derive-timeline-view'

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

function kinds(blocks: ReturnType<typeof deriveTimelineView>): string[] {
  return blocks.map((block) => {
    if (block.kind === 'working') {
      const inner = block.items
        .map((entry) =>
          entry.kind === 'tool-cluster'
            ? `cluster:${entry.toolKind}:${entry.items.length}`
            : `single:${entry.item.id}`,
        )
        .join(',')
      return `working[${inner}]`
    }
    return `${block.kind}:${block.item.id}`
  })
}

describe('deriveTimelineView', () => {
  it('keeps text → question → text → question order as first-class blocks', () => {
    const blocks = deriveTimelineView([
      item({ id: 'a1', category: 'assistant-message', body: '先确认受众。' }),
      item({ id: 'q1', category: 'input-request', title: '受众是谁？' }),
      item({ id: 'a2', category: 'assistant-message', body: '再确认语气。' }),
      item({ id: 'q2', category: 'input-request', title: '用哪种语气？' }),
      item({ id: 'a3', category: 'assistant-message', body: '好，开始写。' }),
    ])

    expect(kinds(blocks)).toEqual([
      'prose:a1',
      'inline:q1',
      'prose:a2',
      'inline:q2',
      'prose:a3',
    ])
  })

  it('clusters three completed reads and keeps a running write as single', () => {
    const blocks = deriveTimelineView([
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({
        id: 'r2',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({
        id: 'r3',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({
        id: 'w1',
        category: 'tool-group',
        status: 'running',
        meta: { processKind: 'write' },
      }),
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('working')
    if (blocks[0]?.kind !== 'working') return
    expect(blocks[0].status).toBe('running')
    expect(blocks[0].items).toHaveLength(2)
    expect(blocks[0].items[0]).toMatchObject({
      kind: 'tool-cluster',
      toolKind: 'read',
    })
    if (blocks[0].items[0]?.kind === 'tool-cluster') {
      expect(blocks[0].items[0].items.map((row) => row.id)).toEqual([
        'r1',
        'r2',
        'r3',
      ])
    }
    expect(blocks[0].items[1]).toMatchObject({
      kind: 'single',
      item: { id: 'w1' },
    })
    expect(blocks[0].summary).toEqual({
      stepCount: 4,
      counts: { read: 3, write: 1 },
    })
  })

  it('closes a working block when the next tool belongs to a later step', () => {
    const blocks = deriveTimelineView([
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read', stepId: 'step-1' },
      }),
      item({
        id: 'w1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'write', stepId: 'step-2' },
      }),
    ])

    expect(kinds(blocks)).toEqual(['working[single:r1]', 'working[single:w1]'])
  })

  it('still merges consecutive tools that share a step or have no step id', () => {
    const blocks = deriveTimelineView([
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read', stepId: 'step-1' },
      }),
      item({
        id: 'r2',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read', stepId: 'step-1' },
      }),
      item({
        id: 'r3',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
    ])

    expect(kinds(blocks)).toEqual(['working[cluster:read:3]'])
  })

  it('closes a working block when prose interrupts, then opens a new one', () => {
    const blocks = deriveTimelineView([
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({ id: 'a1', category: 'assistant-message', body: '目录看完了。' }),
      item({
        id: 'c1',
        category: 'command-execution',
        status: 'completed',
        meta: { processKind: 'command' },
      }),
    ])

    expect(kinds(blocks)).toEqual([
      'working[single:r1]',
      'prose:a1',
      'working[single:c1]',
    ])
    expect(blocks[0]?.kind === 'working' && blocks[0].status).toBe('done')
    expect(blocks[2]?.kind === 'working' && blocks[2].status).toBe('done')
  })

  it('keeps resumed reasoning as a later working block, not merged backward', () => {
    const blocks = deriveTimelineView([
      item({
        id: 'reasoning:run-1:1',
        category: 'reasoning-section',
        body: '第一轮思考',
        status: 'completed',
      }),
      item({ id: 'q1', category: 'input-request', title: '选风格' }),
      item({
        id: 'u-inline',
        category: 'user-message',
        body: '正式',
        meta: { inlineResponse: true },
      }),
      item({
        id: 'reasoning:run-1:2',
        category: 'reasoning-section',
        body: '恢复后的思考',
        status: 'streaming',
      }),
    ])

    expect(kinds(blocks)).toEqual([
      'working[single:reasoning:run-1:1]',
      'inline:q1',
      'inline:u-inline',
      'working[single:reasoning:run-1:2]',
    ])
    expect(blocks[3]?.kind === 'working' && blocks[3].status).toBe('running')
  })

  it('does not cluster a single completed tool', () => {
    const blocks = deriveTimelineView([
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        title: '已读取 a.md',
        meta: { processKind: 'read' },
      }),
    ])
    expect(kinds(blocks)).toEqual(['working[single:r1]'])
  })

  it('returns the same block array when the input items are unchanged', () => {
    const bodyItems = [
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({ id: 'a1', category: 'assistant-message', body: '目录看完了。' }),
    ]
    const first = deriveTimelineView(bodyItems)
    const second = deriveTimelineView(bodyItems)
    expect(second).toBe(first)

    const sameItemsNewArray = [...bodyItems]
    const third = deriveTimelineView(sameItemsNewArray)
    expect(third).toBe(first)

    const changed = [bodyItems[0]!, item({ id: 'a2', category: 'assistant-message', body: '下一句' })]
    const fourth = deriveTimelineView(changed)
    expect(fourth).not.toBe(first)
    expect(kinds(fourth)).toEqual(['working[single:r1]', 'prose:a2'])

    const firstAgain = deriveTimelineView(bodyItems)
    expect(firstAgain).toBe(first)
  })
})
