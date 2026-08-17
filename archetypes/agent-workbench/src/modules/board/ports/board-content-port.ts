/**
 * BoardContentPort — pull ready staging drafts from the sidecar.
 * Owned by the Board module. Content never re-enters the model context.
 */

export type BoardDraftKind = 'widget' | 'job'

export type BoardContentOk = {
  ok: true
  kind: BoardDraftKind
  content: string
  hash: string
  bytes: number
  title: string
  description?: string
  allowedHosts?: string[]
  widgetId?: string
  jobId?: string
}

export type BoardContentFailure = {
  ok: false
  error: string
  hint: string
}

export type BoardStagingDraft = {
  draftId: string
  kind: BoardDraftKind
  status: string
  title: string
  widgetId?: string
  jobId?: string
  contentHash?: string
}

export interface BoardContentPort {
  pullReady(draftId: string): Promise<BoardContentOk | BoardContentFailure>
  listDrafts(): Promise<readonly BoardStagingDraft[]>
}
