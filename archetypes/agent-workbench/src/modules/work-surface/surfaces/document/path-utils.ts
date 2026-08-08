/**
 * Workspace resourceKey policy (single entry for open/read adapters).
 *
 * Keys are workspace-relative with `/` separators (e.g. `notes/plan.md`).
 * Absolute host paths may peel the trailing virtual marker segment
 * `/output|/notes|/skills/…` before normalize — never peel those markers mid
 * relative keys. Segment `..` is rejected; a filename containing `..` as
 * characters (e.g. `v1..v2.md`) is allowed. Prefer {@link toWorkspaceResourceKey}
 * at open/read call sites.
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
 * Pure segment validator — no absolute peel. Returns null when empty,
 * scheme/drive/UNC, or a segment is exactly `..`.
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

/**
 * Coerce Timeline / tool / host paths into a workspace-relative resourceKey.
 * Aligns with VoltAgent tool path mapping: for absolute host paths, extract the
 * trailing `/output|notes|skills/…` segment, then run {@link normalizeWorkspaceResourceKey}.
 *
 * Relative keys (e.g. `fixture/notes/plan.txt`) are left intact — marker peel
 * only runs on absolute-looking inputs so mid-path `/notes/` is not stripped.
 */
export function coerceWorkspaceResourceKey(raw: string): string | null {
  if (typeof raw !== 'string') return null
  let v = raw.trim().replace(/\\/g, '/')
  if (!v) return null

  // URLs are not workspace documents
  if (/^(https?|blob|file):/i.test(v)) return null

  // Absolute host / rooted paths may embed virtual workspace segments.
  // Do not peel relative keys that merely contain `/notes/` mid-path.
  const isAbsoluteLooking =
    v.startsWith('/') || /^[a-zA-Z]:(\/|$)/.test(v) || v.startsWith('//')
  if (isAbsoluteLooking) {
    const markers = ['/output/', '/notes/', '/skills/'] as const
    let best = -1
    const lower = v.toLowerCase()
    for (const m of markers) {
      const i = lower.lastIndexOf(m)
      if (i >= 0 && i >= best) {
        best = i
      }
    }
    if (best >= 0) {
      // Keep segment name: …/output/foo → output/foo
      v = v.slice(best + 1)
    }
  }

  return normalizeWorkspaceResourceKey(v)
}

/**
 * Preferred public entry for open/read of workspace document paths.
 * Absolute peel (when needed) then segment normalize — same as
 * {@link coerceWorkspaceResourceKey}.
 */
export const toWorkspaceResourceKey = coerceWorkspaceResourceKey

/** True when string looks like a non-URL workspace path (for Registry match). */
export function looksLikeWorkspacePath(raw: string): boolean {
  return toWorkspaceResourceKey(raw) != null
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
