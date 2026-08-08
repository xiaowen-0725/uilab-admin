/**
 * Workspace-relative resourceKey rules for Document Surface.
 * resourceKey uses `/` separators; `..` escape is rejected.
 */

/** Text / markdown / code default size ceiling (bytes). */
export const DOCUMENT_TEXT_MAX_BYTES = Math.floor(1.5 * 1024 * 1024)

/**
 * Normalize a user/runtime path to a workspace-relative resourceKey.
 * Returns null when the path is empty, absolute, or escapes with `..`.
 */
export function normalizeWorkspaceResourceKey(raw: string): string | null {
  if (typeof raw !== 'string') return null
  let key = raw.trim().replace(/\\/g, '/')
  if (!key) return null

  // Drop schemes that are not workspace paths.
  if (/^[a-z][a-z0-9+.-]*:/i.test(key) && !key.startsWith('./')) {
    return null
  }

  // Strip leading ./ and /
  key = key.replace(/^\.\/+/, '').replace(/^\/+/, '')
  if (!key) return null

  // Reject Windows drive letters / UNC after normalize attempts.
  if (/^[a-zA-Z]:/.test(key) || key.startsWith('//')) return null

  const segments = key.split('/')
  const out: string[] = []
  for (const seg of segments) {
    if (!seg || seg === '.') continue
    if (seg === '..') return null
    out.push(seg)
  }
  if (out.length === 0) return null
  return out.join('/')
}

/** True when string looks like a non-URL workspace path (for Registry match). */
export function looksLikeWorkspacePath(raw: string): boolean {
  return normalizeWorkspaceResourceKey(raw) != null
}
