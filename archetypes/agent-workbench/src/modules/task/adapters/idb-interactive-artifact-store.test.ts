import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteWorkbenchIdb,
  openWorkbenchIdb,
} from '@/app/persistence/workbench-idb'
import { createIdbInteractiveArtifactStore } from './idb-interactive-artifact-store'

const NOW = '2026-09-02T04:00:00.000Z'

function uniqueDbName(suffix: string): string {
  return `test-ia-store-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

describe('IdbInteractiveArtifactStore', () => {
  const opened: string[] = []

  afterEach(async () => {
    for (const name of opened.splice(0)) {
      await deleteWorkbenchIdb(name)
    }
  })

  it('scopes get/list by Task and cascades deleteByTaskId', async () => {
    const name = uniqueDbName('scope')
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    const store = createIdbInteractiveArtifactStore(db)
    await store.put({
      id: 'ia-1',
      taskId: 'task-a',
      title: '筛选表',
      html: '<html>a</html>',
      contentHash: 'hash-a',
      createdAt: NOW,
      updatedAt: NOW,
    })
    await store.put({
      id: 'ia-2',
      taskId: 'task-b',
      title: '另一份',
      html: '<html>b</html>',
      contentHash: 'hash-b',
      createdAt: NOW,
      updatedAt: NOW,
    })

    expect(await store.get('task-b', 'ia-1')).toBeNull()
    expect(await store.list('task-a')).toHaveLength(1)
    expect(await store.findByContentHash('task-b', 'hash-a')).toBeNull()
    expect(await store.findByContentHash('task-a', 'hash-a')).toMatchObject({
      id: 'ia-1',
    })

    await store.deleteByTaskId('task-a')
    expect(await store.get('task-a', 'ia-1')).toBeNull()
    expect(await store.get('task-b', 'ia-2')).toMatchObject({ title: '另一份' })
    db.close()
  })
})
