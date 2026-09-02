/**
 * Task-owned Interactive Artifact record.
 * Identity is (taskId, id). Query without the owning Task is not found.
 */

export const INTERACTIVE_ARTIFACT_KIND = 'interactive' as const

export type InteractiveArtifactId = string

export type InteractiveArtifactRecord = {
  id: InteractiveArtifactId
  taskId: string
  title: string
  html: string
  contentHash: string
  createdAt: string
  updatedAt: string
}

export function cloneInteractiveArtifactRecord(
  record: InteractiveArtifactRecord,
): InteractiveArtifactRecord {
  return { ...record }
}

export function compareInteractiveArtifactRecords(
  left: InteractiveArtifactRecord,
  right: InteractiveArtifactRecord,
): number {
  const byCreated = left.createdAt.localeCompare(right.createdAt)
  if (byCreated !== 0) return byCreated
  return left.id.localeCompare(right.id)
}
