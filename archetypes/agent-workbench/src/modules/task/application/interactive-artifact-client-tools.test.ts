import { describe, expect, it, vi } from 'vitest'
import { createMemoryInteractiveArtifactContent } from '../adapters/memory-interactive-artifact-content'
import { createMemoryInteractiveArtifactStore } from '../adapters/memory-interactive-artifact-store'
import { hashInteractiveContent } from '../model/interactive-content-hash'
import { createInteractiveArtifactClientToolExecutor } from './interactive-artifact-client-tools'

const HTML =
  '<!doctype html><html><body><ul><li>对比</li></ul></body></html>'

describe('createInteractiveArtifactClientToolExecutor', () => {
  it('returns replayed to the adapter and still never leaks HTML', async () => {
    const store = createMemoryInteractiveArtifactStore()
    const content = createMemoryInteractiveArtifactContent()
    const contentHash = await hashInteractiveContent(HTML)
    content.seed({
      draftId: 'draft-1',
      status: 'ready',
      content: HTML,
      hash: contentHash,
      bytes: HTML.length,
    })
    const onCommitted = vi.fn()
    const executor = createInteractiveArtifactClientToolExecutor({
      store,
      content,
      effects: { onCommitted },
    })

    const created = await executor({
      toolName: 'interactive_commit',
      args: {
        draftId: 'draft-1',
        contentHash,
        title: '对比清单',
      },
      taskId: 'task-a',
      turnId: 'turn-1',
    })
    expect(created).toMatchObject({
      ok: true,
      title: '对比清单',
      updated: false,
    })
    expect(created).not.toHaveProperty('replayed')
    expect(JSON.stringify(created)).not.toContain('<html')
    expect(JSON.stringify(created)).not.toContain('<!doctype')
    expect(onCommitted).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: (created as { artifactId: string }).artifactId,
        replayed: false,
        updated: false,
      }),
    )

    const replayed = await executor({
      toolName: 'interactive_commit',
      args: {
        draftId: 'gone',
        contentHash,
        title: '对比清单',
      },
      taskId: 'task-a',
      turnId: 'turn-2',
    })
    expect(replayed).toMatchObject({
      ok: true,
      artifactId: (created as { artifactId: string }).artifactId,
      updated: false,
      replayed: true,
    })
    expect(JSON.stringify(replayed)).not.toContain('<html')
    expect(onCommitted).toHaveBeenLastCalledWith(
      expect.objectContaining({ replayed: true, updated: false }),
    )
  })

  it('does not execute board_commit as this seam', async () => {
    const executor = createInteractiveArtifactClientToolExecutor({
      store: createMemoryInteractiveArtifactStore(),
      content: createMemoryInteractiveArtifactContent(),
    })
    const result = await executor({
      toolName: 'board_commit',
      args: { widgetId: 'w-1' },
      taskId: 'task-a',
      turnId: 'turn-1',
    })
    expect(result).toMatchObject({
      ok: false,
      error: 'validation_failed',
    })
  })
})
