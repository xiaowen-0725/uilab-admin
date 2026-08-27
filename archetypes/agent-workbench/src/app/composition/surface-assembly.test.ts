import { describe, expect, it, vi } from 'vitest'
import {
  createWorkbenchSurfaceRegistry,
  openWorkSurfaceFromDeliverables,
  openWorkSurfaceFromFileRef,
  openWorkSurfaceFromRuntimePayload,
} from './surface-assembly'
import { createMemoryBoardStore } from '@/modules/board'
import type { DocumentContentPort } from '@/modules/work-surface'

function stubDocumentContent(): DocumentContentPort {
  return {
    readText: async () => ({
      ok: false,
      reason: 'not-found',
      message: 'stub',
    }),
  }
}

describe('createWorkbenchSurfaceRegistry', () => {
  it('registers Document before test so workspace paths resolve to document', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent(), null)
    const kinds = registry.list().map((d) => d.kind)
    expect(kinds.indexOf('document')).toBeLessThan(kinds.indexOf('test'))
    expect(kinds).toContain('browser')
    expect(kinds).toContain('document')
    expect(kinds).toContain('test')
  })

  it('registers a board surface when wiring is provided', () => {
    const registry = createWorkbenchSurfaceRegistry(
      stubDocumentContent(),
      null,
      {
        store: createMemoryBoardStore(),
        onOpenFull: () => {},
        onClosePreview: () => {},
      },
    )
    expect(registry.get('board')?.kind).toBe('board')
  })
})

describe('open channels', () => {
  it('user channel opens validated Timeline file ref', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent())
    const open = vi.fn()
    const ok = openWorkSurfaceFromFileRef(registry, open, {
      path: 'notes/readme.md',
      label: 'readme.md',
    })
    expect(ok).toBe(true)
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'user',
        kind: 'document',
        resourceKey: expect.stringContaining('readme.md'),
      }),
    )
  })

  it('user channel opens https Timeline ref as browser', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent())
    const open = vi.fn()
    const ok = openWorkSurfaceFromFileRef(registry, open, {
      path: 'https://example.com/',
      label: '示例',
    })
    expect(ok).toBe(true)
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'user',
        kind: 'browser',
        resourceKey: expect.stringMatching(/^https:\/\/example\.com\/?$/),
        title: '示例',
      }),
    )
  })

  it('user channel rejects empty ref', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent())
    const open = vi.fn()
    expect(
      openWorkSurfaceFromFileRef(registry, open, { path: '  ', label: '' }),
    ).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('runtime channel validates intent before open', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent())
    const open = vi.fn()
    const ok = openWorkSurfaceFromRuntimePayload(registry, open, {
      kind: 'browser',
      resourceKey: 'https://example.com',
      title: 'Example',
      focus: 'pane',
    })
    expect(ok).toBe(true)
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'runtime',
        kind: 'browser',
        resourceKey: expect.stringMatching(/^https:\/\/example\.com\/?$/),
      }),
    )
  })

  it('runtime channel rejects illegal path', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent())
    const open = vi.fn()
    const ok = openWorkSurfaceFromRuntimePayload(registry, open, {
      kind: 'document',
      resourceKey: '../secret',
    })
    expect(ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('opens all openable deliverables and activates the featured path', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent())
    const open = vi.fn()
    const ok = openWorkSurfaceFromDeliverables(registry, open, {
      items: [
        { path: 'src/app.ts', source: 'file', changeKind: 'updated' },
        { path: 'poems.md', source: 'file', changeKind: 'created' },
        { path: 'gone.md', source: 'file', changeKind: 'deleted' },
      ],
      activatePath: 'poems.md',
    })
    expect(ok).toBe(true)
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        resourceKey: expect.stringContaining('app.ts'),
        focus: 'tab',
        source: 'user',
      }),
    )
    expect(open.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        resourceKey: expect.stringContaining('poems.md'),
        focus: 'pane',
        source: 'user',
      }),
    )
  })

  it('returns false when no deliverable is openable', () => {
    const registry = createWorkbenchSurfaceRegistry(stubDocumentContent())
    const open = vi.fn()
    expect(
      openWorkSurfaceFromDeliverables(registry, open, {
        items: [{ path: 'gone.md', source: 'file', changeKind: 'deleted' }],
      }),
    ).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
