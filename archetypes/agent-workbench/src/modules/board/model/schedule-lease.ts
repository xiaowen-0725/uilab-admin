/**
 * IDB schedule lease — exclusive claim for a due Widget Data Source.
 * ADR-0024 §4: no daemon; expired leases are stealable.
 */

export const SCHEDULE_LEASES_METADATA_KEY = 'board.schedule.leases'

export interface ScheduleLeaseRecord {
  sourceId: string
  instanceId: string
  executionKey: string
  leasedUntil: string
  claimGeneration: number
  principalKey: string
}

export interface ClaimScheduleLeaseInput {
  sourceId: string
  instanceId: string
  executionKey: string
  leaseMs: number
  nowIso: string
  principalKey: string
}

export type ClaimScheduleLeaseResult =
  | { ok: true; lease: ScheduleLeaseRecord }
  | { ok: false; reason: 'held'; lease: ScheduleLeaseRecord }

export function parseScheduleLease(
  value: unknown,
): ScheduleLeaseRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row = value as Record<string, unknown>
  if (
    typeof row.sourceId !== 'string' ||
    typeof row.instanceId !== 'string' ||
    typeof row.executionKey !== 'string' ||
    typeof row.leasedUntil !== 'string' ||
    typeof row.principalKey !== 'string' ||
    typeof row.claimGeneration !== 'number' ||
    !Number.isFinite(row.claimGeneration)
  ) {
    return undefined
  }
  return {
    sourceId: row.sourceId,
    instanceId: row.instanceId,
    executionKey: row.executionKey,
    leasedUntil: row.leasedUntil,
    claimGeneration: row.claimGeneration,
    principalKey: row.principalKey,
  }
}

export function parseScheduleLeases(
  value: unknown,
): Record<string, ScheduleLeaseRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, ScheduleLeaseRecord> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lease = parseScheduleLease(raw)
    if (lease) next[key] = lease
  }
  return next
}

export function isLeaseHeld(
  lease: ScheduleLeaseRecord | undefined,
  nowIso: string,
): boolean {
  if (!lease) return false
  const until = Date.parse(lease.leasedUntil)
  const now = Date.parse(nowIso)
  if (Number.isNaN(until) || Number.isNaN(now)) return false
  return until > now
}

export function resolveScheduleClaim(
  current: ScheduleLeaseRecord | undefined,
  input: ClaimScheduleLeaseInput,
): ClaimScheduleLeaseResult {
  if (current && isLeaseHeld(current, input.nowIso)) {
    return { ok: false, reason: 'held', lease: current }
  }
  return {
    ok: true,
    lease: {
      sourceId: input.sourceId,
      instanceId: input.instanceId,
      executionKey: input.executionKey,
      leasedUntil: new Date(
        Date.parse(input.nowIso) + input.leaseMs,
      ).toISOString(),
      claimGeneration: (current?.claimGeneration ?? 0) + 1,
      principalKey: input.principalKey,
    },
  }
}

/**
 * Commit fence half for schedule takeover (ADR-0024 §4).
 * Undefined expected generation = not a scheduled claim; do not reject.
 */
export function scheduleCommitFenceRejects(
  expectedClaimGeneration: number | undefined,
  lease: ScheduleLeaseRecord | undefined,
  executionKey?: string,
): boolean {
  if (expectedClaimGeneration === undefined) return false
  if (!lease) return true
  if (lease.claimGeneration !== expectedClaimGeneration) return true
  return Boolean(executionKey && lease.executionKey !== executionKey)
}
