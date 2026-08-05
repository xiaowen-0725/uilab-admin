/**
 * Progressive fold tests for V2 gold workflow capture.
 */
import { describe, expect, it } from 'vitest'
import { getEventStreamCapture } from '@/config/captures'
import { captureMaxTs, foldCaptureToView } from './stream-events'

describe('capture progressive replay (case-fixture-workflow-replay)', () => {
  const capture = getEventStreamCapture('case-fixture-workflow-replay')
  const maxTs = captureMaxTs(capture)

  it('has ~40s multi-step timeline', () => {
    expect(capture.id).toBe('case-fixture-workflow-replay')
    expect(maxTs).toBeGreaterThanOrEqual(40_000)
    expect(capture.events.length).toBeGreaterThan(10)
  })

  it('untilTs early: 正在思考, no tools completed set', () => {
    const view = foldCaptureToView(capture, { untilTs: 100 })
    expect(view.turn.status).toBe('running')
    expect(view.turn.statusLabel).toBe('正在思考')
    expect(view.liveStatus).toBe('正在思考')
    expect(view.turn.markdownParts).toHaveLength(0)
  })

  it('untilTs mid-read: liveStatus reflects file read', () => {
    const view = foldCaptureToView(capture, { untilTs: 4000 })
    expect(view.turn.status).toBe('running')
    expect(view.liveStatus).toMatch(/读取|计划/)
    expect(view.turn.toolRows.length).toBeGreaterThanOrEqual(1)
  })

  it('full fold: completed 40s duration, tools, markdown, liveStatus cleared', () => {
    const view = foldCaptureToView(capture)
    expect(view.turn.status).toBe('completed')
    expect(view.turn.statusLabel).toBe('已处理')
    expect(view.turn.durationLabel).toBe('40s')
    expect(view.liveStatus).toBeNull()
    expect(view.turn.toolRows.length).toBeGreaterThanOrEqual(4)
    expect(view.turn.toolRows.every((r) => r.defaultExpanded === false)).toBe(
      true,
    )
    const md = view.turn.markdownParts.join('\n')
    expect(md).toMatch(/工作流|workflow-result/)
  })
})

