/**
 * Interactive Artifact sidecar contracts.
 * Tool results stay scalars — never HTML / source.
 */

export const INTERACTIVE_ARTIFACT_MAX_BYTES = 256 * 1024
export const INTERACTIVE_STAGING_TTL_MS = 24 * 60 * 60 * 1000

export const INTERACTIVE_TOOL_ERROR_CODES = [
  'unknown_build',
  'build_not_ready',
  'hash_mismatch',
  'validation_failed',
  'runtime_unavailable',
  'not_authorized',
] as const

export type InteractiveToolErrorCode =
  (typeof INTERACTIVE_TOOL_ERROR_CODES)[number]

export type InteractiveToolError = {
  ok: false
  error: InteractiveToolErrorCode
  hint: string
}

export type InteractiveDraftStatus = 'open' | 'ready' | 'consumed'

export type InteractiveDraftMeta = {
  kind: 'interactive'
  draftId: string
  artifactId: string
  title: string
  nextSeq: number
  received: Record<string, string>
  status: InteractiveDraftStatus
  contentHash?: string
  bytes?: number
  createdAt: string
  updatedAt: string
}

export function interactiveToolError(
  error: InteractiveToolErrorCode,
  hint: string,
): InteractiveToolError {
  return { ok: false, error, hint }
}

export function isInteractiveToolError(
  value: unknown,
): value is InteractiveToolError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as InteractiveToolError).ok === false &&
    typeof (value as InteractiveToolError).error === 'string' &&
    typeof (value as InteractiveToolError).hint === 'string'
  )
}

export function resultLooksLikeInteractiveHtmlLeak(value: unknown): boolean {
  const text = JSON.stringify(value).toLowerCase()
  return text.includes('<html') || text.includes('<!doctype')
}

export function assertNoInteractiveHtmlLeak(value: unknown): void {
  if (resultLooksLikeInteractiveHtmlLeak(value)) {
    throw new Error('interactive artifact tool result leaked HTML')
  }
}

/** Model-facing summary only — never pass HTML / source through. */
export function toInteractiveModelOutput(output: unknown): {
  type: 'json'
  value: unknown
} {
  assertNoInteractiveHtmlLeak(output)
  return { type: 'json', value: output }
}
