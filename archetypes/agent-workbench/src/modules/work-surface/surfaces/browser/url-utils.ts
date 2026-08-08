/**
 * Browser Surface URL normalize + scheme allowlist (spec §6).
 */

export type BrowserUrlTrust = 'trusted-preview' | 'untrusted-url'

export type NormalizeBrowserUrlResult =
  | {
      ok: true
      /** Canonical resourceKey */
      url: string
      trust: BrowserUrlTrust
    }
  | { ok: false; reason: 'empty' | 'unsupported-scheme' | 'invalid' }

/**
 * Normalize browser resourceKey. Supports https, http://localhost, http://127.0.0.1, blob.
 * file:// → unsupported.
 */
export function normalizeBrowserUrl(raw: string): NormalizeBrowserUrlResult {
  const s = (raw ?? '').trim()
  if (!s) return { ok: false, reason: 'empty' }

  if (/^file:/i.test(s)) {
    return { ok: false, reason: 'unsupported-scheme' }
  }

  // blob: URLs — trusted local preview
  if (/^blob:/i.test(s)) {
    return { ok: true, url: s, trust: 'trusted-preview' }
  }

  try {
    // Allow protocol-relative? No — require scheme or treat as https host path invalid.
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
    const u = new URL(withScheme)

    if (u.protocol === 'https:') {
      return { ok: true, url: u.toString(), trust: 'untrusted-url' }
    }

    if (u.protocol === 'http:') {
      const host = u.hostname.toLowerCase()
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
        return { ok: true, url: u.toString(), trust: 'trusted-preview' }
      }
      // Non-local http is not in the first-ship allowlist
      return { ok: false, reason: 'unsupported-scheme' }
    }

    return { ok: false, reason: 'unsupported-scheme' }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

export function sandboxForTrust(trust: BrowserUrlTrust): string {
  // trusted-preview: allow scripts for localhost previews
  // untrusted-url: stricter — no top-nav, no forms post to parent
  if (trust === 'trusted-preview') {
    return 'allow-scripts allow-same-origin allow-forms allow-popups'
  }
  return 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox'
}
