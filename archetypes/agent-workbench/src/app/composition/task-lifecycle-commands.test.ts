import {
  createMemoryProjectCatalog,
  DEFAULT_PROJECT_ID,
  NEW_TASK_TITLE,
  ProjectCatalogController,
} from '@/modules/project'
import { createTurnStatusIndex } from '@/modules/task'
import { createMemoryEventStore } from '@/modules/task-runtime'
import { describe, expect, it, vi } from 'vitest'
import {
  createNewChatTask,
  decideNewChat,
  hardDeleteTask,
  removeProjectFromList,
} from './task-lifecycle-commands'

describe('decideNewChat / blank-draft once', () => {
  it('reselects when current task is blank 新对话 draft in same project', () => {
    const decision = decideNewChat({
      selectedProjectId: DEFAULT_PROJECT_ID,
      selectedTask: {
        id: 'task-1',
        projectId: DEFAULT_PROJECT_ID,
        title: NEW_TASK_TITLE,
        titleSource: 'local',
        lastAcceptedSuggestionVersion: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(decision).toEqual({ kind: 'reselect', taskId: 'task-1' })
  })

  it('reselects an existing blank draft in the project when nothing is selected', () => {
    expect(
      decideNewChat({
        selectedProjectId: DEFAULT_PROJECT_ID,
        selectedTask: null,
        blankDraftInProject: {
          id: 'task-draft',
          projectId: DEFAULT_PROJECT_ID,
          title: NEW_TASK_TITLE,
          titleSource: 'local',
          lastAcceptedSuggestionVersion: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ).toEqual({ kind: 'reselect', taskId: 'task-draft' })
  })

  it('creates when selection is null or renamed', () => {
    expect(
      decideNewChat({
        selectedProjectId: DEFAULT_PROJECT_ID,
        selectedTask: null,
      })
    ).toEqual({ kind: 'create' })

    expect(
      decideNewChat({
        selectedProjectId: DEFAULT_PROJECT_ID,
        selectedTask: {
          id: 'task-1',
          projectId: DEFAULT_PROJECT_ID,
          title: '已改标题',
          titleSource: 'user',
          lastAcceptedSuggestionVersion: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      })
    ).toEqual({ kind: 'create' })
  })

  it('creates when blank draft belongs to another project', () => {
    expect(
      decideNewChat({
        selectedProjectId: DEFAULT_PROJECT_ID,
        selectedTask: {
          id: 'task-1',
          projectId: 'other-project',
          title: NEW_TASK_TITLE,
          titleSource: 'local',
          lastAcceptedSuggestionVersion: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      })
    ).toEqual({ kind: 'create' })
  })
})

describe('createNewChatTask', () => {
  it('creates catalog row with 新对话 title', async () => {
    const catalog = createMemoryProjectCatalog()
    const controller = new ProjectCatalogController(catalog)
    await controller.hydrate()
    const row = await createNewChatTask({
      catalog: controller,
      projectId: DEFAULT_PROJECT_ID,
      sequence: 1,
      now: 1_700_000_000_000,
    })
    expect(row.title).toBe(NEW_TASK_TITLE)
    expect(row.id).toContain('task-')
    expect(controller.getTaskRow(row.id)).toBeTruthy()
  })
})

describe('hardDeleteTask', () => {
  it('delete selected → nextSelected + lastTaskByProject updated', async () => {
    const catalogPort = createMemoryProjectCatalog()
    const catalog = new ProjectCatalogController(catalogPort)
    await catalog.hydrate()
    const a = await catalog.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-a',
      title: 'A',
    })
    const b = await catalog.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-b',
      title: 'B',
    })
    // Make B newer
    await catalog.renameTask(b.id, 'B2', 'user')

    const eventStore = createMemoryEventStore()
    await eventStore
      .append({
        taskId: a.id,
        // minimal shape accepted by memory store tests elsewhere
      } as never)
      .catch(() => {
        // Some stores require full envelope; delete still exercises cascade path
      })

    const runStatusIndex = createTurnStatusIndex()
    runStatusIndex.set(a.id, 'running')
    const onTaskDeleted = vi.fn()

    const result = await hardDeleteTask({
      taskId: a.id,
      catalog,
      eventStore,
      db: null,
      persistence: 'memory',
      runStatusIndex,
      runtimeController: null,
      activeTaskId: a.id,
      selectedTaskId: a.id,
      selectedProjectId: DEFAULT_PROJECT_ID,
      lastTaskByProject: {
        [DEFAULT_PROJECT_ID]: a.id,
        'other-project': 'task-other',
      },
      onTaskDeleted,
    })

    expect(catalog.getTaskRow(a.id)).toBeNull()
    expect(catalog.getTaskRow(b.id)).toBeTruthy()
    expect(result.selectionChanged).toBe(true)
    expect(result.nextSelectedTaskId).toBe(b.id)
    expect(result.lastTaskByProject[DEFAULT_PROJECT_ID]).toBe(b.id)
    // Other projects' keys preserved
    expect(result.lastTaskByProject['other-project']).toBe('task-other')
    expect(runStatusIndex.get(a.id)).toBeNull()
    expect(onTaskDeleted).toHaveBeenCalledWith(a.id)
  })

  it('delete non-selected while another remains selected → last stays selected', async () => {
    const catalogPort = createMemoryProjectCatalog()
    const catalog = new ProjectCatalogController(catalogPort)
    await catalog.hydrate()
    const selected = await catalog.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-selected',
      title: 'Selected',
    })
    const other = await catalog.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-other',
      title: 'Other',
    })
    // Make other newer so nextSelected would prefer it if we wrongly always used it
    await catalog.renameTask(other.id, 'Other2', 'user')

    const runStatusIndex = createTurnStatusIndex()
    const result = await hardDeleteTask({
      taskId: other.id,
      catalog,
      eventStore: createMemoryEventStore(),
      db: null,
      persistence: 'memory',
      runStatusIndex,
      runtimeController: null,
      activeTaskId: selected.id,
      selectedTaskId: selected.id,
      selectedProjectId: DEFAULT_PROJECT_ID,
      lastTaskByProject: { [DEFAULT_PROJECT_ID]: selected.id },
    })

    expect(catalog.getTaskRow(other.id)).toBeNull()
    expect(catalog.getTaskRow(selected.id)).toBeTruthy()
    expect(result.selectionChanged).toBe(false)
    // nextSelected is still the newest remaining (selected is older after rename of other)
    // but last for project must stay on the still-selected task
    expect(result.lastTaskByProject[DEFAULT_PROJECT_ID]).toBe(selected.id)
  })

  it('cancel timeout/failure does not block hard delete', async () => {
    const catalogPort = createMemoryProjectCatalog()
    const catalog = new ProjectCatalogController(catalogPort)
    await catalog.hydrate()
    const row = await catalog.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-busy',
      title: NEW_TASK_TITLE,
    })

    const cancelActiveRun = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('cancel failed')), 10)
        })
    )
    const detach = vi.fn()
    const runtimeController = {
      cancelActiveRun,
      detach,
    } as never

    const runStatusIndex = createTurnStatusIndex()
    runStatusIndex.set(row.id, 'running')

    const result = await hardDeleteTask({
      taskId: row.id,
      catalog,
      eventStore: createMemoryEventStore(),
      db: null,
      persistence: 'memory',
      runStatusIndex,
      runtimeController,
      activeTaskId: row.id,
      selectedTaskId: row.id,
      selectedProjectId: DEFAULT_PROJECT_ID,
      lastTaskByProject: {},
      activeRunStatus: 'running',
      cancelTimeoutMs: 5,
    })

    expect(catalog.getTaskRow(row.id)).toBeNull()
    expect(result.nextSelectedTaskId).toBeNull()
    expect(result.lastTaskByProject[DEFAULT_PROJECT_ID]).toBeNull()
    expect(detach).toHaveBeenCalled()
  })
})

