import {
  isSpecifiedWorkProject,
  toTaskSummary,
  type ProjectRecord,
  type ProjectSummary,
  type TaskCatalogRow,
  type TaskSummary,
} from '../model/types'

export interface NavigatorProjectGroup {
  project: ProjectSummary
  tasks: TaskSummary[]
}

export interface NavigatorTaskRail {
  looseTasks: TaskSummary[]
  projectGroups: NavigatorProjectGroup[]
}

/**
 * Split catalog rows for the Navigator rail:
 * unspecified projects → flat 任务; opened/created roots → 项目 folders.
 */
export function buildNavigatorTaskRail(input: {
  projects: readonly ProjectSummary[]
  getRecord: (projectId: string) => ProjectRecord | null
  listTasks: (projectId: string) => readonly TaskCatalogRow[]
}): NavigatorTaskRail {
  const looseTasks: TaskSummary[] = []
  const projectGroups: NavigatorProjectGroup[] = []

  for (const project of input.projects) {
    const tasks = input.listTasks(project.id).map(toTaskSummary)
    const record = input.getRecord(project.id)
    if (record && isSpecifiedWorkProject(record)) {
      projectGroups.push({ project, tasks })
    } else {
      looseTasks.push(...tasks)
    }
  }

  return { looseTasks, projectGroups }
}
