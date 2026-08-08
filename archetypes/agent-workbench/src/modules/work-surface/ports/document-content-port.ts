/**
 * Document content Port — workspace-relative text reads for Document Surface.
 * Owned by work-surface (consumer). Composition injects Memory / future FS adapters.
 */

export type DocumentReadFailureReason =
  | 'not-found'
  | 'permission-denied'
  | 'too-large'
  | 'read-failed'

export type DocumentReadResult =
  | {
      ok: true
      /** UTF-8 text content */
      text: string
      byteLength: number
    }
  | {
      ok: false
      reason: DocumentReadFailureReason
      /** Optional human detail (not shown raw if sensitive). */
      message?: string
    }

export type DocumentContentPort = {
  /**
   * Read UTF-8 text for a normalized workspace-relative resourceKey.
   * Adapter must enforce size limits and path safety (or trust normalize upstream).
   */
  readText: (resourceKey: string) => Promise<DocumentReadResult>
}
