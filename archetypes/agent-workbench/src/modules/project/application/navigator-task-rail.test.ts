import { describe, expect, it } from 'vitest'
import { createTaskCatalogRow, toProjectSummary } from '../model/types'
import { buildNavigatorTaskRail } from './navigator-task-rail'

const loose = toProjectSummary({
  id: 'project-default',
  name: '默认项目',
  sortOrder: 0,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  localRoot: null,
  rootSource: null,
})

const auto = toProjectSummary({
  id: 'project-auto',
  name: '项目',
  sortOrder: 1,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  localRoot: '/tmp/auto',
  rootSource: 'auto',
})

const created = toProjectSummary({
  id: 'project-desk',
  name: '桌面项目',
  sortOrder: 2,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  localRoot: '/tmp/desk',
  rootSource: 'created',
})

const records = {
  [loose.id]: {
    ...loose,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    localRoot: null,
    rootSource: null,
  },
  [auto.id]: {
    ...auto,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    localRoot: '/tmp/auto',
    rootSource: 'auto' as const,
  },
  [created.id]: {
    ...created,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    localRoot: '/tmp/desk',
    rootSource: 'created' as const,
  },
}

const tasks = {
  [loose.id]: [createTaskCatalogRow({ id: 'task-loose', projectId: loose.id })],
  [auto.id]: [createTaskCatalogRow({ id: 'task-auto', projectId: auto.id })],
  [created.id]: [
    createTaskCatalogRow({ id: 'task-desk', projectId: created.id, title: '诗' }),
  ],
}

describe('buildNavigatorTaskRail', () => {
  it('keeps auto and no-root tasks in 任务; folders only for specified roots', () => {
    const rail = buildNavigatorTaskRail({
      projects: [loose, auto, created],
      getRecord: (id) => records[id] ?? null,
      listTasks: (id) => tasks[id] ?? [],
    })

    expect(rail.looseTasks.map((row) => row.id)).toEqual([
      'task-loose',
      'task-auto',
    ])
    expect(rail.projectGroups).toHaveLength(1)
    expect(rail.projectGroups[0]?.project.id).toBe('project-desk')
    expect(rail.projectGroups[0]?.tasks.map((row) => row.id)).toEqual([
      'task-desk',
    ])
  })
})
