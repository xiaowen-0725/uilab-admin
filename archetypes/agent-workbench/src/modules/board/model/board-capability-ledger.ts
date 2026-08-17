/**
 * Task-level Board capability ledger. Stored in the shared `metadata` store.
 * Meaning is "this Task may see board_* tools", not "it currently has a Board".
 */

export const BOARD_CAPABLE_TASK_IDS_KEY = 'board.capableTaskIds'
export const BOARD_FEATURE_ID = 'board' as const

export function parseTaskIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}
