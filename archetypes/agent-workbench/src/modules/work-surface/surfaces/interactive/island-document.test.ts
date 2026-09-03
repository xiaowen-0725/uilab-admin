import { describe, expect, it } from 'vitest'
import { buildInteractiveIslandDocument } from './island-document'

describe('buildInteractiveIslandDocument', () => {
  it('stamps the host nonce and does not inject a widget bridge', () => {
    const srcdoc = buildInteractiveIslandDocument({
      html: '<!doctype html><html><body><script>window.__ready = true</script></body></html>',
      nonce: 'host-nonce',
    })
    expect(srcdoc).toContain('nonce="host-nonce"')
    expect(srcdoc).toContain('window.__ready = true')
    expect(srcdoc).not.toContain('widget.ready')
    expect(srcdoc).not.toContain('__boardWidgetMains__')
    expect(srcdoc).not.toContain('window.widget')
    expect(srcdoc).not.toContain('board:init')
  })
})
