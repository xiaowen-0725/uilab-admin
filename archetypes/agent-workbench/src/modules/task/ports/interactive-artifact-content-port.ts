/**
 * Pull a ready Interactive Artifact draft from staging.
 * Content never re-enters the model context.
 */

export type InteractiveArtifactContentOk = {
  ok: true
  content: string
  hash: string
  bytes: number
  title?: string
}

export type InteractiveArtifactContentFailure = {
  ok: false
  error: string
  hint: string
}

export interface InteractiveArtifactContentPort {
  pullReady(
    draftId: string,
  ): Promise<InteractiveArtifactContentOk | InteractiveArtifactContentFailure>
}
