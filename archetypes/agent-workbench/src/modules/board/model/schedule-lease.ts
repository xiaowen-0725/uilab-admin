/**
 * IDB schedule lease — exclusive claim for a due Widget Data Source.
 * ADR-0024 §4: no daemon; expired leases are stealable.
 */

import {
  commitFenceRejects,
  type LiveExecutionMap,
} from './identity-barrier'

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function parseScheduleLease(
  value: unknown,
): ScheduleLeaseRecord | undefined {
  if (!isPlainObject(value)) return undefined
  const sourceId = asString(value.sourceId)
  const instanceId = asString(value.instanceId)
  const executionKey = asString(value.executionKey)
  const leasedUntil = asString(value.leasedUntil)
  const principalKey = asString(value.principalKey)
  const claimGeneration = asFiniteNumber(value.claimGeneration)
  if (
    sourceId === undefined ||
    instanceId === undefined ||
    executionKey === undefined ||
    leasedUntil === undefined ||
    principalKey === undefined ||
    claimGeneration === undefined
  ) {
    return undefined
  }
  return {
    sourceId,
    instanceId,
    executionKey,
    leasedUntil,
    claimGeneration,
    principalKey,
  }
}

export function parseScheduleLeases(
  value: unknown,
): Record<string, ScheduleLeaseRecord> {
  if (!isPlainObject(value)) return {}
  const next: Record<string, ScheduleLeaseRecord> = {}
  for (const [key, raw] of Object.entries(value)) {
    const lease = parseScheduleLease(raw)
    if (lease) next[key] = lease
  }
  return next
}

/** Drops leases for one principal. Returns null when the map is unchanged. */
export function omitPrincipalLeases(
  leases: Record<string, ScheduleLeaseRecord>,
  principalKey: string,
): Record<string, ScheduleLeaseRecord> | null {
  const next: Record<string, ScheduleLeaseRecord> = {}
  let changed = false
  for (const [id, lease] of Object.entries(leases)) {
    if (lease.principalKey === principalKey) {
      changed = true
      continue
    }
    next[id] = lease
  }
  return changed ? next : null
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

interface SnapshotWriteFence {
  expectedGeneration?: number
  executionKey?: string
  expectedClaimGeneration?: number
}

export function snapshotWriteRejected(
  options: SnapshotWriteFence | undefined,
  storedEpoch: number | undefined,
  liveExecutions: LiveExecutionMap,
  lease: ScheduleLeaseRecord | undefined,
): boolean {
  return (
    commitFenceRejects(
      options?.expectedGeneration,
      storedEpoch,
      options?.executionKey,
      liveExecutions,
    ) ||
    scheduleCommitFenceRejects(
      options?.expectedClaimGeneration,
      lease,
      options?.executionKey,
    )
  )
}
