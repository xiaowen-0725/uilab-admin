/**
 * Lazy, idempotent install of the zero-job example Boards (spec §9.5).
 *
 * Trigger: first visit to the Board list, per preset not yet in the ledger.
 * Ledger: metadata `board.presets.installed` means "ever installed".
 * Deleting an example therefore does not recreate it. Preset version bumps
 * never overwrite a row the user may already have edited; new content uses
 * a new presetId.
 */

import { addWidgetToBoard } from './board-commands'
import {
  EXAMPLE_PRESETS,
  buildExampleBoard,
  buildExampleWidget,
  type ExamplePreset,
} from '../fixtures/example-presets'
import type { BoardStorePort } from '../ports/board-store-port'

export async function ensureExampleBoards(store: BoardStorePort): Promise<void> {
  const boards = await store.listBoards()
  const installed = { ...(await store.getInstalledPresets()) }

  for (const board of boards) {
    if (!board.presetId || installed[board.presetId] != null) continue
    const version = board.presetVersion ?? 1
    await store.recordPresetInstalled(board.presetId, version)
    installed[board.presetId] = version
  }

  const present = new Set(
    boards.map((board) => board.presetId).filter((id): id is string => Boolean(id)),
  )
  const now = new Date().toISOString()
  for (const preset of EXAMPLE_PRESETS) {
    if (installed[preset.id] != null) continue
    if (!present.has(preset.id)) {
      await installPreset(store, preset, now)
    }
    await store.recordPresetInstalled(preset.id, preset.version)
    installed[preset.id] = preset.version
  }
}

async function installPreset(
  store: BoardStorePort,
  preset: ExamplePreset,
  now: string,
): Promise<void> {
  await store.putBoard(buildExampleBoard(preset, now))
  for (const spec of preset.widgets) {
    await addWidgetToBoard(store, {
      boardId: preset.boardId,
      widget: buildExampleWidget(spec, now),
      placement: {
        mountId: `mount:${spec.id}`,
        widgetId: spec.id,
        ...spec.placement,
      },
    })
  }
}
