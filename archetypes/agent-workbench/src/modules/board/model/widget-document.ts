/**
 * Board Widget document assembly — pure, no React.
 *
 * A widget is delivered as an opaque-origin `srcdoc` iframe. Two things carry
 * the isolation, and both are enforced here rather than left to the widget:
 *
 * - `sandbox="allow-scripts"` and nothing else. `allow-same-origin` alongside
 *   `allow-scripts` voids the sandbox entirely (the child can then delete its
 *   own sandbox attribute), so it must never appear. That also rules out
 *   reusing `work-surface`'s `sandboxForTrust()`, which grants both for
 *   localhost `src=` previews.
 * - `csp="… connect-src 'none' …"` on the iframe element. This is what turns
 *   "widgets never reach the network directly" from a convention into something
 *   the browser enforces; a host-level `connect-src 'self'` would resolve to
 *   the host origin and actually hand widgets a door to our own endpoints.
 *
 * `srcdoc` documents inherit the host's policy container, so scripts are
 * nonce-stamped: the host never needs `'unsafe-inline'` for itself.
 */

/** The only sandbox token Board Widgets get. */
export const WIDGET_SANDBOX = 'allow-scripts'

export type WidgetTheme = 'light' | 'dark'

export interface WidgetDocumentInput {
  nonce: string
  css: string
  script: string
  /** First-paint theme only; later changes arrive over the bridge. */
  theme: WidgetTheme
}

export function createWidgetNonce(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function widgetCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join('; ')
}

/** Host → widget messages. */
export type WidgetInboundMessage =
  | { type: 'init'; data: unknown; theme: WidgetTheme; input: unknown }
  | { type: 'data'; data: unknown; dataState: string }
  | { type: 'theme'; theme: WidgetTheme }

/** Widget → host messages. */
export type WidgetOutboundMessage =
  | { type: 'ready'; height: number }
  | { type: 'resize'; height: number }
  | { type: 'heartbeat' }
  | { type: 'save-input'; input: unknown }
  | { type: 'submit'; payload: unknown }
  | { type: 'open-link'; href: string }
  | { type: 'error'; message: string }

export const WIDGET_HANDSHAKE = 'board-widget/handshake'

/** Widget liveness: SDK beats every 2s, host calls it stale after 3 misses. */
export const WIDGET_HEARTBEAT_MS = 2000
export const WIDGET_STALE_MS = 7000
/** A widget that never signals ready is reported as failed, not hung. */
export const WIDGET_READY_TIMEOUT_MS = 6000

