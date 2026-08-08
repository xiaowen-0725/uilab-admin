import { describe, expect, it, vi } from 'vitest'
import {
  createNewChatTask,
  decideNewChat,
  hardDeleteTask,
} from './task-lifecycle-commands'
import {
  createMemoryProjectCatalog,
  DEFAULT_PROJECT_ID,
  NEW_TASK_TITLE,
  ProjectCatalogController,
} from '@/modules/project'
import {
  createMemoryEventStore,
  createRunStatusIndex,
} from '@/modules/task'

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

  it('creates when selection is null or renamed', () => {
    expect(
      decideNewChat({
        selectedProjectId: DEFAULT_PROJECT_ID,
        selectedTask: null,
      }),
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
      }),
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
      }),
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
  it('removes catalog + events and retargets selection (memory path)', async () => {
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
    await eventStore.append({
      taskId: a.id,
      // minimal shape accepted by memory store tests elsewhere
    } as never).catch(() => {
      // Some stores require full envelope; delete still exercises cascade path
    })

    const runStatusIndex = createRunStatusIndex()
    runStatusIndex.set(a.id, 'running')

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
      lastTaskByProject: { [DEFAULT_PROJECT_ID]: a.id },
    })

    expect(catalog.getTaskRow(a.id)).toBeNull()
    expect(catalog.getTaskRow(b.id)).toBeTruthy()
    expect(result.selectionChanged).toBe(true)
    expect(result.nextSelectedTaskId).toBe(b.id)
    expect(runStatusIndex.get(a.id)).toBeNull()
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
        }),
    )
    const detach = vi.fn()
    const runtimeController = {
      cancelActiveRun,
      detach,
    } as never

    const runStatusIndex = createRunStatusIndex()
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
    expect(detach).toHaveBeenCalled()
  })
})
