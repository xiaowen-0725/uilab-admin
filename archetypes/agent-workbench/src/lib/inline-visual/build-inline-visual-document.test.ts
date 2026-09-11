import { describe, expect, it } from 'vitest'
import {
  INLINE_VISUAL_LABEL,
  INLINE_VISUAL_RESIZE_TYPE,
  INLINE_VISUAL_SOURCE_MAX_BYTES,
  buildInlineVisualDocument,
  extractInlineVisualTitle,
  isInlineVisualSourceTooLarge,
  peelVisualFragment,
} from './build-inline-visual-document'

describe('buildInlineVisualDocument', () => {
  it('wraps a fragment and stamps nonce only on the height reporter', () => {
    const srcdoc = buildInlineVisualDocument({
      html: '<title>方案对比</title><div class="card">A vs B</div><script>alert(1)</script>',
      nonce: 'host-nonce',
    })
    expect(srcdoc).toContain('<div class="card">A vs B</div>')
    expect(srcdoc).toContain('nonce="host-nonce"')
    expect(srcdoc).toContain(INLINE_VISUAL_RESIZE_TYPE)
    expect(srcdoc).not.toContain('alert(1)')
    expect(srcdoc).not.toContain('widget.ready')
    expect(srcdoc.match(/<script/gi)?.length).toBe(1)
  })

  it('peels a full document body and drops nested iframes', () => {
    const fragment = peelVisualFragment(
      '<!doctype html><html><body><p>ok</p><iframe src="https://evil.example"></iframe></body></html>',
    )
    expect(fragment).toBe('<p>ok</p>')
  })

  it('prefers fence meta, then title, then heading', () => {
    expect(extractInlineVisualTitle('<h1>忽略</h1>', ' 两列对比 ')).toBe(
      '两列对比',
    )
    expect(extractInlineVisualTitle('<title>方案 A vs B</title><h1>忽略</h1>')).toBe(
      '方案 A vs B',
    )
    expect(extractInlineVisualTitle('<h2>只剩标题</h2>')).toBe('只剩标题')
    expect(extractInlineVisualTitle('<p>没有标题</p>')).toBe(INLINE_VISUAL_LABEL)
  })

  it('rejects oversized source before wrapping', () => {
    const huge = `<div>${'x'.repeat(INLINE_VISUAL_SOURCE_MAX_BYTES + 1)}</div>`
    expect(isInlineVisualSourceTooLarge(huge)).toBe(true)
    expect(isInlineVisualSourceTooLarge('<div>ok</div>')).toBe(false)
  })
})
