/**
 * Widget srcdoc assembly and host-bridge protocol (spec §4).
 *
 * The agent delivers a complete HTML file. The rendering layer rewrites it:
 * stamp the host nonce, inject the bridge before widget code, and inject
 * theme CSS variables. Widget body runs only after `init` arrives.
 */

export type WidgetTheme = 'light' | 'dark'

export const WIDGET_HANDSHAKE_TYPE = 'board:init'

export const WIDGET_READY_TIMEOUT_MS = 8_000
export const WIDGET_READY_RELOAD_LIMIT = 2
export const WIDGET_HEARTBEAT_MS = 5_000
export const WIDGET_HEARTBEAT_MISS_LIMIT = 3
export const WIDGET_INPUT_KEY_LIMIT = 16
export const WIDGET_INPUT_VALUE_MAX_BYTES = 32 * 1024
export const WIDGET_MESSAGE_MAX_BYTES = 512 * 1024

export const WIDGET_THEME_VARS: Record<
  WidgetTheme,
  Record<
    | '--widget-bg'
    | '--widget-fg'
    | '--widget-muted'
    | '--widget-border'
    | '--widget-up'
    | '--widget-down',
    string
  >
> = {
  light: {
    '--widget-bg': '#ffffff',
    '--widget-fg': '#0d0d0d',
    '--widget-muted': '#737373',
    '--widget-border': '#e5e5e5',
    '--widget-up': '#16a34a',
    '--widget-down': '#dc2626',
  },
  dark: {
    '--widget-bg': '#111111',
    '--widget-fg': '#fcfcfc',
    '--widget-muted': '#a3a3a3',
    '--widget-border': 'rgb(255 255 255 / 10%)',
    '--widget-up': '#4ade80',
    '--widget-down': '#f87171',
  },
}

export interface WidgetDocumentInput {
  html: string
  nonce: string
  theme: WidgetTheme
}

export interface WidgetCapabilities {
  canSubmit: boolean
}

export type HostToWidgetMessage =
  | {
      type: 'init'
      data: unknown
      theme: WidgetTheme
      inputs: Record<string, unknown>
      capabilities: WidgetCapabilities
    }
  | { type: 'data'; data: unknown }
  | { type: 'theme'; theme: WidgetTheme }
  | { type: 'ping' }
  | { type: 'hint'; code: string; message: string }

export type WidgetToHostMessage =
  | { type: 'ready' }
  | { type: 'widget-ready' }
  | { type: 'pong' }
  | { type: 'resize'; height: number }
  | { type: 'save-input'; key: string; value: unknown }
  | { type: 'submit'; payload: unknown }
  | { type: 'open-link'; url: string }
  | { type: 'wheel'; deltaY: number }
  | { type: 'error'; message: string }

export type SaveInputResult =
  | { ok: true }
  | { ok: false; hint: string; code: 'input_key_limit' | 'input_value_limit' }

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function messageByteLength(message: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(message) ?? '')
  } catch {
    return WIDGET_MESSAGE_MAX_BYTES + 1
  }
}

export function isAllowedOpenLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateSaveInput(
  inputs: Record<string, unknown>,
  key: string,
  value: unknown,
): SaveInputResult {
  const serialized =
    typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  if (utf8ByteLength(serialized) > WIDGET_INPUT_VALUE_MAX_BYTES) {
    return {
      ok: false,
      code: 'input_value_limit',
      hint: '单个输入不能超过 32 KiB',
    }
  }
  if (!(key in inputs) && Object.keys(inputs).length >= WIDGET_INPUT_KEY_LIMIT) {
    return {
      ok: false,
      code: 'input_key_limit',
      hint: '每个小组件最多保存 16 个输入',
    }
  }
  return { ok: true }
}

export function createHandshakeToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function themeVarBlock(theme: WidgetTheme): string {
  const light = Object.entries(WIDGET_THEME_VARS.light)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')
  const dark = Object.entries(WIDGET_THEME_VARS.dark)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')
  return [
    ':root {',
    light,
    '}',
    ':root[data-widget-theme="dark"] {',
    dark,
    '}',
    '*, *::before, *::after { box-sizing: border-box; }',
    'html, body { margin: 0; padding: 0; min-height: 100%; }',
    'body {',
    '  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;',
    '  color: var(--widget-fg);',
    '  background: var(--widget-bg);',
    '}',
    `html { color-scheme: ${theme}; }`,
  ].join('\n')
}

