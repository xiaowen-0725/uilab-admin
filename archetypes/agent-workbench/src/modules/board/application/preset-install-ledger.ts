/**
 * Shared "ever installed" ledger for example boards and plugin presets.
 */

import type { BoardStorePort } from '../ports/board-store-port'

export async function hydratePresetInstallLedger(
  store: BoardStorePort,
): Promise<Record<string, number>> {
  const installed = { ...(await store.getInstalledPresets()) }
  for (const board of await store.listBoards()) {
    if (!board.presetId || installed[board.presetId] != null) continue
    const version = board.presetVersion ?? 1
    await store.recordPresetInstalled(board.presetId, version)
    installed[board.presetId] = version
  }
  return installed
}