const SDK_SOURCE = [
  '(function () {',
  '  var port = null;',
  '  var state = { data: null, theme: "light", input: null };',
  '  var dataListeners = [];',
  '  var themeListeners = [];',
  '  var lastHeight = 0;',
  '  var readySent = false;',
  '',
  '  function send(message) {',
  '    if (port) { try { port.postMessage(message); } catch (error) {} }',
  '  }',
  '',
  '  function measure() {',
  '    var body = document.body;',
  '    if (!body) return 0;',
  '    return Math.ceil(body.scrollHeight);',
  '  }',
  '',
  '  function reportHeight() {',
  '    var height = measure();',
  '    if (height === lastHeight) return;',
  '    lastHeight = height;',
  '    send({ type: "resize", height: height });',
  '  }',
  '',
  '  function notify(listeners, value) {',
  '    for (var i = 0; i < listeners.length; i += 1) {',
  '      try { listeners[i](value); } catch (error) { fail(error); }',
  '    }',
  '  }',
  '',
  '  function fail(error) {',
  '    var message = error && error.message ? error.message : String(error);',
  '    send({ type: "error", message: message });',
  '  }',
  '',
  '  function applyTheme(theme) {',
  '    state.theme = theme;',
  '    document.documentElement.setAttribute("data-widget-theme", theme);',
  '    notify(themeListeners, theme);',
  '  }',
  '',
  '  var widget = {',
  '    get data() { return state.data; },',
  '    get theme() { return state.theme; },',
  '    capabilities: { network: false, storage: "host", modals: false },',
  '    onData: function (callback) {',
  '      dataListeners.push(callback);',
  '      if (state.data !== null) { try { callback(state.data); } catch (e) { fail(e); } }',
  '    },',
  '    onTheme: function (callback) { themeListeners.push(callback); },',
  '    getInput: function () { return state.input; },',
  '    saveInput: function (value) {',
  '      state.input = value;',
  '      send({ type: "save-input", input: value });',
  '    },',
  '    submit: function (payload) { send({ type: "submit", payload: payload }); },',
  '    openLink: function (href) { send({ type: "open-link", href: String(href) }); },',
  '    ready: function () {',
  '      if (readySent) return;',
  '      readySent = true;',
  '      lastHeight = measure();',
  '      send({ type: "ready", height: lastHeight });',
  '    },',
  '  };',
  '',
  '  window.widget = widget;',
  '',
  '  window.addEventListener("error", function (event) {',
  '    fail(event.error || event.message);',
  '  });',
  '  window.addEventListener("unhandledrejection", function (event) {',
  '    fail(event.reason);',
  '  });',
  '',
  '  window.addEventListener("message", function (event) {',
  '    var payload = event.data;',
  '    if (!payload || payload.type !== "__HANDSHAKE__") return;',
  '    if (!event.ports || event.ports.length === 0) return;',
  '    port = event.ports[0];',
  '    port.onmessage = function (message) {',
  '      var inbound = message.data;',
  '      if (!inbound || typeof inbound.type !== "string") return;',
  '      if (inbound.type === "init") {',
  '        state.data = inbound.data;',
  '        state.input = inbound.input;',
  '        applyTheme(inbound.theme);',
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
  '    window.setInterval(function () { send({ type: "heartbeat" }); }, __HEARTBEAT__);',
  '  });',
  '',
  '  var started = false;',
  '  function runWidget() {',
  '    if (started) return;',
  '    started = true;',
  '    try {',
  '      var main = window.__boardWidgetMain__;',
  '      if (typeof main === "function") { main(widget); }',
  '    } catch (error) {',
  '      fail(error);',
  '    }',
  '    widget.ready();',
  '    if (window.ResizeObserver && document.body) {',
  '      new window.ResizeObserver(reportHeight).observe(document.body);',
  '    }',
  '  }',
  '})();',
].join('\n')

function sdkSource(): string {
  return SDK_SOURCE.replace('__HANDSHAKE__', WIDGET_HANDSHAKE).replace(
    '__HEARTBEAT__',
    String(WIDGET_HEARTBEAT_MS),
  )
}

const BASE_STYLE = [
  '*, *::before, *::after { box-sizing: border-box; }',
  'html, body { margin: 0; padding: 0; height: 100%; }',
  'body {',
  '  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;',
  '  color: #18181b;',
  '  background: #ffffff;',
  '  padding: 10px 12px;',
  '}',
  ':root[data-widget-theme="dark"] body { color: #f4f4f5; background: #18181b; }',
].join('\n')

/**
 * Nonce-stamped, CSP-locked single-file document. The widget body is wrapped in
 * `__boardWidgetMain__` so the SDK controls when it runs: it starts only after
 * the host's `init` message, so `widget.data` is already populated by the time
 * a widget's startup code reads it.
 */
export function buildWidgetDocument(input: WidgetDocumentInput): string {
  const nonce = input.nonce
  return [
    '<!doctype html>',
    `<html lang="zh-CN" data-widget-theme="${input.theme}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${widgetCsp(nonce)}">`,
    `<style nonce="${nonce}">${BASE_STYLE}</style>`,
    `<style nonce="${nonce}">${input.css}</style>`,
    '</head>',
    '<body>',
    `<script nonce="${nonce}">window.__boardWidgetMain__ = function (widget) {\n${input.script}\n};<\/script>`,
    `<script nonce="${nonce}">${sdkSource()}<\/script>`,
    '</body>',
    '</html>',
  ].join('\n')
}
