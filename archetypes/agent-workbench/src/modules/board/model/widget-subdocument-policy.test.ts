import { describe, expect, it } from 'vitest'
import {
  WIDGET_IFRAME_SANDBOX,
  buildHostDocumentCsp,
  buildWidgetIframeCsp,
  hostCspCoversWidgetCsp,
} from './widget-subdocument-policy'

const NONCE = 'test-nonce'

describe('widget subdocument policy', () => {
  it('keeps the widget iframe sandbox at allow-scripts only', () => {
    expect(WIDGET_IFRAME_SANDBOX).toBe('allow-scripts')
    expect(WIDGET_IFRAME_SANDBOX).not.toContain('allow-same-origin')
  })

  it('lets the ADR host policy cover the widget iframe csp', () => {
    const host = buildHostDocumentCsp({
      nonce: NONCE,
      sidecarPort: '3141',
      includeDevWebSocket: true,
    })
    const widget = buildWidgetIframeCsp(NONCE)
    expect(hostCspCoversWidgetCsp(host, widget)).toEqual({ ok: true })
  })

  it('fails closed when the host drops img-src data:', () => {
    const host = buildHostDocumentCsp({
      nonce: NONCE,
      sidecarPort: '3141',
      includeDevWebSocket: false,
    }).replace('img-src \'self\' data: blob:', 'img-src \'self\' blob:')
    const widget = buildWidgetIframeCsp(NONCE)
    const result = hostCspCoversWidgetCsp(host, widget)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toContain('img-src data:')
    }
  })
})
