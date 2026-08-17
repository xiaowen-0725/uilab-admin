/**
 * BoardJobRuntimePort — run an approved job once (first-run / refresh).
 * Deno execution itself is Ticket 139; this port is the trigger seam.
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
  /** Product path is false until Ticket 139 lands Deno. */
  readonly available?: boolean
  runJob(jobId: string): Promise<BoardJobRunResult>
}
