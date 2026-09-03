import { describe, expect, it } from 'vitest'
import { createMemoryInteractiveArtifactContent } from '../adapters/memory-interactive-artifact-content'
import { createMemoryInteractiveArtifactStore } from '../adapters/memory-interactive-artifact-store'
import { hashInteractiveContent } from '../model/interactive-content-hash'
import {
  assertNoInteractiveContentLeak,
  commitInteractiveDraft,
} from './interactive-artifact-write-channel'

const NOW = '2026-09-02T04:00:00.000Z'
const TASK_A = 'task-a'
const TASK_B = 'task-b'
const HTML =
  '<!doctype html><html><body><table><tr><td>可筛选</td></tr></table></body></html>'
const HTML_V2 =
  '<!doctype html><html><body><table><tr><td>已标红</td></tr></table></body></html>'

async function seedReadyDraft(
  content: ReturnType<typeof createMemoryInteractiveArtifactContent>,
  draftId: string,
  html = HTML,
) {
  const contentHash = await hashInteractiveContent(html)
  content.seed({
    draftId,
    status: 'ready',
    content: html,
    hash: contentHash,
    bytes: html.length,
    title: '筛选表',
  })
  return contentHash
}

describe('commitInteractiveDraft', () => {
  it('creates a Task-owned record and returns a summary without HTML', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    const contentHash = await seedReadyDraft(content, 'draft-1')

    const result = await commitInteractiveDraft(
      store,
      content,
      {
        taskId: TASK_A,
        draftId: 'draft-1',
        contentHash,
        title: '筛选表',
      },
      () => NOW,
    )

    expect(result).toMatchObject({
      ok: true,
      title: '筛选表',
      updated: false,
    })
    assertNoInteractiveContentLeak(result)
    if (!result.ok) return
    const stored = await store.get(TASK_A, result.artifactId)
    expect(stored).toMatchObject({
      taskId: TASK_A,
      title: '筛选表',
      html: HTML,
      contentHash,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(JSON.stringify(result)).not.toContain('<html')
    expect(JSON.stringify(result)).not.toContain(HTML)
  })

  it('updates the same id instead of inserting a third copy', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    const firstHash = await seedReadyDraft(content, 'draft-1')
    const created = await commitInteractiveDraft(
      store,
      content,
      {
        taskId: TASK_A,
        draftId: 'draft-1',
        contentHash: firstHash,
        title: '筛选表',
      },
      () => NOW,
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const nextHash = await seedReadyDraft(content, 'draft-2', HTML_V2)
    const updated = await commitInteractiveDraft(
      store,
      content,
      {
        taskId: TASK_A,
        artifactId: created.artifactId,
        draftId: 'draft-2',
        contentHash: nextHash,
        title: '筛选表 v2',
      },
      () => '2026-09-02T05:00:00.000Z',
    )

    expect(updated).toMatchObject({
      ok: true,
      artifactId: created.artifactId,
      title: '筛选表 v2',
      updated: true,
    })
    const listed = await store.list(TASK_A)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: created.artifactId,
      html: HTML_V2,
      contentHash: nextHash,
      title: '筛选表 v2',
      createdAt: NOW,
      updatedAt: '2026-09-02T05:00:00.000Z',
    })
  })

  it('replays omit-id when the Task already has that content hash', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    const contentHash = await seedReadyDraft(content, 'draft-1')
    const created = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      draftId: 'draft-1',
      contentHash,
      title: '筛选表',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const replayed = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      draftId: 'consumed-or-missing',
      contentHash,
      title: '另一份标题',
    })

    expect(replayed).toMatchObject({
      ok: true,
      artifactId: created.artifactId,
      title: '筛选表',
      updated: false,
      replayed: true,
    })
    expect(await store.list(TASK_A)).toHaveLength(1)
    expect(await content.pullReady('consumed-or-missing')).toMatchObject({
      ok: false,
      error: 'unknown_build',
    })
  })

  it('allows a second copy when a new id collides on hash', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    const firstHash = await seedReadyDraft(content, 'draft-1')
    const created = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      draftId: 'draft-1',
      contentHash: firstHash,
      title: '筛选表',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const secondHash = await seedReadyDraft(content, 'draft-2')
    const copy = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      artifactId: 'ia_explicit-copy',
      draftId: 'draft-2',
      contentHash: secondHash,
      title: '筛选表副本',
    })

    expect(copy).toMatchObject({
      ok: true,
      artifactId: 'ia_explicit-copy',
      title: '筛选表副本',
      updated: false,
    })
    expect(await store.list(TASK_A)).toHaveLength(2)
    expect(await store.get(TASK_A, created.artifactId)).not.toBeNull()
    expect(await store.get(TASK_A, 'ia_explicit-copy')).toMatchObject({
      html: HTML,
    })
  })

  it('does not let another Task read or keep the record after cascade', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    const contentHash = await seedReadyDraft(content, 'draft-1')
    const created = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      artifactId: 'ia_shared-looking',
      draftId: 'draft-1',
      contentHash,
      title: '筛选表',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(await store.get(TASK_B, created.artifactId)).toBeNull()
    expect(await store.list(TASK_B)).toEqual([])
    expect(await store.findByContentHash(TASK_B, contentHash)).toBeNull()

    await store.deleteByTaskId(TASK_A)
    expect(await store.get(TASK_A, created.artifactId)).toBeNull()
    expect(await store.list(TASK_A)).toEqual([])
  })

  it('rejects a hash that does not match the pulled draft', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    await seedReadyDraft(content, 'draft-1')

    const result = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      draftId: 'draft-1',
      contentHash: '0'.repeat(64),
      title: '筛选表',
    })

    expect(result).toMatchObject({
      ok: false,
      error: 'hash_mismatch',
    })
    expect(await store.list(TASK_A)).toEqual([])
  })

  it('consumes a ready draft only once', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    const contentHash = await seedReadyDraft(content, 'draft-1')
    const first = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      draftId: 'draft-1',
      contentHash,
      title: '筛选表',
    })
    expect(first.ok).toBe(true)

    const second = await commitInteractiveDraft(store, content, {
      taskId: TASK_A,
      artifactId: 'ia_other',
      draftId: 'draft-1',
      contentHash,
      title: '筛选表',
    })
    expect(second).toMatchObject({
      ok: false,
      error: 'unknown_build',
    })
  })
})
