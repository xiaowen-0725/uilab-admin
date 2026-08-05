/**
 * Progressive capture fold tests (Codex intermediate vs final state discipline).
 * Fixture: case-technical-audit-replay — multi-tool timed events from 4A observation.
 */

import { describe, expect, it } from 'vitest'
import { getEventStreamCapture } from '@/config/captures'
import {
  captureMaxTs,
  foldCaptureToView,
} from './stream-events'

describe('capture progressive replay (case-technical-audit-replay)', () => {
  const capture = getEventStreamCapture('case-technical-audit-replay')
  const maxTs = captureMaxTs(capture)

  it('has multi-second timeline with tools and markdown (not a one-frame stub)', () => {
    expect(capture.events.length).toBeGreaterThan(10)
    expect(maxTs).toBeGreaterThanOrEqual(20_000)
    const toolEvents = capture.events.filter((e) => e.type === 'tool_activity')
    expect(toolEvents.length).toBeGreaterThanOrEqual(6)
    const assistants = capture.events.filter((e) => e.type === 'assistant_message')
    expect(assistants.length).toBeGreaterThanOrEqual(2)
  })

  it('untilTs=0: only user message, still not completed', () => {
    const view = foldCaptureToView(capture, { untilTs: 0 })
    expect(view.userMessages.length).toBe(1)
    expect(view.userMessages[0]?.text).toMatch(/技术审计/)
    // At ts=0 only user_message; turn may stay default running with no status event yet
    expect(view.turn.toolRows).toHaveLength(0)
    expect(view.turn.markdownParts).toHaveLength(0)
    expect(view.turn.status).not.toBe('completed')
  })

  it('untilTs mid-tools: 正在思考 + liveStatus + at least one tool, no final markdown', () => {
    // After first tool completed (~2800) but before assistant (~14000)
    const view = foldCaptureToView(capture, { untilTs: 5000 })
    expect(view.turn.status).toBe('running')
    expect(view.turn.statusLabel).toBe('正在思考')
    expect(view.liveStatus).toBeTruthy()
    expect(view.turn.durationLabel).toBeNull()
    expect(view.turn.toolRows.length).toBeGreaterThanOrEqual(1)
    expect(view.turn.markdownParts.length).toBe(0)
  })

  it('untilTs after first assistant: markdown partial, still running', () => {
    const view = foldCaptureToView(capture, { untilTs: 15_000 })
    expect(view.turn.status).toBe('running')
    expect(view.turn.markdownParts.length).toBeGreaterThanOrEqual(1)
    expect(view.turn.markdownParts.join('\n')).toMatch(/审计结论|模块边界/)
    expect(view.turn.durationLabel).toBeNull()
  })

  it('full fold: completed with duration, tools, full markdown, no liveStatus', () => {
    const view = foldCaptureToView(capture)
    expect(view.turn.status).toBe('completed')
    expect(view.turn.statusLabel).toBe('已处理')
    expect(view.turn.durationLabel).toBeTruthy()
    expect(view.liveStatus).toBeNull()
    expect(view.turn.toolRows.length).toBeGreaterThanOrEqual(3)
    expect(view.turn.markdownParts.length).toBeGreaterThanOrEqual(2)
    const md = view.turn.markdownParts.join('\n')
    expect(md).toMatch(/可执行改进清单/)
    expect(md).toMatch(/Composition Root|Task Module|Foundation/)
  })

  it('monotonic prefixes: more ts never drops prior content', () => {
    const a = foldCaptureToView(capture, { untilTs: 3000 })
    const b = foldCaptureToView(capture, { untilTs: 10_000 })
    const c = foldCaptureToView(capture)
    expect(b.turn.toolRows.length).toBeGreaterThanOrEqual(a.turn.toolRows.length)
    expect(c.turn.toolRows.length).toBeGreaterThanOrEqual(b.turn.toolRows.length)
    expect(c.turn.markdownParts.length).toBeGreaterThanOrEqual(
      b.turn.markdownParts.length,
    )
  })
})
