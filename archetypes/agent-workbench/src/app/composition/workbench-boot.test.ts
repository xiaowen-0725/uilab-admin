import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bootWorkbench,
  resolveBootPointer,
} from './workbench-boot'
import { DEFAULT_PROJECT_ID, NEW_TASK_TITLE } from '@/modules/project'
import { createMemoryProjectCatalog, ProjectCatalogController } from '@/modules/project'

vi.mock('@/app/persistence/workbench-idb', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/app/persistence/workbench-idb')>()
  return {
    ...actual,
    openWorkbenchIdb: vi.fn(),
    getSessionPointer: vi.fn(),
  }
})

import {
  getSessionPointer,
  openWorkbenchIdb,
} from '@/app/persistence/workbench-idb'

describe('bootWorkbench', () => {
  afterEach(() => {
    vi.mocked(openWorkbenchIdb).mockReset()
    vi.mocked(getSessionPointer).mockReset()
  })

  it('Memory path hydrates catalog with default project and empty task pointer', async () => {
    const result = await bootWorkbench({ persistence: 'memory' })

    expect(result.error).toBeNull()
    expect(result.db).toBeNull()
    expect(result.pointer).toEqual({
      selectedProjectId: DEFAULT_PROJECT_ID,
      selectedTaskId: null,
    })
    expect(result.catalogController.getView().ready).toBe(true)
    expect(
      result.catalogController
        .getView()
        .projects.some((p) => p.id === DEFAULT_PROJECT_ID),
    ).toBe(true)
    expect(result.eventStore).toBeTruthy()
  })

  it('IDB open failure degrades to Memory with honest Chinese error', async () => {
    vi.mocked(openWorkbenchIdb).mockRejectedValue(
      new Error('IndexedDB 打开失败'),
    )

    const result = await bootWorkbench({
      persistence: 'idb',
      idbName: 'test-boot-fail',
    })

    expect(result.db).toBeNull()
    expect(result.error).toBe('IndexedDB 打开失败')
    expect(result.pointer.selectedProjectId).toBe(DEFAULT_PROJECT_ID)
    expect(result.pointer.selectedTaskId).toBeNull()
    expect(result.catalogController.getView().ready).toBe(true)
  })

  it('non-Error throw uses 无法初始化本地存储 fallback message', async () => {
    vi.mocked(openWorkbenchIdb).mockRejectedValue('boom')

    const result = await bootWorkbench({ persistence: 'idb' })

    expect(result.error).toBe('无法初始化本地存储')
    expect(result.db).toBeNull()
  })
})

describe('resolveBootPointer', () => {
  it('falls back to default project when stored id is missing', async () => {
    const catalog = createMemoryProjectCatalog()
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()

    const pointer = resolveBootPointer(controller, {
      selectedProjectId: 'missing-project',
      selectedTaskId: 'task-x',
    })

    expect(pointer.selectedProjectId).toBe(DEFAULT_PROJECT_ID)
    expect(pointer.selectedTaskId).toBeNull()
  })

  it('clears task when row missing or belongs to another project', async () => {
    const catalog = createMemoryProjectCatalog()
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()
    await controller.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-a',
      title: NEW_TASK_TITLE,
    })

    expect(
      resolveBootPointer(controller, {
        selectedProjectId: DEFAULT_PROJECT_ID,
        selectedTaskId: 'task-missing',
      }).selectedTaskId,
    ).toBeNull()

    expect(
      resolveBootPointer(controller, {
        selectedProjectId: DEFAULT_PROJECT_ID,
        selectedTaskId: 'task-a',
      }).selectedTaskId,
    ).toBe('task-a')
  })
})
