import { describe, expect, it } from 'vitest'
import {
  countProcessItems,
  formatWorkingHeader,
  workingChromeStatus,
  workingOutcomeLabel,
} from './working-header'
import type { TimelineItem } from '../../projection/types'
import type { WorkingEntry } from './derive-timeline-view'

function item(id: string): TimelineItem {
  return {
    id,
    category: 'tool-group',
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
  }
}

describe('formatWorkingHeader', () => {
  it('uses 正在处理 plus elapsed time while running', () => {
    expect(
      formatWorkingHeader({
        running: true,
      }),
    ).toBe('正在处理')
    expect(
      formatWorkingHeader({
        running: true,
        durationLabel: '16秒',
      }),
    ).toBe('正在处理\u00A016秒')
    expect(
      formatWorkingHeader({
        running: true,
        durationLabel: '1分钟 16秒',
      }),
    ).toBe('正在处理\u00A01分钟 16秒')
  })

  it('settles as 已完成 plus elapsed time', () => {
    expect(
      formatWorkingHeader({
        running: false,
        durationLabel: '16秒',
      }),
    ).toBe('已完成\u00A016秒')
    expect(
      formatWorkingHeader({
        running: false,
        durationLabel: '1分钟 16秒',
      }),
    ).toBe('已完成\u00A01分钟 16秒')
    expect(
      formatWorkingHeader({
        running: false,
      }),
    ).toBe('已完成')
  })

  it('surfaces failed or cancelled outcomes instead of a success receipt', () => {
    expect(workingOutcomeLabel('failed')).toBe('失败')
    expect(workingOutcomeLabel('cancelled')).toBe('已取消')
    expect(workingChromeStatus(true, 'cancelling')).toBe('cancelling')
    expect(workingChromeStatus(true, 'running')).toBe('running')
    expect(workingChromeStatus(false, 'failed')).toBe('failed')
    expect(
      formatWorkingHeader({
        running: false,
        durationLabel: '2秒',
        outcomeLabel: '失败',
      }),
    ).toBe('失败\u00A02秒')
    expect(
      formatWorkingHeader({
        running: false,
        outcomeLabel: '已取消',
      }),
    ).toBe('已取消')
    expect(
      formatWorkingHeader({
        running: true,
        durationLabel: '3秒',
        outcomeLabel: '取消中',
      }),
    ).toBe('取消中\u00A03秒')
  })
})

describe('countProcessItems', () => {
  it('counts activity-group members as separate process items', () => {
    const entries: WorkingEntry[] = [
      { kind: 'single', item: item('think') },
      {
        kind: 'activity-group',
        kinds: ['read'],
        items: [item('r1'), item('r2')],
      },
    ]
    expect(countProcessItems(entries)).toBe(3)
  })

  it('does not count folded asides as process items', () => {
    const entries: WorkingEntry[] = [
      {
        kind: 'single',
        item: {
          id: 'aside',
          category: 'assistant-message',
          body: '目录看完了。',
          sourceEventIds: [],
          taskId: 'task-1',
          projectionVersion: 1,
        },
      },
      { kind: 'single', item: item('r1') },
    ]
    expect(countProcessItems(entries)).toBe(1)
  })
})
