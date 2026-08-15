/**
 * Task lifecycle commands — new chat (blank-draft once), hard delete, and
 * remove-project-from-list. Shell only receives callbacks; this unit owns
 * catalog / EventStore / pointer updates. Removing a project never deletes
 * the local folder.
 */
import { deleteTaskCascade } from '@/app/persistence/workbench-idb'
import {
  isBlankDraftTask,
  NEW_TASK_TITLE,
  type ProjectCatalogController,
  type TaskCatalogRow,
} from '@/modules/project'
import type { EventStorePort, TurnStatus } from '@/modules/task'
import {
  isNavigatorBusyStatus,
  type TurnStatusIndex,
  type TaskRuntimeController,
} from '@/modules/task'
import type { WorkbenchPersistence } from './workbench-boot'

export type NewChatDecision =
  | { kind: 'reselect'; taskId: string }
  | { kind: 'create' }

function isUsableBlankDraft(
  row: TaskCatalogRow | null | undefined,
  projectId: string,
): row is TaskCatalogRow {
  return row != null && row.projectId === projectId && isBlankDraftTask(row)
}

/**
 * Blank unused draft → re-select only (Codex / WorkBuddy: 新对话只开一次).
 */
export function decideNewChat(input: {
  selectedProjectId: string
  selectedTask: TaskCatalogRow | null
  /** Unused 新对话 already in this project (WorkBuddy: open once). */
  blankDraftInProject?: TaskCatalogRow | null
}): NewChatDecision {
  const { selectedProjectId, selectedTask, blankDraftInProject } = input
  if (isUsableBlankDraft(selectedTask, selectedProjectId)) {
    return { kind: 'reselect', taskId: selectedTask.id }
  }
  if (isUsableBlankDraft(blankDraftInProject, selectedProjectId)) {
    return { kind: 'reselect', taskId: blankDraftInProject.id }
  }
  return { kind: 'create' }
}

export interface CreateNewChatTaskInput {
  catalog: ProjectCatalogController
  projectId: string
  /** Monotonic counter for unique ids within a session. */
  sequence: number
  now?: number
  title?: string
}

export async function createNewChatTask(
  input: CreateNewChatTaskInput
): Promise<TaskCatalogRow> {
  const now = input.now ?? Date.now()
  const newTaskId = `task-${now.toString(36)}-${input.sequence}`
  return input.catalog.createTask({
    projectId: input.projectId,
    taskId: newTaskId,
    title: input.title ?? NEW_TASK_TITLE,
  })
}

export interface HardDeleteTaskInput {
  taskId: string
  catalog: ProjectCatalogController
  eventStore: EventStorePort | null
  db: IDBDatabase | null
  persistence: WorkbenchPersistence
  runStatusIndex: TurnStatusIndex
  runtimeController: TaskRuntimeController | null
  /** Currently attached/selected task (for cancel + detach). */
  activeTaskId: string | null
  selectedTaskId: string | null
  selectedProjectId: string
  lastTaskByProject: Record<string, string | null>
  navigatorOpen?: boolean
  /** Live run status when deleting the active task. */
  activeRunStatus?: TurnStatus | null
  cancelTimeoutMs?: number
  onTaskDeleted?: (taskId: string) => void | Promise<void>
}

export interface HardDeleteTaskResult {
  nextSelectedTaskId: string | null
  lastTaskByProject: Record<string, string | null>
  /** True when the deleted task was the session selection. */
  selectionChanged: boolean
}

/**
 * Best-effort cancel busy run, cascade hard delete, retarget session pointers.
 * Cancel timeout/failure does not block hard delete.
 */
