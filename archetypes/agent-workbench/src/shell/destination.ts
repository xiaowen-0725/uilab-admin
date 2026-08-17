/**
 * Shell-owned destination. Not persisted — cold start always returns to Task.
 */
export type ShellDestination =
  | { kind: 'task' }
  | { kind: 'capabilities' }
  | { kind: 'board'; boardId?: string }

export const TASK_DESTINATION: ShellDestination = { kind: 'task' }

export function isTaskDestination(
  destination: ShellDestination,
): destination is { kind: 'task' } {
  return destination.kind === 'task'
}
