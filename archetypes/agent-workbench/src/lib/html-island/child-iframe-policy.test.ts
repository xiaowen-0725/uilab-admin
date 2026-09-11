import { describe, expect, it } from 'vitest'
import {
  CHILD_IFRAME_CSP_TEMPLATE,
  CHILD_IFRAME_SANDBOX,
  buildChildIframeCsp,
} from './child-iframe-policy'

describe('child iframe policy', () => {
  it('keeps sandbox at allow-scripts only', () => {
    expect(CHILD_IFRAME_SANDBOX).toBe('allow-scripts')
    expect(CHILD_IFRAME_SANDBOX).not.toContain('allow-same-origin')
  })

  it('reuses the ADR-0021 child CSP including connect-src none', () => {
    const csp = buildChildIframeCsp('host-nonce')
    expect(CHILD_IFRAME_CSP_TEMPLATE).toContain("connect-src 'none'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("script-src 'nonce-host-nonce'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain('widget.ready')
  })
})
