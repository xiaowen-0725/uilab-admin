/**
 * Host / widget subdocument policy (ADR-0021).
 *
 * Widget srcdoc clones the host policy container, so the host grant set must
 * cover every source the iframe `csp=` still needs. The child may only tighten.
 */

export const WIDGET_IFRAME_SANDBOX = 'allow-scripts'

export interface HostDocumentCspInput {
  nonce: string
  sidecarPort: string
  includeDevWebSocket: boolean
}

export type CspCoverageResult =
  | { ok: true }
  | { ok: false; missing: string[] }

export function buildHostDocumentCsp(input: HostDocumentCspInput): string {
  const sidecar = `http://127.0.0.1:${input.sidecarPort}`
  const devWs = input.includeDevWebSocket ? ' ws://localhost:5174' : ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${sidecar}${devWs}`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
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
    for (const source of widgetSources) {
      if (source === "'none'") continue
      if (coversSource(hostSources, source)) continue
      missing.push(`${directive} ${source}`)
    }
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

function parseCsp(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const raw of policy.split(';')) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    directives.set(tokens[0].toLowerCase(), tokens.slice(1))
  }
  return directives
}

function isNoneOnly(sources: string[]): boolean {
  return sources.length === 1 && sources[0] === "'none'"
}

function coversSource(hostSources: string[], widgetSource: string): boolean {
  return (
    hostSources.includes('*') ||
    hostSources.includes(widgetSource) ||
    (isNonceSource(widgetSource) && hostSources.some(isNonceSource))
  )
}

function isNonceSource(source: string): boolean {
  return /^'nonce-.+'$/.test(source)
}
