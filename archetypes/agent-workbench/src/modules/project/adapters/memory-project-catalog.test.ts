import { describe, expect, it } from 'vitest'
import {
  createDefaultProject,
  createTaskCatalogRow,
  DEFAULT_PROJECT_ID,
  NEW_TASK_TITLE,
} from '../model/types'
import { createMemoryProjectCatalog } from './memory-project-catalog'
import { ProjectCatalogController } from '../application/project-catalog-controller'

describe('MemoryProjectCatalog + ProjectCatalogController', () => {
  it('bootstraps default project and zero tasks on empty catalog', async () => {
    const catalog = createMemoryProjectCatalog()
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()

    const view = controller.getView()
    expect(view.ready).toBe(true)
    expect(view.projects).toHaveLength(1)
    expect(view.projects[0]?.id).toBe(DEFAULT_PROJECT_ID)
    expect(view.projects[0]?.name).toBe('默认项目')
    expect(view.tasks).toHaveLength(0)
  })

  it('creates and lists tasks under a project without runStatus', async () => {
    const catalog = createMemoryProjectCatalog()
    await catalog.putProject(createDefaultProject())
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()

    const row = await controller.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-1',
    })
    expect(row.title).toBe(NEW_TASK_TITLE)
    expect(row.titleSource).toBe('local')
    expect('runStatus' in row).toBe(false)

    const view = controller.getView()
    expect(view.tasks).toHaveLength(1)
    expect(view.tasks[0]).toEqual({
      id: 'task-1',
      projectId: DEFAULT_PROJECT_ID,
      title: NEW_TASK_TITLE,
    })
  })

  it('renames project and task; hard-deletes task row', async () => {
    const catalog = createMemoryProjectCatalog()
    await catalog.putProject(createDefaultProject())
    await catalog.putTask(
      createTaskCatalogRow({
        id: 'task-a',
        projectId: DEFAULT_PROJECT_ID,
        title: '旧标题',
      }),
    )
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()

    await controller.renameProject(DEFAULT_PROJECT_ID, '我的工作区')
    await controller.renameTask('task-a', '新标题', 'user')
    expect(controller.getView().projects[0]?.name).toBe('我的工作区')
    expect(controller.getTaskRow('task-a')?.title).toBe('新标题')
    expect(controller.getTaskRow('task-a')?.titleSource).toBe('user')

    await controller.deleteTaskRow('task-a')
    expect(controller.getTaskRow('task-a')).toBeNull()
    expect(await catalog.getTask('task-a')).toBeNull()
  })

  it('creates additional projects', async () => {
    const catalog = createMemoryProjectCatalog()
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()

    const second = await controller.createProject('侧边项目')
    expect(second.name).toBe('侧边项目')
    expect(controller.getView().projects).toHaveLength(2)
  })

  it('persists localRoot/rootSource and reads missing fields as null', async () => {
    const catalog = createMemoryProjectCatalog()
    await catalog.putProject({
      ...createDefaultProject(),
      localRoot: '/Users/me/repo',
      rootSource: 'opened',
    })
    const withRoot = await catalog.getProject(DEFAULT_PROJECT_ID)
    expect(withRoot?.localRoot).toBe('/Users/me/repo')
    expect(withRoot?.rootSource).toBe('opened')
    expect('runStatus' in (withRoot ?? {})).toBe(false)

    await catalog.putProject({
      id: 'project-legacy',
      name: '旧记录',
      sortOrder: 1,
      pinned: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as ReturnType<typeof createDefaultProject>)
    const legacy = await catalog.getProject('project-legacy')
    expect(legacy?.localRoot).toBeNull()
    expect(legacy?.rootSource).toBeNull()
  })

  it('hydrate({ seedDefaultProject: false }) leaves an empty catalog', async () => {
    const catalog = createMemoryProjectCatalog()
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate({ seedDefaultProject: false })
    expect(controller.getView().projects).toHaveLength(0)
    expect(controller.getView().ready).toBe(true)
  })
})
