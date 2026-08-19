/** Metadata key + fence predicate for the commit barrier (ADR-0025 §5 ④). */

export const IDENTITY_EPOCH_METADATA_PREFIX = 'board.identity.epoch:'
export const IDENTITY_LIVE_EXECUTIONS_KEY = 'board.identity.live-executions'

export function identityEpochMetadataKey(principalKey: string): string {
  return `${IDENTITY_EPOCH_METADATA_PREFIX}${principalKey}`
}

export type LiveExecutionMap = Record<string, string>

export function parseLiveExecutions(value: unknown): LiveExecutionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: LiveExecutionMap = {}
  for (const [key, principal] of Object.entries(value as Record<string, unknown>)) {
    if (typeof principal === 'string' && principal) next[key] = principal
  }
  return next
}

/**
 * No stored epoch yet → first evaluation may commit.
 * After logout / revoke writes an epoch, a stale captured generation is rejected.
 */
export function commitFenceRejects(
  expectedGeneration: number | undefined,
  storedEpoch: number | undefined,
  executionKey?: string,
  liveExecutions?: LiveExecutionMap,
): boolean {
  if (
    expectedGeneration !== undefined &&
    storedEpoch !== undefined &&
    storedEpoch !== expectedGeneration
  ) {
    return true
  }
  if (executionKey && liveExecutions && !(executionKey in liveExecutions)) {
    return true
  }
  return false
}
