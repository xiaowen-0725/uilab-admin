/**
 * Empty / seed TaskReadModel + ProjectionState factories (pure).
 */

import type { ProjectId, TaskId } from '../model/lifecycle'
import type { ProjectionState, TaskReadModel } from './types'

export interface EmptyReadModelOptions {
  taskId: string
  projectId: string
  title?: string
  titleSource?: TaskReadModel['titleSource']
}

export function emptyTaskReadModel(options: EmptyReadModelOptions): TaskReadModel {
  return {
    taskId: options.taskId as TaskId,
    projectId: options.projectId as ProjectId,
    title: options.title ?? '未命名任务',
    titleSource: options.titleSource ?? 'local',
    projectionVersion: 0,
    runStatus: null,
    activeRunId: null,
    activeTurnId: null,
    liveStatus: null,
    plan: null,
    timeline: [],
    recoveryRequired: false,
    lastTaskSequence: 0,
    scroll: {
      followMode: 'follow',
      unreadCount: 0,
    },
  }
}

export function emptyProjectionState(options: EmptyReadModelOptions): ProjectionState {
  return {
    readModel: emptyTaskReadModel(options),
    seenEventIds: new Set<string>(),
  }
}
