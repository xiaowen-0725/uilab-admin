import { describe, expect, it } from 'vitest'
import { getEventStreamCapture } from '@/config/captures'
import { captureMaxTs, foldCaptureToView } from './stream-events'

describe('case-flychess-codex-replay', () => {
  const capture = getEventStreamCapture('case-flychess-codex-replay')

  it('is registered and progressive-friendly', () => {
    expect(capture.id).toBe('case-flychess-codex-replay')
    expect(captureMaxTs(capture)).toBeGreaterThanOrEqual(90_000)
    expect(
      capture.events.some(
        (e) => e.type === 'tool_activity' && e.toolKind === 'web_search',
      ),
    ).toBe(true)
  })

  it('interleaves multi-phase assistant commentary (not only terminal delivery)', () => {
    const assistants = capture.events.filter((e) => e.type === 'assistant_message')
    // plan → after skills → research conclusion → before write → after html → before verify → a1 → a2
    expect(assistants.length).toBeGreaterThanOrEqual(6)

    const texts = assistants.map((e) =>
      e.type === 'assistant_message' ? e.markdown : '',
    )
    expect(texts.some((t) => /不启动子智能体|串行完成/.test(t))).toBe(true)
    expect(texts.some((t) => /多版本|固定单文件|公开网页调研/.test(t))).toBe(true)
    expect(texts.some((t) => /调研结论|掷 6|热座/.test(t))).toBe(true)
    expect(texts.some((t) => /wb-file:flychess\/index\.html/.test(t))).toBe(true)
  })

  it('models reasoning summaries as trajectory rows, separate from commentary', () => {
    const reasoningRows = capture.events.filter(
      (e) =>
        e.type === 'tool_activity' &&
        e.detail === 'reasoning' &&
        e.status === 'completed',
    )
    expect(reasoningRows.length).toBeGreaterThanOrEqual(3)
    expect(
      reasoningRows.some(
        (e) =>
          e.type === 'tool_activity' &&
          /Planning fixed sequence|Implementing directory/.test(e.label),
      ),
    ).toBe(true)

    // Must not be the only live-status source: completed-only, so mid-stream live
    // status still comes from running tools / turn_status.
    expect(reasoningRows.every((e) => e.type === 'tool_activity' && e.status === 'completed')).toBe(
      true,
    )
  })

  it('uses a single web_search with multi-query items (queries[])', () => {
    const searchIds = new Set(
      capture.events
        .filter((e) => e.type === 'tool_activity' && e.toolKind === 'web_search')
        .map((e) => e.id),
    )
    expect(searchIds.size).toBe(1)

    const done = capture.events.find(
      (e) =>
        e.type === 'tool_activity' &&
        e.toolKind === 'web_search' &&
        e.status === 'completed',
    )
    expect(done?.type).toBe('tool_activity')
    if (done?.type === 'tool_activity') {
      const queries = (done.items ?? []).filter((i) => i.startsWith('q:'))
      expect(queries.length).toBeGreaterThanOrEqual(3)
      expect(done.detail).toMatch(/queries\[\]|web_search_end/)
    }
  })

  it('mid-stream shows early commentary + running/completed tools before writes finish', () => {
    // After research conclusion (ts 21000) but before html write completes (52000)
    const mid = foldCaptureToView(capture, { untilTs: 22_000 })
    expect(mid.turn.status).toBe('running')
    expect(mid.turn.toolRows.length).toBeGreaterThan(0)
    expect(mid.turn.toolRows.some((r) => r.toolKind === 'web_search')).toBe(true)

    const md = mid.turn.markdownParts.join('\n')
    expect(md).toMatch(/计划如下|不启动子智能体/)
    expect(md).toMatch(/调研结论|公开网页调研|固定单文件/)
    // Delivery table not yet
    expect(md).not.toMatch(/## 交付/)
  })

  it('progressive: commentary appears before write tools complete', () => {
    const beforeWrite = foldCaptureToView(capture, { untilTs: 31_000 })
    expect(beforeWrite.turn.markdownParts.join('\n')).toMatch(/创建目录|单文件/)
    expect(beforeWrite.turn.toolRows.some((r) => /已写入/.test(r.label))).toBe(
      false,
    )

    const afterHtml = foldCaptureToView(capture, { untilTs: 55_000 })
    expect(afterHtml.turn.toolRows.some((r) => /已写入 index\.html/.test(r.label))).toBe(
      true,
    )
    expect(afterHtml.turn.markdownParts.join('\n')).toMatch(/README\.md/)
  })

  it('full fold ends completed with 已处理, file writes, markdown links', () => {
    const view = foldCaptureToView(capture)
    expect(view.turn.status).toBe('completed')
    expect(view.turn.statusLabel).toBe('已处理')
    expect(view.turn.durationLabel).toBe('5m 7s')
    expect(view.liveStatus).toBeNull()

    const writes = view.turn.toolRows.filter((r) => /已写入/.test(r.label))
    expect(writes.length).toBeGreaterThanOrEqual(2)
    expect(writes.some((r) => r.items.some((i) => i.includes('flychess/index.html')))).toBe(
      true,
    )
    expect(writes.some((r) => r.items.some((i) => i.includes('flychess/README.md')))).toBe(
      true,
    )

    const md = view.turn.markdownParts.join('\n')
    expect(md).toMatch(/wb-file:flychess\/index\.html/)
    expect(md).toMatch(/wb-file:flychess\/README\.md/)
    expect(md).toMatch(/单线程|无子智能体/)
    // Intermediate prose still present in full fold (main column density)
    expect(md).toMatch(/调研结论/)
    expect(md).toMatch(/不启动子智能体|串行完成/)

    // Reasoning stays on tool trajectory (collapses with tools), not only in prose
    expect(
      view.turn.toolRows.some((r) => /Planning fixed sequence/.test(r.label)),
    ).toBe(true)
    expect(view.turn.toolRows.some((r) => r.detail === 'reasoning')).toBe(true)
  })
})
