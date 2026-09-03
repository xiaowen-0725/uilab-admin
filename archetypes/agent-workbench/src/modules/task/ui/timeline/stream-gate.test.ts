import { describe, expect, it } from 'vitest'
import { applyStreamGate } from './apply-stream-gate'
import {
  deriveTimelineView,
  flattenWorkingEntries,
  type TimelineViewBlock,
} from './derive-timeline-view'
import type { TimelineItem } from '../../projection/types'
import { nextStreamGate, STREAM_GATE_THRESHOLD } from './stream-gate'

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

describe('nextStreamGate', () => {
  const base = {
    threshold: STREAM_GATE_THRESHOLD,
    hasProcess: false,
    toolActive: false,
    messageCompleted: false,
    hitlPending: false,
    isFinalMessage: false,
  }

  it('holds short streaming text before any process', () => {
    expect(
      nextStreamGate('none', { ...base, charCount: 12 }),
    ).toBe('hold')
  })

  it('keeps process narration quiet until the threshold', () => {
    expect(
      nextStreamGate('none', {
        ...base,
        charCount: 20,
        hasProcess: true,
      }),
    ).toBe('quiet')
    expect(
      nextStreamGate('hold', {
        ...base,
        charCount: 20,
        toolActive: true,
      }),
    ).toBe('quiet')
  })

  it('promotes to answer past the threshold when no tool is active', () => {
    expect(
      nextStreamGate('quiet', {
        ...base,
        charCount: STREAM_GATE_THRESHOLD,
      }),
    ).toBe('answer')
  })

  it('does not demote after promotion', () => {
    expect(
      nextStreamGate('answer', {
        ...base,
        charCount: STREAM_GATE_THRESHOLD,
        toolActive: true,
        hasProcess: true,
      }),
    ).toBe('answer')
  })

  it('keeps completed commentary quiet until the run actually closes', () => {
    expect(
      nextStreamGate('hold', {
        ...base,
        charCount: 4,
        hasProcess: true,
        messageCompleted: true,
      }),
    ).toBe('quiet')
    expect(
      nextStreamGate('quiet', {
        ...base,
        charCount: 4,
        hasProcess: true,
        toolActive: true,
        messageCompleted: true,
      }),
    ).toBe('quiet')
  })

  it('promotes only the final message after the run settles', () => {
    expect(
      nextStreamGate('quiet', {
        ...base,
        charCount: 4,
        hasProcess: true,
        messageCompleted: true,
        isFinalMessage: true,
      }),
    ).toBe('answer')
    expect(
      nextStreamGate('none', {
        ...base,
        charCount: 0,
        messageCompleted: true,
        isFinalMessage: true,
      }),
    ).toBe('none')
  })

  it('does not promote past the threshold while HITL is pending', () => {
    expect(
      nextStreamGate('quiet', {
        ...base,
        charCount: STREAM_GATE_THRESHOLD,
        hitlPending: true,
      }),
    ).toBe('quiet')
  })
})

