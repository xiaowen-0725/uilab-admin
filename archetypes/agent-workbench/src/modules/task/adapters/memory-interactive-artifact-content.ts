/**
 * In-memory Interactive Artifact staging for tests.
 * pullReady consumes a ready draft once.
 */

import type {
  InteractiveArtifactContentFailure,
  InteractiveArtifactContentOk,
  InteractiveArtifactContentPort,
} from '../ports/interactive-artifact-content-port'

export type MemoryInteractiveArtifactDraft = {
  draftId: string
  status: string
  content: string
  hash: string
  bytes: number
  title?: string
  expired?: boolean
}

export class MemoryInteractiveArtifactContent
  implements InteractiveArtifactContentPort
{
  private readonly drafts = new Map<string, MemoryInteractiveArtifactDraft>()

  seed(draft: MemoryInteractiveArtifactDraft): void {
    this.drafts.set(draft.draftId, { ...draft })
  }

  expire(draftId: string): void {
    const draft = this.drafts.get(draftId)
    if (draft) draft.expired = true
  }

  async pullReady(
    draftId: string,
  ): Promise<
    InteractiveArtifactContentOk | InteractiveArtifactContentFailure
  > {
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
      content: draft.content,
      hash: draft.hash,
      bytes: draft.bytes,
      title: draft.title,
    }
  }
}

export function createMemoryInteractiveArtifactContent(): MemoryInteractiveArtifactContent {
  return new MemoryInteractiveArtifactContent()
}
