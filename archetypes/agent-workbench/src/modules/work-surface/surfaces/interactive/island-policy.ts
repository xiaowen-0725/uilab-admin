/**
 * Interactive Surface iframe policy (ADR-0021 / ADR-0026).
 * Same child-document tightening as Board Widget and inline visuals.
 */

export {
  CHILD_IFRAME_CSP_TEMPLATE as INTERACTIVE_IFRAME_CSP_TEMPLATE,
  CHILD_IFRAME_SANDBOX as INTERACTIVE_IFRAME_SANDBOX,
  buildChildIframeCsp as buildInteractiveIframeCsp,
} from '@/lib/html-island/child-iframe-policy'
