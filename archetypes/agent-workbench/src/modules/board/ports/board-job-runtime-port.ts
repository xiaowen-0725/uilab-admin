/**
 * BoardJobRuntimePort — run an approved job once (first-run / refresh).
 * Product adapter is HTTP → sidecar Deno executor (#139).
 */

export type BoardJobRunOk = {
  ok: true
  payload: unknown
}

export type BoardJobRunFailure = {
  ok: false
  error: string
  hint: string
}

export type BoardJobRunResult = BoardJobRunOk | BoardJobRunFailure

export interface BoardJobRuntimePort {
  /** False skips first-run (tests / explicit unavailability). Omit on the live HTTP adapter. */
  readonly available?: boolean
  /** Optional startup probe so chrome can show a persistent unavailable icon. */
  probe?(): Promise<BoardJobRunResult>
  runJob(jobId: string): Promise<BoardJobRunResult>
}
