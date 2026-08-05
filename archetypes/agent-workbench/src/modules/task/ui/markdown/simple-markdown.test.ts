/**
 * Markdown / patch helpers — structure contracts after Streamdown + Pierre swap.
 * Pure unit tests (no DOM); browser integration still asserts `simple-markdown` nodes.
 */

import { describe, expect, it } from 'vitest'
import { buildUnifiedPatch } from './build-unified-patch'
import { SimpleMarkdown } from './simple-markdown'

describe('SimpleMarkdown (Streamdown wrapper)', () => {
  it('exports a renderable component', () => {
    expect(typeof SimpleMarkdown).toBe('function')
  })
})

describe('buildUnifiedPatch (Pierre processFile input)', () => {
  it('emits headers and +/-/context lines for a mixed hunk', () => {
    const patch = buildUnifiedPatch('src/modules/task/projection/project-events.ts', [
      { type: 'del', text: '  // prior stub' },
      { type: 'add', text: '  // 4D projection for file.changed' },
      { type: 'add', text: '  // liveStatus + meta' },
    ])
    expect(patch).toContain('--- a/src/modules/task/projection/project-events.ts')
    expect(patch).toContain('+++ b/src/modules/task/projection/project-events.ts')
    expect(patch).toContain('-  // prior stub')
    expect(patch).toContain('+  // 4D projection for file.changed')
    expect(patch).toContain('+  // liveStatus + meta')
    // No raw "##" style — this is a patch, not markdown
    expect(patch.startsWith('---')).toBe(true)
  })

  it('counts context lines on both sides', () => {
    const patch = buildUnifiedPatch('a.ts', [
      { type: 'context', text: 'keep' },
      { type: 'del', text: 'old' },
      { type: 'add', text: 'new' },
    ])
    expect(patch).toContain('@@ -1,2 +1,2 @@')
    expect(patch).toContain(' keep')
    expect(patch).toContain('-old')
    expect(patch).toContain('+new')
  })
})
