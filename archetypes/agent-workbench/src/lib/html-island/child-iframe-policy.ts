/**
 * Nested browsing context policy for untrusted HTML (ADR-0021).
 * Interactive Artifact, Board Widget, and inline visuals share this pair.
 * Do not add allow-same-origin. Do not loosen connect-src.
 */

export const CHILD_IFRAME_SANDBOX = 'allow-scripts'

/** Gate and frame share this literal so the pair check cannot drift. */
export const CHILD_IFRAME_CSP_TEMPLATE =
  "default-src 'none'; script-src 'nonce-__NONCE__'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"

export function buildChildIframeCsp(nonce: string): string {
  return CHILD_IFRAME_CSP_TEMPLATE.replace('__NONCE__', nonce)
}
