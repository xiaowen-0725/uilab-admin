import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { InteractiveIslandFrame, readHostCspNonce } from './interactive-island-frame'
import { buildInteractiveIframeCsp } from './island-policy'

describe('InteractiveIslandFrame', () => {
  it('pairs sandbox and ADR-0021 csp on the island iframe', async () => {
    const nonce = readHostCspNonce()
    await render(<InteractiveIslandFrame srcDoc='<!doctype html><p>ok</p>' />)
    const iframe = page.getByTestId('interactive-island-frame').element()
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe.getAttribute('csp')).toBe(buildInteractiveIframeCsp(nonce))
    expect(iframe.getAttribute('csp')).toContain("connect-src 'none'")
  })
})
