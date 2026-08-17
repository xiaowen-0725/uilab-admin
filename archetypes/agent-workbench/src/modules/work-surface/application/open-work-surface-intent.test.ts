import { describe, expect, it } from 'vitest'
import { createSurfaceRegistry } from './surface-registry'
import { createTestSurfaceDefinition } from '../surfaces/test/test-surface'
import { createDocumentSurfaceDefinition } from '../surfaces/document/document-surface'
import { createBrowserSurfaceDefinition } from '../surfaces/browser/browser-surface'
import { createMemoryDocumentContent } from '../adapters/memory-document-content'
import { resolveOpenWorkSurfaceIntent } from './open-work-surface-intent'

function registry() {
  const r = createSurfaceRegistry()
  r.register(
    createDocumentSurfaceDefinition({ content: createMemoryDocumentContent() }),
  )
  r.register(
    createBrowserSurfaceDefinition({
      host: { openExternal: async () => {} },
    }),
  )
  r.register(createTestSurfaceDefinition())
  return r
}

describe('resolveOpenWorkSurfaceIntent', () => {
  it('accepts document paths and rejects escape', () => {
    const r = registry()
    const ok = resolveOpenWorkSurfaceIntent(r, {
      resourceKey: 'fixture/notes/plan.txt',
      source: 'user',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.kind).toBe('document')
      expect(ok.resourceKey).toBe('fixture/notes/plan.txt')
    }

    const bad = resolveOpenWorkSurfaceIntent(r, {
      resourceKey: '../secret',
      source: 'runtime',
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toBe('invalid-path')
  })

  it('accepts https browser and rejects file://', () => {
    const r = registry()
    const ok = resolveOpenWorkSurfaceIntent(r, {
      kind: 'browser',
      resourceKey: 'https://example.com/',
      source: 'runtime',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.kind).toBe('browser')

    const file = resolveOpenWorkSurfaceIntent(r, {
      kind: 'browser',
      resourceKey: 'file:///tmp/x',
      source: 'runtime',
    })
    expect(file.ok).toBe(false)
  })

  it('rejects explicit unregistered kind (no silent document fallback)', () => {
    const r = registry()
    const review = resolveOpenWorkSurfaceIntent(r, {
      kind: 'review',
      resourceKey: 'fixture/notes/plan.txt',
      source: 'runtime',
    })
    expect(review.ok).toBe(false)
    if (!review.ok) expect(review.reason).toBe('unresolved-kind')
  })

  it('rejects drive and UNC paths', () => {
    const r = registry()
    expect(
      resolveOpenWorkSurfaceIntent(r, {
        resourceKey: 'C:/Windows/x',
        source: 'user',
      }).ok,
    ).toBe(false)
    expect(
      resolveOpenWorkSurfaceIntent(r, {
        resourceKey: '//server/share',
        source: 'user',
      }).ok,
    ).toBe(false)
  })

  it('coerces Timeline/tool host paths via virtual markers', () => {
    const r = registry()
    const ok = resolveOpenWorkSurfaceIntent(r, {
      resourceKey: '/Users/me/ws/output/report.md',
      source: 'user',
      title: 'report.md',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.kind).toBe('document')
      expect(ok.resourceKey).toBe('output/report.md')
      expect(ok.title).toBe('report.md')
    }

    const notes = resolveOpenWorkSurfaceIntent(r, {
      resourceKey: '/tmp/agent/notes/seed.md',
      source: 'runtime',
    })
    expect(notes.ok).toBe(true)
    if (notes.ok) {
      expect(notes.resourceKey).toBe('notes/seed.md')
    }
  })

  it('keeps an explicit board id out of path normalization', () => {
    const r = registry()
    r.register({
      kind: 'board',
      displayName: '看板',
      render: () => null,
    })
    const ok = resolveOpenWorkSurfaceIntent(r, {
      kind: 'board',
      resourceKey: 'board-daily',
      source: 'user',
      title: '每日速递',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.kind).toBe('board')
      expect(ok.resourceKey).toBe('board-daily')
      expect(ok.title).toBe('每日速递')
    }
  })

  it('accepts filenames with ".." characters (not parent segment)', () => {
    const r = registry()
    const ok = resolveOpenWorkSurfaceIntent(r, {
      resourceKey: 'notes/v1..v2.md',
      source: 'user',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.kind).toBe('document')
      expect(ok.resourceKey).toBe('notes/v1..v2.md')
    }
  })
})

