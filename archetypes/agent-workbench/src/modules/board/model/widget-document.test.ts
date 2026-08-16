import { describe, expect, it } from 'vitest'
import {
  WIDGET_HANDSHAKE_TYPE,
  WIDGET_INPUT_KEY_LIMIT,
  WIDGET_INPUT_VALUE_MAX_BYTES,
  WIDGET_MESSAGE_MAX_BYTES,
  WIDGET_THEME_VARS,
  buildWidgetDocument,
  isAllowedOpenLink,
  messageByteLength,
  validateSaveInput,
} from './widget-document'

const NONCE = 'host-nonce-test'

function sampleWidgetHtml(script: string): string {
  return `<!doctype html><html><head><title>w</title></head><body>
<p>hi</p>
<script>window.__ran = true;${script}</script>
</body></html>`
}

describe('buildWidgetDocument', () => {
  it('stamps the host nonce on every script and injects the bridge before widget code', () => {
    const srcdoc = buildWidgetDocument({
      html: sampleWidgetHtml('widget.ready();'),
      nonce: NONCE,
      theme: 'light',
    })

    const scripts = [...srcdoc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    expect(scripts.length).toBeGreaterThanOrEqual(2)
    for (const match of scripts) {
      expect(match[1]).toContain(`nonce="${NONCE}"`)
    }

    const bridgeAt = srcdoc.indexOf('board:init')
    const widgetAt = srcdoc.indexOf('__boardWidgetMains__.push')
    expect(bridgeAt).toBeGreaterThan(-1)
    expect(widgetAt).toBeGreaterThan(bridgeAt)
    expect(srcdoc).toContain('window.widget')
    expect(srcdoc).not.toContain('window.board')
    expect(srcdoc).toContain('submit: function')
    expect(srcdoc).not.toContain("emit('submit'")
    expect(srcdoc).toContain('saveInput: function (key, value)')
    expect(srcdoc).toContain('onDataChange')
  })

  it('injects theme CSS variables and defers the widget body until init', () => {
    const srcdoc = buildWidgetDocument({
      html: sampleWidgetHtml('window.__ran = true;'),
      nonce: NONCE,
      theme: 'dark',
    })

    expect(srcdoc).toContain('--widget-bg')
    expect(srcdoc).toContain(WIDGET_THEME_VARS.dark['--widget-bg'])
    expect(srcdoc).toContain('data-widget-theme="dark"')
    expect(srcdoc).toContain('__boardWidgetMains__')
    expect(srcdoc).not.toMatch(/<script[^>]*>window\.__ran = true;/)
  })

  it('does not wrap JSON script islands', () => {
    const srcdoc = buildWidgetDocument({
      html: `<!doctype html><html><head></head><body>
<script type="application/json">{"k":1}</script>
</body></html>`,
      nonce: NONCE,
      theme: 'light',
    })

    expect(srcdoc).toContain('{"k":1}')
    expect(srcdoc).not.toContain('__boardWidgetMains__.push')
  })
})

describe('openLink and saveInput guards', () => {
  it('accepts only http and https links', () => {
    expect(isAllowedOpenLink('https://example.com/a')).toBe(true)
    expect(isAllowedOpenLink('http://example.com')).toBe(true)
    expect(isAllowedOpenLink('javascript:alert(1)')).toBe(false)
    expect(isAllowedOpenLink('data:text/html,hi')).toBe(false)
    expect(isAllowedOpenLink('blob:https://example.com/1')).toBe(false)
    expect(isAllowedOpenLink('file:///etc/passwd')).toBe(false)
  })

  it('rejects a 17th key and a value over 32 KiB', () => {
    const inputs: Record<string, unknown> = {}
    for (let i = 0; i < WIDGET_INPUT_KEY_LIMIT; i += 1) {
      inputs[`k${i}`] = 'v'
    }

    const overflow = validateSaveInput(inputs, 'extra', 'v')
    expect(overflow.ok).toBe(false)
    if (!overflow.ok) expect(overflow.hint).toContain('16')

    const tooBig = validateSaveInput({}, 'big', 'x'.repeat(WIDGET_INPUT_VALUE_MAX_BYTES + 1))
    expect(tooBig.ok).toBe(false)
    if (!tooBig.ok) expect(tooBig.hint).toContain('32')
  })

  it('allows replacing an existing key without counting it as a new one', () => {
    const inputs = { keep: 'old' }
    const result = validateSaveInput(inputs, 'keep', 'new')
    expect(result).toEqual({ ok: true })
  })
})

describe('message size', () => {
  it('counts UTF-8 bytes of the serialized payload', () => {
    expect(messageByteLength({ type: 'ping' })).toBeLessThan(WIDGET_MESSAGE_MAX_BYTES)
    const huge = { type: 'data', data: '中'.repeat(200_000) }
    expect(messageByteLength(huge)).toBeGreaterThan(WIDGET_MESSAGE_MAX_BYTES)
  })
})

describe('handshake type', () => {
  it('uses the spec name board:init', () => {
    expect(WIDGET_HANDSHAKE_TYPE).toBe('board:init')
  })
})