describe('applyStreamGate', () => {
  it('drops hold/quiet prose and keeps completed answer', () => {
    const hold: TimelineViewBlock = {
      kind: 'prose',
      item: item({
        id: 'a-hold',
        category: 'assistant-message',
        body: '先看看。',
        status: 'streaming',
      }),
    }
    const answer: TimelineViewBlock = {
      kind: 'prose',
      item: item({
        id: 'a-done',
        category: 'assistant-message',
        body: '安装步骤已改成 pnpm。',
        status: 'completed',
      }),
    }
    const held = applyStreamGate([hold], {
      hasProcess: false,
      toolActive: false,
    })
    expect(held.blocks).toEqual([])
    expect(held.gates['a-hold']).toBe('hold')

    const quiet = applyStreamGate([hold], {
      hasProcess: true,
      toolActive: true,
    })
    expect(quiet.blocks).toEqual([])
    expect(quiet.quietText).toBe('先看看。')
    expect(quiet.gates['a-hold']).toBe('quiet')

    const midRun = applyStreamGate([answer], {
      hasProcess: true,
      toolActive: false,
      runSettled: false,
    })
    expect(midRun.blocks).toEqual([])
    expect(midRun.quietText).toBe('安装步骤已改成 pnpm。')
    expect(midRun.gates['a-done']).toBe('quiet')

    const done = applyStreamGate([answer], {
      hasProcess: true,
      toolActive: false,
      runSettled: true,
    })
    expect(done.blocks).toEqual([answer])
    expect(done.gates['a-done']).toBe('answer')
  })

  it('does not promote an earlier completed segment after later assistant work', () => {
    const commentary: TimelineViewBlock = {
      kind: 'prose',
      item: item({
        id: 'a-note',
        category: 'assistant-message',
        body: '过程说明。',
        status: 'completed',
      }),
    }
    const close: TimelineViewBlock = {
      kind: 'prose',
      item: item({
        id: 'a-close',
        category: 'assistant-message',
        body: '最终回答。',
        status: 'completed',
      }),
    }
    const result = applyStreamGate([commentary, close], {
      hasProcess: true,
      toolActive: false,
      runSettled: true,
    })
    expect(result.blocks).toHaveLength(2)
    expect(result.blocks[0]?.kind).toBe('working')
    if (result.blocks[0]?.kind === 'working') {
      expect(flattenWorkingEntries(result.blocks[0].items).map((row) => row.id)).toEqual([
        'a-note',
      ])
    }
    expect(result.blocks[1]).toEqual(close)
    expect(result.gates['a-note']).toBe('quiet')
    expect(result.gates['a-close']).toBe('answer')
  })

  it('merges asides and tool groups into one process fold after settle', () => {
    const raw = deriveTimelineView([
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({
        id: 'aside',
        category: 'assistant-message',
        body: '目录看完了。',
        status: 'completed',
      }),
      item({
        id: 'w1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'write' },
      }),
      item({
        id: 'answer',
        category: 'assistant-message',
        body: '已经写好了。',
        status: 'completed',
      }),
    ])
    expect(raw.map((block) => block.kind)).toEqual([
      'working',
      'prose',
      'working',
      'prose',
    ])

    const live = applyStreamGate(raw, {
      hasProcess: true,
      toolActive: false,
      runSettled: false,
    })
    expect(live.blocks.map((block) => block.kind)).toEqual(['working'])
    expect(live.quietText).toBe('已经写好了。')

    const settled = applyStreamGate(raw, {
      hasProcess: true,
      toolActive: false,
      runSettled: true,
    })
    expect(settled.blocks.map((block) => block.kind)).toEqual(['working', 'prose'])
    if (settled.blocks[0]?.kind !== 'working') return
    expect(flattenWorkingEntries(settled.blocks[0].items).map((row) => row.id)).toEqual([
      'r1',
      'aside',
      'w1',
    ])
    expect(settled.blocks[1]?.kind === 'prose' && settled.blocks[1].item.id).toBe(
      'answer',
    )
  })

  it('keeps a pending question first-class and does not merge across it', () => {
    const raw = deriveTimelineView([
      item({
        id: 'r1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'read' },
      }),
      item({
        id: 'q1',
        category: 'input-request',
        status: 'waiting',
        title: '用哪种语气？',
      }),
      item({
        id: 'w1',
        category: 'tool-group',
        status: 'running',
        meta: { processKind: 'write' },
      }),
    ])
    const gated = applyStreamGate(raw, {
      hasProcess: true,
      toolActive: true,
      hitlPending: true,
      runSettled: false,
    })
    expect(gated.blocks.map((block) => block.kind)).toEqual([
      'working',
      'inline',
      'working',
    ])
  })

  it('folds file cards into the process after settle', () => {
    const raw = deriveTimelineView([
      item({
        id: 'w1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'write' },
      }),
      item({
        id: 'f1',
        category: 'file-change',
        title: 'notes/result.md',
      }),
      item({
        id: 'answer',
        category: 'assistant-message',
        body: '写好了。',
        status: 'completed',
      }),
    ])
    const live = applyStreamGate(raw, {
      hasProcess: true,
      toolActive: false,
      runSettled: false,
    })
    expect(live.blocks.map((block) => block.kind)).toEqual([
      'working',
      'inline',
    ])

    const settled = applyStreamGate(raw, {
      hasProcess: true,
      toolActive: false,
      runSettled: true,
    })
    expect(settled.blocks.map((block) => block.kind)).toEqual(['working', 'prose'])
    if (settled.blocks[0]?.kind !== 'working') return
    expect(flattenWorkingEntries(settled.blocks[0].items).map((row) => row.id)).toEqual([
      'w1',
      'f1',
    ])
  })

  it('omits file cards already listed in deliverables after settle', () => {
    const raw = deriveTimelineView([
      item({
        id: 'w1',
        category: 'tool-group',
        status: 'completed',
        meta: { processKind: 'write' },
      }),
      item({
        id: 'f1',
        category: 'file-change',
        title: 'notes/result.md',
        meta: { path: 'notes/result.md' },
      }),
      item({
        id: 'answer',
        category: 'assistant-message',
        body: '写好了。',
        status: 'completed',
      }),
    ])
    const settled = applyStreamGate(raw, {
      hasProcess: true,
      toolActive: false,
      runSettled: true,
      deliverablePaths: ['notes/result.md'],
    })
    expect(settled.blocks.map((block) => block.kind)).toEqual(['working', 'prose'])
    if (settled.blocks[0]?.kind !== 'working') return
    expect(flattenWorkingEntries(settled.blocks[0].items).map((row) => row.id)).toEqual([
      'w1',
    ])
  })

  it('omits interactive artifact rows already listed by id after settle', () => {
    const raw = deriveTimelineView([
      item({
        id: 'artifact:ia_notes-table',
        category: 'artifact',
        title: '对比清单',
        meta: { id: 'ia_notes-table', kind: 'interactive' },
      }),
      item({
        id: 'answer',
        category: 'assistant-message',
        body: '表做好了。',
        status: 'completed',
      }),
    ])
    const settled = applyStreamGate(raw, {
      hasProcess: false,
      toolActive: false,
      runSettled: true,
      deliverablePaths: ['ia_notes-table'],
    })
    expect(settled.blocks.map((block) => block.kind)).toEqual(['prose'])
  })

  it('does not promote a completed mid-turn commentary while tools are still running', () => {
    const commentary: TimelineViewBlock = {
      kind: 'prose',
      item: item({
        id: 'a-note',
        category: 'assistant-message',
        body: `${'过程说明已经写得很长了。'.repeat(8)}`,
        status: 'completed',
      }),
    }
    const result = applyStreamGate([commentary], {
      hasProcess: true,
      toolActive: true,
      runSettled: false,
    })
    expect(result.blocks).toEqual([])
    expect(result.gates['a-note']).toBe('quiet')
    expect(result.quietText).toContain('过程说明')
  })
})
