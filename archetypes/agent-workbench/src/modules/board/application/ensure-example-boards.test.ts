import { afterEach, describe, expect, it } from 'vitest'
import { deleteWorkbenchIdb, openWorkbenchIdb } from '@/app/persistence/workbench-idb'
import { createIdbBoardStore } from '../adapters/idb-board-store'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import { EXAMPLE_PRESETS } from '../fixtures/example-presets'
import { BOARD_PRESETS_INSTALLED_KEY } from '../model/preset-install'
import type { BoardStorePort } from '../ports/board-store-port'
import { ensureExampleBoards } from './ensure-example-boards'

async function jobsOn(store: BoardStorePort) {
  const jobs = []
  for (const board of await store.listBoards()) {
    for (const placement of board.placements) {
      const job = await store.getJobByWidgetId(placement.widgetId)
      if (job) jobs.push(job)
    }
  }
  return jobs
}

describe('ensureExampleBoards', () => {
  it('installs both zero-job example boards on an empty list', async () => {
    const store = createMemoryBoardStore()
    await ensureExampleBoards(store)

    const boards = await store.listBoards()
    expect(boards.map((board) => board.title).sort()).toEqual([
      '上手指引',
      '示例：每日速递',
    ])
    expect(boards.every((board) => board.isExample)).toBe(true)
    expect(boards.map((board) => board.presetId).sort()).toEqual(
      [...EXAMPLE_PRESETS.map((preset) => preset.id)].sort(),
    )
    expect(await jobsOn(store)).toEqual([])
    expect(await store.getInstalledPresets()).toEqual({
      'getting-started': 1,
      'daily-brief': 1,
    })
  })

  it('does not duplicate boards when the list is opened twice', async () => {
    const store = createMemoryBoardStore()
    await ensureExampleBoards(store)
    await ensureExampleBoards(store)

    expect(await store.listBoards()).toHaveLength(2)
  })

  it('does not recreate example boards after the user deletes them', async () => {
    const store = createMemoryBoardStore()
    await ensureExampleBoards(store)
    for (const board of await store.listBoards()) {
      await store.deleteBoard(board.id)
    }
    expect(await store.listBoards()).toHaveLength(0)

    await ensureExampleBoards(store)
    expect(await store.listBoards()).toHaveLength(0)
    expect(await store.getInstalledPresets()).toEqual({
      'getting-started': 1,
      'daily-brief': 1,
    })
  })

  it('does not overwrite an already-installed example the user edited', async () => {
    const store = createMemoryBoardStore()
    await ensureExampleBoards(store)
    const [board] = await store.listBoards()
    await store.putBoard({ ...board, title: '我改过的示例' })

    await ensureExampleBoards(store)
    expect(await store.getBoard(board.id)).toMatchObject({ title: '我改过的示例' })
    expect(await store.listBoards()).toHaveLength(2)
  })

  it('still installs missing presets when the user already has a board', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard({
      id: 'user-1',
      title: '我的看板',
      isExample: false,
      placements: [],
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    })

    await ensureExampleBoards(store)
    const boards = await store.listBoards()
    expect(boards.map((board) => board.id).sort()).toEqual([
      'example:daily-brief',
      'example:getting-started',
      'user-1',
    ])
  })

  it('finishes a half-installed preset set on the next visit', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard({
      id: 'example:getting-started',
      title: '上手指引',
      isExample: true,
      presetId: 'getting-started',
      presetVersion: 1,
      placements: [],
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    })

    await ensureExampleBoards(store)
    expect((await store.listBoards()).map((board) => board.presetId).sort()).toEqual([
      'daily-brief',
      'getting-started',
    ])
    expect(await store.getInstalledPresets()).toEqual({
      'getting-started': 1,
      'daily-brief': 1,
    })
  })
})

describe('example preset ledger in IndexedDB', () => {
  const opened: string[] = []

  afterEach(async () => {
    for (const name of opened.splice(0)) {
      await deleteWorkbenchIdb(name)
    }
  })

  it('persists the ever-installed map in the metadata store', async () => {
    const name = `test-example-presets-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    const store = createIdbBoardStore(db)

    await ensureExampleBoards(store)
    expect(Object.keys(await store.getInstalledPresets()).sort()).toEqual([
      'daily-brief',
      'getting-started',
    ])

    const row = await new Promise<{ key: string; value: unknown } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction('metadata', 'readonly')
        const request = tx.objectStore('metadata').get(BOARD_PRESETS_INSTALLED_KEY)
        request.onsuccess = () =>
          resolve(request.result as { key: string; value: unknown } | undefined)
        request.onerror = () => reject(request.error)
      },
    )
    expect(row).toMatchObject({
      key: BOARD_PRESETS_INSTALLED_KEY,
      value: { 'getting-started': 1, 'daily-brief': 1 },
    })

    for (const board of await store.listBoards()) {
      await store.deleteBoard(board.id)
    }
    await ensureExampleBoards(store)
    expect(await store.listBoards()).toHaveLength(0)
    db.close()
  })
})
