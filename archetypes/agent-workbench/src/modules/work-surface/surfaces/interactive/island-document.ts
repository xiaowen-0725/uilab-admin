/**
 * Stamp the host nonce on island scripts. No widget.ready, no host bridge.
 */

function stampNonce(attrs: string, nonce: string): string {
  if (/\bnonce\s*=/i.test(attrs)) {
    return attrs.replace(
      /\bnonce\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
      `nonce="${nonce}"`,
    )
  }
  return ` nonce="${nonce}"${attrs}`
}

export function buildInteractiveIslandDocument(input: {
  html: string
  nonce: string
}): string {
  return input.html.replace(
    /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi,
    (_full, rawAttrs: string | undefined, body: string) => {
      const stamped = stampNonce(rawAttrs ?? '', input.nonce)
      return `<script${stamped}>${body}</script>`
    },
  )
}
