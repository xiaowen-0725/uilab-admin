/**
 * In-memory BoardContentPort for tests.
 */

import type {
  BoardContentFailure,
  BoardContentOk,
  BoardContentPort,
  BoardStagingDraft,
} from '../ports/board-content-port'

export type MemoryBoardDraft = BoardStagingDraft & {
  content: string
  hash: string
  bytes: number
  title: string
  description?: string
  allowedHosts?: string[]
  expired?: boolean
}

export class MemoryBoardContent implements BoardContentPort {
  private readonly drafts = new Map<string, MemoryBoardDraft>()

  seed(draft: MemoryBoardDraft): void {
    this.drafts.set(draft.draftId, draft)
  }

  expire(draftId: string): void {
    const draft = this.drafts.get(draftId)
    if (draft) draft.expired = true
  }

  async pullReady(
    draftId: string,
  ): Promise<BoardContentOk | BoardContentFailure> {
    const draft = this.drafts.get(draftId)
    if (!draft || draft.expired) {
      return {
        ok: false,
        error: 'unknown_build',
        hint: '草稿已过期或不存在，请重新 begin / finish',
      }
    }
    if (draft.status !== 'ready') {
      return {
        ok: false,
        error: 'build_not_ready',
        hint: '草稿尚未 finish，不能拉取内容',
      }
    }
    this.drafts.delete(draftId)
    return {
      ok: true,
      kind: draft.kind,
      content: draft.content,
      hash: draft.hash,
      bytes: draft.bytes,
      title: draft.title,
      description: draft.description,
      allowedHosts: draft.allowedHosts,
      widgetId: draft.widgetId,
      jobId: draft.jobId,
    }
  }

  async listDrafts(): Promise<readonly BoardStagingDraft[]> {
    return [...this.drafts.values()]
      .filter((draft) => !draft.expired)
      .map(({ content: _content, expired: _expired, ...meta }) => meta)
  }
}

export function createMemoryBoardContent(): MemoryBoardContent {
  return new MemoryBoardContent()
}