describe('removeProjectFromList', () => {
  it('removes the selected project and retargets to a remaining project', async () => {
    const catalogPort = createMemoryProjectCatalog()
    const catalog = new ProjectCatalogController(catalogPort)
    await catalog.hydrate()
    const specified = await catalog.createProject('桌面项目', {
      localRoot: '/virtual/AgentWorkbench/桌面项目',
      rootSource: 'created',
    })
    const task = await catalog.createTask({
      projectId: specified.id,
      taskId: 'task-desk',
      title: '问候',
    })
    const leftover = await catalog.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-default',
      title: '默认对话',
    })

    const runStatusIndex = createTurnStatusIndex()
    const onTaskDeleted = vi.fn()

    const result = await removeProjectFromList({
      projectId: specified.id,
      catalog,
      eventStore: createMemoryEventStore(),
      runStatusIndex,
      runtimeController: null,
      activeTaskId: task.id,
      selectedTaskId: task.id,
      selectedProjectId: specified.id,
      lastTaskByProject: {
        [specified.id]: task.id,
        [DEFAULT_PROJECT_ID]: leftover.id,
      },
      onTaskDeleted,
    })

    expect(catalog.getProjectRecord(specified.id)).toBeNull()
    expect(catalog.getTaskRow(task.id)).toBeNull()
    expect(catalog.getTaskRow(leftover.id)).toBeTruthy()
    expect(result.removedTaskIds).toEqual([task.id])
    expect(result.selectionChanged).toBe(true)
    expect(result.nextSelectedProjectId).toBe(DEFAULT_PROJECT_ID)
    expect(result.nextSelectedTaskId).toBe(leftover.id)
    expect(result.lastTaskByProject[specified.id]).toBeUndefined()
    expect(result.lastTaskByProject[DEFAULT_PROJECT_ID]).toBe(leftover.id)
    expect(runStatusIndex.get(task.id)).toBeNull()
    expect(onTaskDeleted).toHaveBeenCalledWith(task.id)
  })

  it('keeps the current selection when removing another project', async () => {
    const catalogPort = createMemoryProjectCatalog()
    const catalog = new ProjectCatalogController(catalogPort)
    await catalog.hydrate()
    const other = await catalog.createProject('旁路项目', {
      localRoot: '/virtual/AgentWorkbench/旁路项目',
      rootSource: 'opened',
    })
    const current = await catalog.createTask({
      projectId: DEFAULT_PROJECT_ID,
      taskId: 'task-current',
      title: '当前',
    })
    const dropped = await catalog.createTask({
      projectId: other.id,
      taskId: 'task-dropped',
      title: '将被移除',
    })

    const result = await removeProjectFromList({
      projectId: other.id,
      catalog,
      eventStore: createMemoryEventStore(),
      runStatusIndex: createTurnStatusIndex(),
      runtimeController: null,
      activeTaskId: current.id,
      selectedTaskId: current.id,
      selectedProjectId: DEFAULT_PROJECT_ID,
      lastTaskByProject: {
        [DEFAULT_PROJECT_ID]: current.id,
        [other.id]: dropped.id,
      },
    })

    expect(catalog.getProjectRecord(other.id)).toBeNull()
    expect(catalog.getTaskRow(dropped.id)).toBeNull()
    expect(result.selectionChanged).toBe(false)
    expect(result.nextSelectedProjectId).toBe(DEFAULT_PROJECT_ID)
    expect(result.nextSelectedTaskId).toBe(current.id)
    expect(result.lastTaskByProject[other.id]).toBeUndefined()
  })

  it('clears selection when the last project is removed', async () => {
    const catalogPort = createMemoryProjectCatalog()
    const catalog = new ProjectCatalogController(catalogPort)
    await catalog.hydrate({ seedDefaultProject: false })
    const only = await catalog.createProject('唯一项目', {
      localRoot: '/virtual/AgentWorkbench/唯一项目',
      rootSource: 'created',
    })
    const task = await catalog.createTask({
      projectId: only.id,
      taskId: 'task-only',
      title: '仅有',
    })

    const result = await removeProjectFromList({
      projectId: only.id,
      catalog,
      eventStore: createMemoryEventStore(),
      runStatusIndex: createTurnStatusIndex(),
      runtimeController: null,
      activeTaskId: task.id,
      selectedTaskId: task.id,
      selectedProjectId: only.id,
      lastTaskByProject: { [only.id]: task.id },
    })

    expect(catalog.getView().projects).toHaveLength(0)
    expect(result.nextSelectedProjectId).toBeNull()
    expect(result.nextSelectedTaskId).toBeNull()
    expect(result.lastTaskByProject).toEqual({})
  })
})
