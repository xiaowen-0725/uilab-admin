/**
 * Task-level capability selection (no secrets).
 * Durable store is Composition-owned; this module defines the pure shape + helpers.
 */

import type { TaskCapabilitySelection } from '../ports/capability-snapshot-port'

export function emptyTaskCapabilitySelection(): TaskCapabilitySelection {
  return {
    connectorIds: [],
    skillIds: [],
    expertId: null,
  }
}

export function mergeTaskCapabilitySelection(
  prev: TaskCapabilitySelection,
  patch: Partial<TaskCapabilitySelection>,
): TaskCapabilitySelection {
  return {
    connectorIds:
      patch.connectorIds !== undefined
        ? unique(patch.connectorIds)
        : [...prev.connectorIds],
    skillIds:
      patch.skillIds !== undefined ? unique(patch.skillIds) : [...prev.skillIds],
    expertId:
      patch.expertId !== undefined
        ? patch.expertId?.trim() || null
        : prev.expertId,
  }
}

export function toggleConnectorSelection(
  selection: TaskCapabilitySelection,
  connectorId: string,
  selected: boolean,
): TaskCapabilitySelection {
  const set = new Set(selection.connectorIds)
  if (selected) set.add(connectorId)
  else set.delete(connectorId)
  return {
    ...selection,
    connectorIds: [...set].sort(),
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort()
}

/** Stable product ids used by this validation slice. */
export const CONNECTOR_GITHUB_ID = 'connector.github' as const
export const CONNECTOR_FEISHU_ID = 'connector.feishu' as const
export const EXPERT_OFFICE_MEETING_ID = 'expert.office-meeting' as const
