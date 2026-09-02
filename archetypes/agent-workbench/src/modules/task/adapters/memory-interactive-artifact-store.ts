/**
 * In-memory Interactive Artifact store for tests and Memory boot.
 */

import {
  cloneInteractiveArtifactRecord,
  compareInteractiveArtifactRecords,
  type InteractiveArtifactRecord,
} from '../model/interactive-artifact'
import type { InteractiveArtifactStorePort } from '../ports/interactive-artifact-store-port'

function storageKey(taskId: string, artifactId: string): string {
  return `${taskId}\0${artifactId}`
}

export class MemoryInteractiveArtifactStore
  implements InteractiveArtifactStorePort
{
  private readonly rows = new Map<string, InteractiveArtifactRecord>()

  async get(
    taskId: string,
    artifactId: string,
  ): Promise<InteractiveArtifactRecord | null> {
    const row = this.rows.get(storageKey(taskId, artifactId))
    return row ? cloneInteractiveArtifactRecord(row) : null
  }

  async list(taskId: string): Promise<readonly InteractiveArtifactRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.taskId === taskId)
      .sort(compareInteractiveArtifactRecords)
      .map(cloneInteractiveArtifactRecord)
  }

  async findByContentHash(
    taskId: string,
    contentHash: string,
  ): Promise<InteractiveArtifactRecord | null> {
    const match = (await this.list(taskId)).find(
      (row) => row.contentHash === contentHash,
    )
    return match ?? null
  }

  async put(record: InteractiveArtifactRecord): Promise<void> {
    this.rows.set(
      storageKey(record.taskId, record.id),
      cloneInteractiveArtifactRecord(record),
    )
  }

  async deleteByTaskId(taskId: string): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.taskId === taskId) this.rows.delete(key)
    }
  }
}

export function createMemoryInteractiveArtifactStore(): MemoryInteractiveArtifactStore {
  return new MemoryInteractiveArtifactStore()
}
