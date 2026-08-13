import { afterEach, describe, expect, it } from 'vitest'
import {
  createIdbProjectCatalog,
  createDefaultProject,
  DEFAULT_PROJECT_ID,
} from '@/modules/project'
import {
  deleteWorkbenchIdb,
  openWorkbenchIdb,
  STORE_PROJECTS,
} from '@/app/persistence/workbench-idb'

const DB_NAME = `test-idb-catalog-root-${Date.now()}`

describe('IdbProjectCatalog root fields', () => {
  afterEach(async () => {
    await deleteWorkbenchIdb(DB_NAME)
  })

  it('put/get/list round-trip localRoot and treat missing fields as null', async () => {
    const db = await openWorkbenchIdb({ name: DB_NAME })
    const catalog = createIdbProjectCatalog(db)

    const rooted = {
      ...createDefaultProject(),
      localRoot: '/Users/me/repo',
      rootSource: 'created' as const,
    }
    await catalog.putProject(rooted)
    const got = await catalog.getProject(DEFAULT_PROJECT_ID)
    expect(got?.localRoot).toBe('/Users/me/repo')
    expect(got?.rootSource).toBe('created')
    expect('runStatus' in (got ?? {})).toBe(false)

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE_PROJECTS).put({
        id: 'project-legacy',
        name: '旧记录',
        sortOrder: 1,
        pinned: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    })

    const legacy = await catalog.getProject('project-legacy')
    expect(legacy?.localRoot).toBeNull()
    expect(legacy?.rootSource).toBeNull()

    const listed = await catalog.listProjects()
    expect(listed.some((p) => p.id === 'project-legacy' && p.localRoot === null)).toBe(
      true,
    )
    db.close()
  })
})
