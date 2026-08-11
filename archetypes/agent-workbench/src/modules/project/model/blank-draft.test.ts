import { describe, expect, it } from 'vitest'
import {
  createTaskCatalogRow,
  isBlankDraftTask,
  NEW_TASK_TITLE,
} from './types'
import { createMemoryProjectCatalog } from '../adapters/memory-project-catalog'
import { ProjectCatalogController } from '../application/project-catalog-controller'

describe('isBlankDraftTask / new-chat once', () => {
  it('detects default local 新对话 rows', () => {
    const row = createTaskCatalogRow({ id: 't1', projectId: 'p1' })
    expect(row.title).toBe(NEW_TASK_TITLE)
    expect(row.titleSource).toBe('local')
    expect(isBlankDraftTask(row)).toBe(true)
  })

  it('rejects renamed rows; keeps 新对话 even if titleSource is runtime', () => {
    expect(isBlankDraftTask({ title: 'hello' })).toBe(false)
    expect(isBlankDraftTask({ title: NEW_TASK_TITLE })).toBe(true)
  })

  it('controller createTask rows are blank drafts', async () => {
    const catalog = createMemoryProjectCatalog()
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()
    const row = await controller.createTask({
      projectId: 'project-default',
      taskId: 'task-x',
      title: NEW_TASK_TITLE,
    })
    expect(isBlankDraftTask(row)).toBe(true)
    expect(isBlankDraftTask(controller.getTaskRow('task-x')!)).toBe(true)
  })
})
