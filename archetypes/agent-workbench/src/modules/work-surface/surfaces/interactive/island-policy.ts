/**
 * Interactive Surface iframe policy (ADR-0021 / ADR-0026).
 * Same child-document tightening as Board Widget; no widget script contract.
 */

export const INTERACTIVE_IFRAME_SANDBOX = 'allow-scripts'

/** Gate and frame share this literal so the pair check cannot drift. */
export const INTERACTIVE_IFRAME_CSP_TEMPLATE =
  "default-src 'none'; script-src 'nonce-__NONCE__'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"

export function buildInteractiveIframeCsp(nonce: string): string {
  return INTERACTIVE_IFRAME_CSP_TEMPLATE.replace('__NONCE__', nonce)
}
