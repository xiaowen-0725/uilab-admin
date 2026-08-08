/**
 * Document content Port — workspace-relative reads for Document Surface.
 * Owned by work-surface (consumer). Composition injects Memory / future FS adapters.
 */

export type DocumentReadFailureReason =
  | 'not-found'
  | 'permission-denied'
  | 'too-large'
  | 'read-failed'

export type DocumentTextReadResult =
  | {
      ok: true
      text: string
      byteLength: number
    }
  | {
      ok: false
      reason: DocumentReadFailureReason
      message?: string
    }

export type DocumentBinaryReadResult =
  | {
      ok: true
      bytes: Uint8Array
      byteLength: number
      mimeType?: string
    }
  | {
      ok: false
      reason: DocumentReadFailureReason
      message?: string
    }

/** @deprecated alias — prefer DocumentTextReadResult */
export type DocumentReadResult = DocumentTextReadResult

export type DocumentContentPort = {
  /**
   * Read UTF-8 text for a normalized workspace-relative resourceKey.
   */
  readText: (resourceKey: string) => Promise<DocumentTextReadResult>
  /**
   * Read raw bytes (image / pdf / office). Optional on older adapters —
   * DocumentPanel falls back to unsupported when missing for binary families.
   */
  readBinary?: (resourceKey: string) => Promise<DocumentBinaryReadResult>
}