function isJavascriptType(type: string | undefined): boolean {
  if (!type) return true
  const normalized = type.trim().toLowerCase()
  return (
    normalized === 'module' ||
    normalized === 'text/javascript' ||
    normalized === 'application/javascript' ||
    normalized === 'text/ecmascript' ||
    normalized === 'application/ecmascript'
  )
}

function readAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  if (!match) return undefined
  return match[2] ?? match[3] ?? match[4]
}

function stampNonce(attrs: string, nonce: string): string {
  if (/\bnonce\s*=/i.test(attrs)) {
    return attrs.replace(/\bnonce\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i, `nonce="${nonce}"`)
  }
  return ` nonce="${nonce}"${attrs}`
}

function rewriteScripts(html: string, nonce: string): string {
  return html.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (_full, rawAttrs, body) => {
    const attrs = rawAttrs ?? ''
    const stamped = stampNonce(attrs, nonce)
    if (/\bsrc\s*=/i.test(attrs) || !isJavascriptType(readAttr(attrs, 'type'))) {
      return `<script${stamped}>${body}</script>`
    }
    return `<script${stamped}>window.__boardWidgetMains__=window.__boardWidgetMains__||[];window.__boardWidgetMains__.push(function(widget){\n${body}\n});</script>`
  })
}

function injectIntoHead(html: string, snippet: string): string {
  const head = /<head\b[^>]*>/i.exec(html)
  if (head && head.index !== undefined) {
    const at = head.index + head[0].length
    return html.slice(0, at) + snippet + html.slice(at)
  }
  const htmlTag = /<html\b[^>]*>/i.exec(html)
  if (htmlTag && htmlTag.index !== undefined) {
    const at = htmlTag.index + htmlTag[0].length
    return `${html.slice(0, at)}<head>${snippet}</head>${html.slice(at)}`
  }
  return `<!doctype html><html><head>${snippet}</head><body>${html}</body></html>`
}

function ensureThemeAttr(html: string, theme: WidgetTheme): string {
  if (/<html\b[^>]*\bdata-widget-theme=/i.test(html)) {
    return html.replace(
      /(<html\b[^>]*\bdata-widget-theme=)("([^"]*)"|'([^']*)'|([^\s>]+))/i,
      `$1"${theme}"`,
    )
  }
  if (/<html\b/i.test(html)) {
    return html.replace(/<html\b/i, `<html data-widget-theme="${theme}"`)
  }
  return html
}

