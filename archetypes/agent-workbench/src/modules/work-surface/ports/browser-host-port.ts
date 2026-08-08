/**
 * Browser Host Port — open URL outside the Work Surface iframe.
 * Composition injects Web adapter (`window.open`); Desktop Host can replace later.
 */

export type BrowserHostPort = {
  openExternal: (url: string) => Promise<void>
}

export function createWebBrowserHostPort(): BrowserHostPort {
  return {
    async openExternal(url: string) {
      // Web adapter: user-gesture preferred; still honest non-Desktop Host.
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}
