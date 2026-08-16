import 'react'

declare module 'react' {
  interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
    /**
     * CSP Embedded Enforcement. Per-widget policy on the iframe element is how
     * `connect-src 'none'` gets enforced for opaque-origin `srcdoc` widgets;
     * React does not type it because it is not in the HTML standard's IDL.
     */
    csp?: string
  }
}