function sdkSource(): string {
  return [
    '(function () {',
    '  var port = null;',
    '  var state = { data: null, theme: "light", inputs: {}, capabilities: { canSubmit: false } };',
    '  var dataListeners = [];',
    '  var themeListeners = [];',
    '  var started = false;',
    '  var initArrived = false;',
    '  var documentReady = document.readyState !== "loading";',
    '  var lastHeight = 0;',
    '',
    '  function send(message) {',
    '    if (port) { try { port.postMessage(message); } catch (error) {} }',
    '  }',
    '',
    '  function fail(error) {',
    '    var message = error && error.message ? error.message : String(error);',
    '    send({ type: "error", message: message });',
    '  }',
    '',
    '  function notify(listeners, value) {',
    '    for (var i = 0; i < listeners.length; i += 1) {',
    '      try { listeners[i](value); } catch (error) { fail(error); }',
    '    }',
    '  }',
    '',
    '  function applyTheme(theme) {',
    '    state.theme = theme;',
    '    document.documentElement.setAttribute("data-widget-theme", theme);',
    '    document.documentElement.style.colorScheme = theme;',
    '    notify(themeListeners, theme);',
    '  }',
    '',
    '  function measure() {',
    '    return document.body ? Math.ceil(document.body.scrollHeight) : 0;',
    '  }',
    '',
    '  function reportHeight() {',
    '    var height = measure();',
    '    if (height === lastHeight) return;',
    '    lastHeight = height;',
    '    send({ type: "resize", height: height });',
    '  }',
    '',
    '  function isScrollable(el) {',
    '    if (!el || el === document || el === document.documentElement) return false;',
    '    var style = window.getComputedStyle(el);',
    '    var overflowY = style.overflowY;',
    '    if (overflowY !== "auto" && overflowY !== "scroll") return false;',
    '    return el.scrollHeight > el.clientHeight + 1;',
    '  }',
    '',
    '  function scrollableAncestor(target) {',
    '    var el = target;',
    '    while (el && el !== document && el !== document.body) {',
    '      if (isScrollable(el)) return el;',
    '      el = el.parentElement;',
    '    }',
    '    return null;',
    '  }',
    '',
    '  var widget = {',
    '    get data() { return state.data; },',
    '    get theme() { return state.theme; },',
    '    get capabilities() { return state.capabilities; },',
    '    onDataChange: function (callback) {',
    '      dataListeners.push(callback);',
    '      try { callback(state.data); } catch (error) { fail(error); }',
    '    },',
    '    onThemeChange: function (callback) {',
    '      themeListeners.push(callback);',
    '    },',
    '    resize: function (heightPx) {',
    '      lastHeight = Number(heightPx) || 0;',
    '      send({ type: "resize", height: lastHeight });',
    '    },',
    '    saveInput: function (key, value) {',
    '      state.inputs[String(key)] = value;',
    '      send({ type: "save-input", key: String(key), value: value });',
    '    },',
    '    getInput: function (key) {',
    '      return state.inputs[String(key)];',
    '    },',
    '    submit: function (payload) { send({ type: "submit", payload: payload }); },',
    '    openLink: function (url) { send({ type: "open-link", url: String(url) }); },',
    '    ready: function () { send({ type: "widget-ready" }); }',
    '  };',
    '',
    '  window.widget = widget;',
    '',
    '  function runWidget() {',
    '    if (started || !initArrived || !documentReady) return;',
    '    started = true;',
    '    var mains = window.__boardWidgetMains__ || [];',
    '    for (var i = 0; i < mains.length; i += 1) {',
    '      try { mains[i](widget); } catch (error) { fail(error); }',
    '    }',
    '    if (window.ResizeObserver && document.body) {',
    '      new window.ResizeObserver(reportHeight).observe(document.body);',
    '    }',
    '  }',
    '',
    '  window.addEventListener("error", function (event) { fail(event.error || event.message); });',
    '  window.addEventListener("unhandledrejection", function (event) { fail(event.reason); });',
    '  document.addEventListener("DOMContentLoaded", function () {',
    '    documentReady = true;',
    '    runWidget();',
    '  });',
    '',
    '  document.addEventListener("wheel", function (event) {',
    '    var scroller = scrollableAncestor(event.target);',
    '    if (!scroller) {',
    '      send({ type: "wheel", deltaY: event.deltaY });',
    '      return;',
    '    }',
    '    var atTop = scroller.scrollTop <= 0 && event.deltaY < 0;',
    '    var atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && event.deltaY > 0;',
    '    if (atTop || atBottom) send({ type: "wheel", deltaY: event.deltaY });',
    '  }, { passive: true });',
    '',
    '  window.addEventListener("message", function (event) {',
    '    var payload = event.data;',
    '    if (!payload || payload.type !== "' + WIDGET_HANDSHAKE_TYPE + '") return;',
    '    if (event.source !== window.parent) return;',
    '    if (!event.ports || event.ports.length === 0) return;',
    '    port = event.ports[0];',
    '    port.onmessage = function (message) {',
    '      var inbound = message.data;',
    '      if (!inbound || typeof inbound.type !== "string") return;',
    '      if (inbound.type === "ping") { send({ type: "pong" }); return; }',
    '      if (inbound.type === "init") {',
    '        state.data = inbound.data;',
    '        state.inputs = inbound.inputs && typeof inbound.inputs === "object" ? inbound.inputs : {};',
    '        state.capabilities = inbound.capabilities || { canSubmit: false };',
    '        applyTheme(inbound.theme);',
    '        initArrived = true;',
    '        runWidget();',
    '        return;',
    '      }',
    '      if (inbound.type === "data") {',
    '        state.data = inbound.data;',
    '        notify(dataListeners, inbound.data);',
    '        return;',
    '      }',
    '      if (inbound.type === "theme") { applyTheme(inbound.theme); }',
    '    };',
    '    port.start();',
    '    send({ type: "ready" });',
    '  });',
    '})();',
  ].join('\n')
}

/**
 * Deterministic srcdoc rewrite. Nonce is the host's current value — never
 * assembled in the sidecar.
 */
export function buildWidgetDocument(input: WidgetDocumentInput): string {
  const rewritten = rewriteScripts(ensureThemeAttr(input.html, input.theme), input.nonce)
  const snippet = [
    `<style nonce="${input.nonce}">${themeVarBlock(input.theme)}</style>`,
    `<script nonce="${input.nonce}">${sdkSource()}<\/script>`,
  ].join('')
  return injectIntoHead(rewritten, snippet)
}
