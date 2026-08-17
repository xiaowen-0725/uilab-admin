/**
 * Task-level Board capability: created from 对话创建, or after a successful commit.
 */

import { BOARD_FEATURE_ID } from '../model/board-capability-ledger'
import type { BoardStorePort } from '../ports/board-store-port'

export { BOARD_FEATURE_ID }

export async function grantBoardCapability(
  store: BoardStorePort,
  taskId: string,
): Promise<void> {
  const id = taskId.trim()
  if (!id) return
  await store.grantBoardCapability(id)
}

export async function resolveCapabilityFeatureIds(
  store: BoardStorePort,
  taskId: string,
): Promise<string[]> {
  const id = taskId.trim()
  if (!id) return []
  const granted =
    (await store.listBoardCapableTaskIds()).includes(id) ||
    (await store.hasBoardCreatedByTask(id))
  return granted ? [BOARD_FEATURE_ID] : []
}
