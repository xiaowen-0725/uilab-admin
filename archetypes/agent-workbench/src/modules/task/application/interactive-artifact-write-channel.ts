/**
 * Client-side interactive_commit.
 * Pulls staging HTML, persists to the Task library, never returns HTML.
 */

import { hashInteractiveContent } from '../model/interactive-content-hash'
import type { InteractiveArtifactRecord } from '../model/interactive-artifact'
import type {
  InteractiveArtifactContentOk,
  InteractiveArtifactContentPort,
} from '../ports/interactive-artifact-content-port'
import type { InteractiveArtifactStorePort } from '../ports/interactive-artifact-store-port'

export type InteractiveArtifactToolFailure = {
  ok: false
  error: string
  hint: string
}

export type InteractiveArtifactCommitOk = {
  ok: true
  artifactId: string
  title: string
  updated: boolean
  /** Same content already committed — no write, no pointer event. */
  replayed?: true
}

export type InteractiveArtifactCommitInput = {
  taskId: string
  artifactId?: string
  draftId: string
  contentHash: string
  title: string
}

export type InteractiveArtifactWriteClock = () => string

const VALIDATION_HINT = 'interactive_commit 需要 title、draftId 与 contentHash'
const HASH_MISMATCH_HINT = '交互产物 contentHash 与草稿不一致'

function fail(
  error: string,
  hint: string,
): InteractiveArtifactToolFailure {
  return { ok: false, error, hint }
}

function newArtifactId(): string {
  return `ia_${crypto.randomUUID()}`
}

function defaultNowIso(): string {
  return new Date().toISOString()
}

function resultLooksLikeContentLeak(value: unknown): boolean {
  const text = JSON.stringify(value).toLowerCase()
  return text.includes('<html') || text.includes('<!doctype')
}

export function assertNoInteractiveContentLeak(value: unknown): void {
  if (resultLooksLikeContentLeak(value)) {
    throw new Error('interactive artifact tool result leaked HTML')
  }
}

export async function commitInteractiveDraft(
  store: InteractiveArtifactStorePort,
  content: InteractiveArtifactContentPort,
  input: InteractiveArtifactCommitInput,
  nowIso: InteractiveArtifactWriteClock = defaultNowIso,
): Promise<InteractiveArtifactCommitOk | InteractiveArtifactToolFailure> {
  const taskId = input.taskId.trim()
  const artifactId = input.artifactId?.trim() || undefined
  const draftId = input.draftId.trim()
  const contentHash = input.contentHash.trim()
  const title = input.title.trim()

  if (!taskId || !contentHash || !title) {
    return finish(fail('validation_failed', VALIDATION_HINT))
  }

  const existingById = artifactId
    ? await store.get(taskId, artifactId)
    : null
  if (existingById && existingById.contentHash === contentHash) {
    return finish(replay(existingById))
  }
  if (!artifactId) {
    const existingByHash = await store.findByContentHash(taskId, contentHash)
    if (existingByHash) return finish(replay(existingByHash))
  }

  const pulled = await pullMatchingDraft(content, draftId, contentHash)
  if (!pulled.ok) return finish(pulled)

  const now = nowIso()
  const record: InteractiveArtifactRecord = existingById
    ? {
        ...existingById,
        title,
        html: pulled.content,
        contentHash,
        updatedAt: now,
      }
    : {
        id: artifactId ?? newArtifactId(),
        taskId,
        title,
        html: pulled.content,
        contentHash,
        createdAt: now,
        updatedAt: now,
      }
  await store.put(record)
  return finish({
    ok: true,
    artifactId: record.id,
    title: record.title,
    updated: Boolean(existingById),
  })
}

function replay(
  record: InteractiveArtifactRecord,
): InteractiveArtifactCommitOk {
  return {
    ok: true,
    artifactId: record.id,
    title: record.title,
    updated: false,
    replayed: true,
  }
}

async function pullMatchingDraft(
  content: InteractiveArtifactContentPort,
  draftId: string,
  expectedHash: string,
): Promise<InteractiveArtifactContentOk | InteractiveArtifactToolFailure> {
  if (!draftId) return fail('validation_failed', VALIDATION_HINT)
  const pulled = await content.pullReady(draftId)
  if (!pulled.ok) return pulled
  const computed = await hashInteractiveContent(pulled.content)
  if (pulled.hash !== expectedHash || computed !== expectedHash) {
    return fail('hash_mismatch', HASH_MISMATCH_HINT)
  }
  return pulled
}

function finish<T>(result: T): T {
  assertNoInteractiveContentLeak(result)
  return result
}
