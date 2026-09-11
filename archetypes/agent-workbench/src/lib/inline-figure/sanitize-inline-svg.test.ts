import { describe, expect, it } from 'vitest'
import {
  INLINE_FIGURE_SOURCE_MAX_BYTES,
  sanitizeInlineSvg,
  type SanitizedSvgNode,
} from './sanitize-inline-svg'

function namedChild(
  node: SanitizedSvgNode,
  tag: string,
): SanitizedSvgNode | undefined {
  for (const child of node.children) {
    if (typeof child !== 'string' && child.tag === tag) return child
  }
  return undefined
}

describe('sanitizeInlineSvg', () => {
  it('keeps geometry, author fill, currentColor, and title text', () => {
    const result = sanitizeInlineSvg(`
      <svg viewBox="0 0 10 10">
        <title>用量</title>
        <rect width="10" height="10" fill="#dc2626"/>
        <path d="M0 0 L10 10" stroke="currentColor"/>
      </svg>
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.titleText).toBe('用量')
    expect(result.root.tag).toBe('svg')
    expect(namedChild(result.root, 'rect')?.attrs.fill).toBe('#dc2626')
    expect(namedChild(result.root, 'path')?.attrs.stroke).toBe('currentColor')
  })

  it('prefixes ids and rewrites url(#id) paints', () => {
    const result = sanitizeInlineSvg(`
      <svg viewBox="0 0 10 10">
        <defs>
          <linearGradient id="g">
            <stop offset="0" stop-color="#dc2626"/>
            <stop offset="1" stop-color="#0cbf5b"/>
          </linearGradient>
        </defs>
        <rect width="10" height="10" fill="url(#g)"/>
      </svg>
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const serialized = JSON.stringify(result.root)
    expect(serialized).not.toContain('"id":"g"')
    expect(serialized).not.toContain('url(#g)')
    expect(serialized).toMatch(/"id":"if-[0-9a-f]+-g"/)
    expect(serialized).toMatch(/url\(#if-[0-9a-f]+-g\)/)
  })

  it('fails closed on script, event handlers, foreignObject, use, and href', () => {
    const cases = [
      `<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
      `<svg viewBox="0 0 10 10"><rect width="10" height="10" onclick="alert(1)"/></svg>`,
      `<svg viewBox="0 0 10 10"><foreignObject width="10" height="10"><div/></foreignObject></svg>`,
      `<svg viewBox="0 0 10 10"><use href="#x"/></svg>`,
      `<svg viewBox="0 0 10 10"><rect width="10" height="10" href="https://example.com"/></svg>`,
    ]
    for (const source of cases) {
      expect(sanitizeInlineSvg(source).ok).toBe(false)
    }
  })

  it('fails when source exceeds about 64 KiB', () => {
    const pad = 'x'.repeat(INLINE_FIGURE_SOURCE_MAX_BYTES)
    const source = `<svg viewBox="0 0 10 10"><text>${pad}</text></svg>`
    expect(source.length).toBeGreaterThan(INLINE_FIGURE_SOURCE_MAX_BYTES)
    expect(sanitizeInlineSvg(source).ok).toBe(false)
  })

  it('fails when the root is not svg', () => {
    expect(sanitizeInlineSvg('<g><rect width="1" height="1"/></g>').ok).toBe(
      false,
    )
  })
})
