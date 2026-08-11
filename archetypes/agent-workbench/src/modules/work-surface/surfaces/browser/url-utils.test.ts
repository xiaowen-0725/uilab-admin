import { describe, expect, it } from 'vitest'
import { normalizeBrowserUrl, sandboxForTrust } from './url-utils'

describe('normalizeBrowserUrl', () => {
  it('accepts https and localhost http', () => {
    expect(normalizeBrowserUrl('https://example.com/a').ok).toBe(true)
    const local = normalizeBrowserUrl('http://localhost:5173/')
    expect(local.ok).toBe(true)
    if (local.ok) expect(local.trust).toBe('trusted-preview')
  })

  it('rejects file:// and non-local http', () => {
    expect(normalizeBrowserUrl('file:///etc/passwd').ok).toBe(false)
    expect(normalizeBrowserUrl('http://example.com').ok).toBe(false)
  })

  it('accepts blob URLs as trusted-preview', () => {
    const r = normalizeBrowserUrl('blob:https://example.com/uuid')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.trust).toBe('trusted-preview')
  })

  it('sandbox differs by trust', () => {
    expect(sandboxForTrust('trusted-preview')).toContain('allow-same-origin')
    expect(sandboxForTrust('untrusted-url')).not.toContain('allow-same-origin')
  })
})
