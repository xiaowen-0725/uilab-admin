import { describe, expect, it } from 'vitest'
import {
  isLeaseHeld,
  omitPrincipalLeases,
  parseScheduleLeases,
  resolveScheduleClaim,
  scheduleCommitFenceRejects,
  snapshotWriteRejected,
  type ClaimScheduleLeaseInput,
  type ScheduleLeaseRecord,
} from './schedule-lease'

const NOW = '2026-08-19T08:00:00.000Z'
const LATER = '2026-08-19T08:00:02.000Z'

function input(
  overrides: Partial<ClaimScheduleLeaseInput> = {},
): ClaimScheduleLeaseInput {
  return {
    sourceId: 'source:w1',
    instanceId: 'tab-a',
    executionKey: 'exec_a',
    leaseMs: 1000,
    nowIso: NOW,
    principalKey: 'anonymous',
    ...overrides,
  }
}

function lease(
  overrides: Partial<ScheduleLeaseRecord> = {},
): ScheduleLeaseRecord {
  return {
    sourceId: 'source:w1',
    instanceId: 'tab-a',
    executionKey: 'exec_a',
    leasedUntil: '2026-08-19T08:00:01.000Z',
    claimGeneration: 1,
    principalKey: 'anonymous',
    ...overrides,
  }
}

describe('resolveScheduleClaim', () => {
  it('lets the first instance take an empty lease', () => {
    expect(resolveScheduleClaim(undefined, input())).toEqual({
      ok: true,
      lease: {
        sourceId: 'source:w1',
        instanceId: 'tab-a',
        executionKey: 'exec_a',
        leasedUntil: '2026-08-19T08:00:01.000Z',
        claimGeneration: 1,
        principalKey: 'anonymous',
      },
    })
  })

  it('rejects a second instance while the lease is still held', () => {
    const held = lease()
    expect(resolveScheduleClaim(held, input({ instanceId: 'tab-b', executionKey: 'exec_b' }))).toEqual({
      ok: false,
      reason: 'held',
      lease: held,
    })
  })

  it('lets another instance take over after the lease expires', () => {
    const expired = lease({ leasedUntil: '2026-08-19T08:00:01.000Z' })
    expect(
      resolveScheduleClaim(
        expired,
        input({ instanceId: 'tab-b', executionKey: 'exec_b', nowIso: LATER }),
      ),
    ).toEqual({
      ok: true,
      lease: {
        sourceId: 'source:w1',
        instanceId: 'tab-b',
        executionKey: 'exec_b',
        leasedUntil: '2026-08-19T08:00:03.000Z',
        claimGeneration: 2,
        principalKey: 'anonymous',
      },
    })
  })
})

describe('isLeaseHeld', () => {
  it('treats a missing or expired lease as free', () => {
    expect(isLeaseHeld(undefined, NOW)).toBe(false)
    expect(isLeaseHeld(lease({ leasedUntil: NOW }), NOW)).toBe(false)
    expect(isLeaseHeld(lease(), NOW)).toBe(true)
  })
})

describe('scheduleCommitFenceRejects', () => {
  it('does not reject a manual commit that captured no claim generation', () => {
    expect(scheduleCommitFenceRejects(undefined, lease())).toBe(false)
  })

  it('rejects a late result after another instance took over the lease', () => {
    const taken = lease({
      instanceId: 'tab-b',
      executionKey: 'exec_b',
      claimGeneration: 2,
    })
    expect(scheduleCommitFenceRejects(1, taken, 'exec_a')).toBe(true)
    expect(scheduleCommitFenceRejects(2, taken, 'exec_b')).toBe(false)
  })
})

describe('parseScheduleLeases', () => {
  it('drops malformed rows', () => {
    expect(parseScheduleLeases({ bad: 1, ok: lease() })).toEqual({
      ok: lease(),
    })
  })
})

describe('omitPrincipalLeases', () => {
  it('returns null when no lease belongs to the principal', () => {
    const leases = { a: lease() }
    expect(omitPrincipalLeases(leases, 'alice')).toBeNull()
  })

  it('drops only the matching principal', () => {
    const leases = {
      a: lease({ principalKey: 'alice' }),
      b: lease({ sourceId: 'source:w2', principalKey: 'bob' }),
    }
    expect(omitPrincipalLeases(leases, 'alice')).toEqual({
      b: lease({ sourceId: 'source:w2', principalKey: 'bob' }),
    })
  })
})

describe('snapshotWriteRejected', () => {
  it('rejects when either fence fires', () => {
    expect(
      snapshotWriteRejected({ expectedGeneration: 1 }, 2, {}, undefined),
    ).toBe(true)
    expect(
      snapshotWriteRejected(
        { expectedClaimGeneration: 1, executionKey: 'exec_a' },
        undefined,
        { exec_a: 'anonymous' },
        lease({ claimGeneration: 2 }),
      ),
    ).toBe(true)
    expect(
      snapshotWriteRejected(
        { expectedGeneration: 1, expectedClaimGeneration: 1, executionKey: 'exec_a' },
        1,
        { exec_a: 'anonymous' },
        lease(),
      ),
    ).toBe(false)
  })
})
