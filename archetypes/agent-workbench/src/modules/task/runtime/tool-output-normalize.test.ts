import { describe, expect, it } from 'vitest'
import {
  TOOL_OUTPUT_ITEMS_MAX,
  TOOL_OUTPUT_SUMMARY_MAX_CHARS,
  normalizeToolOutput,
} from './tool-output-normalize'

describe('normalizeToolOutput', () => {
  it('maps multiline ls listing to expandable items', () => {
    const n = normalizeToolOutput('/notes/ (directory)\n/output/ (directory)')
    expect(n.items).toEqual(['/notes/ (directory)', '/output/ (directory)'])
    expect(n.summary).toBeTruthy()
  })

  it('maps read_file content object to summary', () => {
    const n = normalizeToolOutput({ content: 'hello from read', bytes: 15 })
    expect(n.summary).toContain('hello from read')
    expect(n.items).toBeUndefined()
  })

  it('maps string[] entries to items', () => {
    const n = normalizeToolOutput(['a.txt', 'b.txt', 'c/'])
    expect(n.items).toEqual(['a.txt', 'b.txt', 'c/'])
  })

  it('maps entries array of objects to path lines', () => {
    const n = normalizeToolOutput({
      entries: [
        { path: '/notes', type: 'directory' },
        { path: '/output/README.md', type: 'file' },
      ],
    })
    expect(n.items).toEqual([
      '/notes (directory)',
      '/output/README.md (file)',
    ])
  })

  it('truncates huge summary safely', () => {
    const huge = 'x'.repeat(TOOL_OUTPUT_SUMMARY_MAX_CHARS + 500)
    const n = normalizeToolOutput(huge)
    expect(n.summary?.length).toBeLessThanOrEqual(TOOL_OUTPUT_SUMMARY_MAX_CHARS)
    expect(n.summary?.endsWith('…')).toBe(true)
  })

  it('caps item count for large listings', () => {
    const lines = Array.from(
      { length: TOOL_OUTPUT_ITEMS_MAX + 20 },
      (_, i) => `file-${i}.txt`,
    )
    const n = normalizeToolOutput(lines.join('\n'))
    expect(n.items?.length).toBe(TOOL_OUTPUT_ITEMS_MAX + 1)
    expect(n.items?.[n.items.length - 1]).toMatch(/more/)
  })

  it('redacts obvious secret shapes from summary/items', () => {
    const n = normalizeToolOutput(
      'token=super-secret-value\nAuthorization: Bearer abcdefghijklmnop',
    )
    expect(n.items?.join('\n') ?? n.summary ?? '').not.toMatch(/super-secret-value/)
    expect(n.items?.join('\n') ?? n.summary ?? '').not.toMatch(/abcdefghijklmnop/)
    expect(n.items?.join('\n') ?? n.summary ?? '').toMatch(/\[redacted\]/)
  })

  it('returns empty for null/empty', () => {
    expect(normalizeToolOutput(null)).toEqual({})
    expect(normalizeToolOutput('')).toEqual({})
  })
})
