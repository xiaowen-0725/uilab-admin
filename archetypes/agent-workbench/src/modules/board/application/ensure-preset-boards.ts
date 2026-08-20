/**
 * Lazy, idempotent install of plugin-contributed preset boards (ADR-0024 §5).
 *
 * Ledger is the same `board.presets.installed` map as example boards:
 * "ever installed", never overwrite, version bumps do not replace a row.
 */

import {
  buildPresetBoard,
  buildPresetQuerySource,
  buildPresetWidget,
  presetBoardId,
} from '../model/preset-board'
import type { BoardPresetCatalogPort } from '../ports/board-preset-catalog-port'
import type { BoardStorePort } from '../ports/board-store-port'
import { addWidgetToBoard } from './board-commands'

export async function ensurePresetBoards(
  store: BoardStorePort,
  catalog: BoardPresetCatalogPort,
  now = new Date().toISOString(),
): Promise<void> {
  const installed = { ...(await store.getInstalledPresets()) }

  for (const board of await store.listBoards()) {
    if (!board.presetId || installed[board.presetId] != null) continue
    const version = board.presetVersion ?? 1
    await store.recordPresetInstalled(board.presetId, version)
    installed[board.presetId] = version
  }

  for (const entry of await catalog.listPresetBoards()) {
    if (installed[entry.presetId] != null) continue
    await installPresetBoard(store, entry, now)
    await store.recordPresetInstalled(entry.presetId, entry.version)
    installed[entry.presetId] = entry.version
  }
}

async function installPresetBoard(
  store: BoardStorePort,
  entry: Awaited<ReturnType<BoardPresetCatalogPort['listPresetBoards']>>[number],
  now: string,
): Promise<void> {
  await store.putBoard(buildPresetBoard(entry, now))
  for (const spec of entry.widgets) {
    const widget = buildPresetWidget(entry.presetId, spec, now)
    await addWidgetToBoard(store, {
      boardId: presetBoardId(entry.presetId),
      widget,
      placement: {
        mountId: `mount:${widget.id}`,
        widgetId: widget.id,
        ...spec.placement,
      },
      dataSource: buildPresetQuerySource(entry.presetId, spec, now),
    })
  }
}
