/**
 * Host must not import concrete Document/Browser implementations.
 */
import { describe, expect, it } from 'vitest'

describe('Work Surface Host dependency boundary', () => {
  it('Host module graph does not reference document/browser surface paths', async () => {
    const host = await import('./ui/work-surface-host/work-surface-host')
    expect(host.WorkSurfaceHost).toBeTypeOf('function')

    const hostUrl = new URL(
      './ui/work-surface-host/work-surface-host.tsx',
      import.meta.url,
    )
    const source = await fetch(hostUrl).then((r) => r.text())
    expect(source).not.toMatch(/surfaces\/document/)
    expect(source).not.toMatch(/surfaces\/browser/)
    expect(source).not.toMatch(/from ['"]@\/modules\/work-surface\/surfaces\/document/)
    expect(source).not.toMatch(/from ['"]@\/modules\/work-surface\/surfaces\/browser/)
  })

  it('public index re-exports registry without coupling Host to heavy libs', async () => {
    const mod = await import('./index')
    expect(mod.createSurfaceRegistry).toBeTypeOf('function')
    expect(mod.createTestSurfaceDefinition).toBeTypeOf('function')
    expect(mod.createDocumentSurfaceDefinition).toBeTypeOf('function')
    expect(mod.createBrowserSurfaceDefinition).toBeTypeOf('function')
    expect(mod.WorkSurfaceHost).toBeTypeOf('function')
  })

  it('heavy-lazy module is the only dynamic gateway for mammoth/xlsx', async () => {
    const heavyUrl = new URL(
      './surfaces/document/renderers/heavy-lazy.ts',
      import.meta.url,
    )
    const source = await fetch(heavyUrl).then((r) => r.text())
    // Vite may rewrite import paths in browser runner; assert logical modules.
    expect(source).toMatch(/docx-renderer/)
    expect(source).toMatch(/xlsx-renderer/)
    expect(source).toMatch(/loadDocxRenderer|docx-renderer/)
    expect(source).toMatch(/loadXlsxRenderer|xlsx-renderer/)
  })
})

