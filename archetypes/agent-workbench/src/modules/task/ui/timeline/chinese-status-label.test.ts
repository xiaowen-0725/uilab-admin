import { describe, expect, it } from 'vitest'
import { chineseStatusLabel } from './timeline'
import type { TimelineItem } from '../../projection/types'

function item(
  partial: Pick<TimelineItem, 'status' | 'title'> &
    Partial<Omit<TimelineItem, 'status' | 'title'>>,
): TimelineItem {
  return {
    id: partial.id ?? 'turn-terminal:test',
    category: partial.category ?? 'turn-terminal',
    status: partial.status,
    title: partial.title,
    body: partial.body,

    meta: partial.meta,
    sourceEventIds: partial.sourceEventIds ?? [],
    taskId: partial.taskId ?? ('task-test' as TimelineItem['taskId']),
    projectionVersion: partial.projectionVersion ?? 1,
  }
}

describe('chineseStatusLabel', () => {
  it('never shows 已处理 while status is running (even if title is 已处理)', () => {
    expect(
      chineseStatusLabel(item({ status: 'running', title: '已处理' })),
    ).toBe('正在思考')
  })

  it('keeps present-tense titles while running', () => {
    expect(
      chineseStatusLabel(item({ status: 'running', title: '正在思考' })),
    ).toBe('正在思考')
    expect(
      chineseStatusLabel(item({ status: 'running', title: '处理中' })),
    ).toBe('处理中')
  })

  it('shows 已处理 only when completed', () => {
    expect(
      chineseStatusLabel(item({ status: 'completed', title: '已处理' })),
    ).toBe('已处理')
    expect(
      chineseStatusLabel(item({ status: 'completed', title: '正在思考' })),
    ).toBe('已处理')
  })

  it('maps queued / waiting / failed states', () => {
    expect(chineseStatusLabel(item({ status: 'queued', title: 'x' }))).toBe(
      '排队中',
    )
    expect(
      chineseStatusLabel(item({ status: 'waiting_for_approval', title: 'x' })),
    ).toBe('等待审批')
    expect(
      chineseStatusLabel(item({ status: 'waiting_for_input', title: 'x' })),
    ).toBe('等待输入')
    expect(chineseStatusLabel(item({ status: 'failed', title: 'x' }))).toBe(
      '失败',
    )
  })
})
