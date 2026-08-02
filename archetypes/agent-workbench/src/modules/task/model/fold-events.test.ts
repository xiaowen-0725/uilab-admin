import { describe, expect, it } from 'vitest'
import { getEventStreamCapture } from '@/config/captures'
import {
  foldCaptureToView,
  formatDurationMs,
} from './stream-events'

describe('formatDurationMs', () => {
  it('formats seconds and minutes like Codex chips', () => {
    expect(formatDurationMs(45_000)).toBe('45s')
    expect(formatDurationMs(78_000)).toBe('1m 18s')
    expect(formatDurationMs(120_000)).toBe('2m')
  })
})

describe('foldCaptureToView (golden-weixin-audio)', () => {
  const capture = getEventStreamCapture('golden-weixin-audio')

  it('intermediate until first search running keeps 处理中 and running tool row', () => {
    const view = foldCaptureToView(capture, { untilEventId: 'tool-search-1' })
    // At first tool_activity event in file the status is still running after s-run
    // Re-fold: the second tool-search-1 event overwrites — use a unique mid id.
    // Golden file reuses tool-search-1 for run+done; intermediate is after s-run only:
    const mid = foldCaptureToView(capture, { untilEventId: 's-run' })
    expect(mid.turn.status).toBe('running')
    expect(mid.turn.statusLabel).toBe('处理中')
    expect(mid.turn.durationLabel).toBeNull()
    expect(mid.turn.toolRows).toHaveLength(0)

    // After first tool activity write (running state of tool-search-1 is first occurrence
    // but second occurrence overwrites in full fold — prefix up to first occurrence
    // is the first tool-search-1 event in order).
    expect(view.turn.toolRows.length).toBeGreaterThanOrEqual(1)
    const firstTool = view.turn.toolRows[0]
    expect(firstTool.label).toMatch(/搜索/)
  })

  it('full capture ends completed with 已处理, duration, tool rows, markdown', () => {
    const view = foldCaptureToView(capture)
    expect(view.userMessages[0]?.text).toContain('微信')
    expect(view.turn.status).toBe('completed')
    expect(view.turn.statusLabel).toBe('已处理')
    expect(view.turn.durationLabel).toBe('1m 18s')
    expect(view.turn.toolRows.length).toBeGreaterThanOrEqual(1)
    expect(
      view.turn.toolRows.some((r) => r.label.includes('已搜索网页'))
    ).toBe(true)
    expect(view.turn.markdownParts.join('\n')).toContain('WeixinJSBridge')
    expect(view.turn.markdownParts.join('\n')).toContain('visualViewport')
  })

  it('tool rows merge by id so completed overwrites running', () => {
    const view = foldCaptureToView(capture)
    const search1 = view.turn.toolRows.find((r) => r.id === 'tool-search-1')
    expect(search1?.status).toBe('completed')
    expect(search1?.items.length).toBeGreaterThan(0)
  })
})