export async function hardDeleteTask(
  input: HardDeleteTaskInput
): Promise<HardDeleteTaskResult> {
  const {
    taskId: deleteTaskId,
    catalog,
    eventStore,
    db,
    persistence,
    runStatusIndex,
    runtimeController,
    activeTaskId,
    selectedTaskId,
    selectedProjectId,
    navigatorOpen,
    activeRunStatus,
    cancelTimeoutMs = 3000,
  } = input

  const status = runStatusIndex.get(deleteTaskId)
  if (
    activeTaskId === deleteTaskId &&
    runtimeController &&
    isNavigatorBusyStatus(status ?? activeRunStatus)
  ) {
    try {
      await Promise.race([
        runtimeController.cancelActiveRun(),
        new Promise((resolve) => setTimeout(resolve, cancelTimeoutMs)),
      ])
    } catch {
      // continue hard delete
    }
  }

  if (activeTaskId === deleteTaskId) {
    runtimeController?.detach()
  }

  const projectTasks = catalog.listTasksInProject(selectedProjectId)
  const remaining = projectTasks.filter((t) => t.id !== deleteTaskId)
  const nextSelected =
    remaining.length > 0
      ? remaining.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]!.id
      : null

  // Session memory map must stay consistent with selection:
  // - deleting selected → last for project = nextSelected (newest remaining or null)
  // - deleting non-selected → keep selectedTaskId when it remains; else nextSelected
  // Other projects' keys are preserved from the input map.
  const deletingSelected = selectedTaskId === deleteTaskId
  let lastForProject: string | null
  if (deletingSelected) {
    lastForProject = nextSelected
  } else {
    const selectedStillExists =
      selectedTaskId != null && remaining.some((t) => t.id === selectedTaskId)
    lastForProject = selectedStillExists ? selectedTaskId : nextSelected
  }

  const lastTaskByProject = {
    ...input.lastTaskByProject,
    [selectedProjectId]: lastForProject,
  }

  if (persistence === 'idb' && db) {
    try {
      await deleteTaskCascade(db, {
        taskId: deleteTaskId,
        nextSelectedTaskId:
          selectedTaskId === deleteTaskId ? nextSelected : selectedTaskId,
        selectedProjectId,
        lastTaskByProject,
        navigatorOpen,
      })
      catalog.forgetTaskLocally(deleteTaskId)
    } catch {
      await eventStore?.deleteTaskData(deleteTaskId)
      await catalog.deleteTaskRow(deleteTaskId)
    }
  } else {
    await eventStore?.deleteTaskData(deleteTaskId)
    await catalog.deleteTaskRow(deleteTaskId)
  }

  runStatusIndex.clear(deleteTaskId)
  await input.onTaskDeleted?.(deleteTaskId)

  return {
    nextSelectedTaskId: nextSelected,
    lastTaskByProject,
    selectionChanged: selectedTaskId === deleteTaskId,
  }
}

export interface RemoveProjectFromListInput {
  projectId: string
  catalog: ProjectCatalogController
  eventStore: EventStorePort | null
  runStatusIndex: TurnStatusIndex
  runtimeController: TaskRuntimeController | null
  activeTaskId: string | null
  selectedTaskId: string | null
  selectedProjectId: string | null
  lastTaskByProject: Record<string, string | null>
  activeRunStatus?: TurnStatus | null
  cancelTimeoutMs?: number
  onTaskDeleted?: (taskId: string) => void | Promise<void>
}

export interface RemoveProjectFromListResult {
  removedTaskIds: string[]
  nextSelectedProjectId: string | null
  nextSelectedTaskId: string | null
  lastTaskByProject: Record<string, string | null>
  selectionChanged: boolean
}

/**
 * Drop a project from the catalog and cascade its task records.
 * Does not delete the filesystem folder.
 */
export async function removeProjectFromList(
  input: RemoveProjectFromListInput,
): Promise<RemoveProjectFromListResult> {
  const {
    projectId,
    catalog,
    eventStore,
    runStatusIndex,
    runtimeController,
    activeTaskId,
    selectedTaskId,
    selectedProjectId,
    activeRunStatus,
    cancelTimeoutMs = 3000,
  } = input

  const taskIds = catalog.listTasksInProject(projectId).map((row) => row.id)
  const removingSelected = selectedProjectId === projectId
  const selectedTaskInProject =
    selectedTaskId != null && taskIds.includes(selectedTaskId)

  if (activeTaskId && taskIds.includes(activeTaskId) && runtimeController) {
    const status = runStatusIndex.get(activeTaskId)
    if (isNavigatorBusyStatus(status ?? activeRunStatus)) {
      try {
        await Promise.race([
          runtimeController.cancelActiveRun(),
          new Promise((resolve) => setTimeout(resolve, cancelTimeoutMs)),
        ])
      } catch {
        // continue list removal
      }
    }
    runtimeController.detach()
  }

  for (const taskId of taskIds) {
    await eventStore?.deleteTaskData(taskId)
    runStatusIndex.clear(taskId)
    await input.onTaskDeleted?.(taskId)
  }

  await catalog.removeProject(projectId)

  const { [projectId]: _removed, ...lastRest } = input.lastTaskByProject
  const remaining = catalog.getView().projects
  const nextSelectedProjectId = removingSelected
    ? (remaining[0]?.id ?? null)
    : selectedProjectId

  let nextSelectedTaskId: string | null
  if (removingSelected || selectedTaskInProject) {
    if (nextSelectedProjectId) {
      const remembered = lastRest[nextSelectedProjectId] ?? null
      nextSelectedTaskId =
        remembered && catalog.getTaskRow(remembered) ? remembered : null
    } else {
      nextSelectedTaskId = null
    }
  } else {
    nextSelectedTaskId =
      selectedTaskId && catalog.getTaskRow(selectedTaskId)
        ? selectedTaskId
        : null
  }

  return {
    removedTaskIds: taskIds,
    nextSelectedProjectId,
    nextSelectedTaskId,
    lastTaskByProject: lastRest,
    selectionChanged: removingSelected || selectedTaskInProject,
  }
}
