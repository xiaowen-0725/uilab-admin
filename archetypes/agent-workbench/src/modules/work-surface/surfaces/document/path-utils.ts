/**
 * Workspace-relative resourceKey rules for Document Surface.
 * resourceKey uses `/` separators; `..` escape is rejected.
 */

/** Text / markdown / code default size ceiling (bytes). */
export const DOCUMENT_TEXT_MAX_BYTES = Math.floor(1.5 * 1024 * 1024)
/** Image default size ceiling. */
export const DOCUMENT_IMAGE_MAX_BYTES = 15 * 1024 * 1024
/** PDF / office default size ceiling. */
export const DOCUMENT_OFFICE_MAX_BYTES = 25 * 1024 * 1024
/** XLSX preview row cap (read-only). */
export const DOCUMENT_XLSX_MAX_ROWS = 200
/** XLSX preview column cap. */
export const DOCUMENT_XLSX_MAX_COLS = 40

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

  // Reject Windows drive letters and UNC *before* slash-stripping.
  if (/^[a-zA-Z]:(\/|$)/.test(key)) return null
  if (key.startsWith('//')) return null

  // Leading `/` means workspace-root relative (product convention), not host FS absolute.
  key = key.replace(/^\.\/+/, '').replace(/^\/+/, '')
  if (!key) return null

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

export function maxBytesForFamily(
  family: string,
): number {
  if (family === 'image') return DOCUMENT_IMAGE_MAX_BYTES
  if (family === 'pdf' || family === 'docx' || family === 'xlsx') {
    return DOCUMENT_OFFICE_MAX_BYTES
  }
  return DOCUMENT_TEXT_MAX_BYTES
}
