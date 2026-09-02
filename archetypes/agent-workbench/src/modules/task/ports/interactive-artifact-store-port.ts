import type { InteractiveArtifactRecord } from '../model/interactive-artifact'

/**
 * Task-scoped Interactive Artifact library.
 * Every read takes taskId; another Task's id is treated as missing.
 */
export interface InteractiveArtifactStorePort {
  get(
    taskId: string,
    artifactId: string,
  ): Promise<InteractiveArtifactRecord | null>

  list(taskId: string): Promise<readonly InteractiveArtifactRecord[]>

  findByContentHash(
    taskId: string,
    contentHash: string,
  ): Promise<InteractiveArtifactRecord | null>

  put(record: InteractiveArtifactRecord): Promise<void>

  deleteByTaskId(taskId: string): Promise<void>
}
