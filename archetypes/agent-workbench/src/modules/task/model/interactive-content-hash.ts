/**
 * SHA-256 hex for Interactive Artifact HTML. Matches sidecar staging hashes.
 */

export async function hashInteractiveContent(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
