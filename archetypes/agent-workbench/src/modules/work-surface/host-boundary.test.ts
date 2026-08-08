/**
 * Host must not import concrete Document/Browser implementations.
 * Proves ticket 02 boundary without Document/Browser modules existing yet.
 */
import { describe, expect, it } from 'vitest'

// Static import graph: this test file only pulls Host public entry + registry.
// If Host ever imports `./surfaces/document` or `./surfaces/browser`, bundling
// or future modules would couple — we also assert source text when available.

describe('Work Surface Host dependency boundary', () => {
  it('Host module graph does not reference document/browser surface paths', async () => {
    // Dynamic import of Host entry — fails if Host side-imports missing concrete surfaces.
    const host = await import('./ui/work-surface-host/work-surface-host')
    expect(host.WorkSurfaceHost).toBeTypeOf('function')

    // Source-level guard: fetch module source via import.meta (vite).
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

  it('public index re-exports registry without document/browser', async () => {
    const mod = await import('./index')
    expect(mod.createSurfaceRegistry).toBeTypeOf('function')
    expect(mod.createTestSurfaceDefinition).toBeTypeOf('function')
    expect(mod.WorkSurfaceHost).toBeTypeOf('function')
  })
})
