/**
 * Host / widget subdocument policy (ADR-0021).
 *
 * Widget srcdoc clones the host policy container, so the host grant set must
 * cover every source the iframe `csp=` still needs. The child may only tighten.
 */

export const WIDGET_IFRAME_SANDBOX = 'allow-scripts'

export const CSP_NONCE_PLACEHOLDER = 'WORKBENCH_CSP_NONCE'
export const CSP_DEV_CONNECT_PLACEHOLDER = 'WORKBENCH_DEV_CONNECT'

export interface HostDocumentCspInput {
  nonce: string
  sidecarPort: string
  includeDevWebSocket: boolean
}

export interface CspCoverageOk {
  ok: true
}

export interface CspCoverageFail {
  ok: false
  missing: string[]
}

export type CspCoverageResult = CspCoverageOk | CspCoverageFail

const HOST_DIRECTIVE_ORDER = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'object-src',
  'base-uri',
  'form-action',
] as const

export function buildHostDocumentCsp(input: HostDocumentCspInput): string {
  const connect = ["'self'", `http://127.0.0.1:${input.sidecarPort}`]
  if (input.includeDevWebSocket) {
    connect.push('ws://localhost:5174')
  }
  return joinDirectives({
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${input.nonce}'`],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': connect,
    'frame-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  })
}

/** Gate and runtime share this literal so the pair check cannot drift. */
export const WIDGET_IFRAME_CSP_TEMPLATE =
  "default-src 'none'; script-src 'nonce-__NONCE__'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"

export function buildWidgetIframeCsp(nonce: string): string {
  return WIDGET_IFRAME_CSP_TEMPLATE.replace('__NONCE__', nonce)
}

export function hostCspCoversWidgetCsp(
  hostPolicy: string,
  widgetPolicy: string,
): CspCoverageResult {
  const host = parseCsp(hostPolicy)
  const widget = parseCsp(widgetPolicy)
  const missing: string[] = []

  for (const [directive, widgetSources] of widget) {
    if (isNoneOnly(widgetSources)) continue
    const hostSources = host.get(directive) ?? host.get('default-src') ?? []
    if (isNoneOnly(hostSources)) {
      for (const source of widgetSources) {
        if (source !== "'none'") missing.push(`${directive} ${source}`)
      }
      continue
    }
    for (const source of widgetSources) {
      if (source === "'none'") continue
      if (coversSource(hostSources, source)) continue
      missing.push(`${directive} ${source}`)
    }
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

export function parseCsp(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const raw of policy.split(';')) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const name = tokens[0].toLowerCase()
    directives.set(name, tokens.slice(1))
  }
  return directives
}

function joinDirectives(directives: Record<string, string[]>): string {
  const seen = new Set<string>()
  const names: string[] = []
  for (const name of HOST_DIRECTIVE_ORDER) {
    if (name in directives) {
      seen.add(name)
      names.push(name)
    }
  }
  for (const name of Object.keys(directives)) {
    if (!seen.has(name)) names.push(name)
  }
  return names
    .map((name) => `${name} ${directives[name].join(' ')}`)
    .join('; ')
}

function isNoneOnly(sources: string[]): boolean {
  return sources.length === 1 && sources[0] === "'none'"
}

function coversSource(hostSources: string[], widgetSource: string): boolean {
  if (hostSources.includes('*')) return true
  if (hostSources.includes(widgetSource)) return true
  if (isNonceSource(widgetSource)) {
    return hostSources.some((source) => isNonceSource(source))
  }
  return false
}

function isNonceSource(source: string): boolean {
  return /^'nonce-.+'$/.test(source)
}
