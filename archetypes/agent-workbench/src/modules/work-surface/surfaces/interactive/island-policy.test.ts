import { describe, expect, it } from 'vitest'
import {
  INTERACTIVE_IFRAME_CSP_TEMPLATE,
  INTERACTIVE_IFRAME_SANDBOX,
  buildInteractiveIframeCsp,
} from './island-policy'

describe('interactive island policy', () => {
  it('keeps sandbox at allow-scripts only', () => {
    expect(INTERACTIVE_IFRAME_SANDBOX).toBe('allow-scripts')
    expect(INTERACTIVE_IFRAME_SANDBOX).not.toContain('allow-same-origin')
  })

  it('reuses the ADR-0021 child CSP including connect-src none', () => {
    const csp = buildInteractiveIframeCsp('host-nonce')
    expect(INTERACTIVE_IFRAME_CSP_TEMPLATE).toContain("connect-src 'none'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("script-src 'nonce-host-nonce'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain('widget.ready')
  })
})
