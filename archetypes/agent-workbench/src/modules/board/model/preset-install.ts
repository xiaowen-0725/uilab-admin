/**
 * Example-board install ledger. Stored in the shared `metadata` store.
 * Value means "this preset was installed at least once" — not "it still exists".
 */

export const BOARD_PRESETS_INSTALLED_KEY = 'board.presets.installed'

export function parsePresetMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, number> = {}
  for (const [presetId, version] of Object.entries(value)) {
    if (typeof version === 'number' && Number.isFinite(version)) {
      next[presetId] = version
    }
  }
  return next
}
