/**
 * Lazy, idempotent install of the zero-job example Boards (spec §9.5).
 *
 * Trigger: first visit to the Board list, per preset not yet in the ledger.
 * Ledger: metadata `board.presets.installed` means "ever installed".
 * Deleting an example therefore does not recreate it. Preset version bumps
 * never overwrite a row the user may already have edited; new content uses
 * a new presetId.
 */

import {
  EXAMPLE_PRESETS,
  buildExampleBoard,
  buildExampleWidget,
  type ExamplePreset,
} from '../fixtures/example-presets'
import type { BoardStorePort } from '../ports/board-store-port'
import { addWidgetToBoard } from './board-commands'
import { hydratePresetInstallLedger } from './preset-install-ledger'

export async function ensureExampleBoards(store: BoardStorePort): Promise<void> {
  const installed = await hydratePresetInstallLedger(store)
  const now = new Date().toISOString()
  for (const preset of EXAMPLE_PRESETS) {
    if (installed[preset.id] != null) continue
    await installPreset(store, preset, now)
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
