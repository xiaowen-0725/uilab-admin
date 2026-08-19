import { describe, expect, it, vi } from 'vitest'
import { createMemoryIdentityScope } from '@/modules/identity'
import type { AuthorizedResource } from '@/modules/board'

const SITE_READ: AuthorizedResource = {
  type: 'site',
  id: 'site-1',
  name: 'North',
  permissions: ['read'],
}

const SITE_WRITE: AuthorizedResource = {
  type: 'site',
  id: 'site-1',
  name: 'North',
  permissions: ['read', 'write'],
}

describe('createMemoryIdentityScope', () => {
  it('increments generation and notifies on sign-out', () => {
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      tenantId: 'tenant-a',
      resources: [SITE_READ],
    })
    const listener = vi.fn()
    scope.subscribeInvalidation(listener)
    const before = scope.getSnapshot().generation

    scope.signOut()

    const snapshot = scope.getSnapshot()
    expect(snapshot.generation).toBe(before + 1)
    expect(snapshot.valid).toBe(false)
    expect(snapshot.principalKey).toBe('alice')
    expect(scope.getTenantId()).toBeNull()
    expect(snapshot.authorization).toEqual({ kind: 'resources', resources: [] })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      reason: 'signed_out',
      snapshot,
    })
  })

  it('increments generation and notifies on re-login', () => {
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    scope.signOut()
    const listener = vi.fn()
    scope.subscribeInvalidation(listener)
    const before = scope.getSnapshot().generation

    scope.signIn({ principalKey: 'alice', resources: [SITE_READ] })

    const snapshot = scope.getSnapshot()
    expect(snapshot.generation).toBe(before + 1)
    expect(snapshot.valid).toBe(true)
    expect(snapshot.principalKey).toBe('alice')
    expect(snapshot.authorization).toEqual({
      kind: 'resources',
      resources: [SITE_READ],
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      reason: 'signed_in',
      snapshot,
    })
  })

  it('increments generation and notifies when authorization changes', () => {
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const listener = vi.fn()
    scope.subscribeInvalidation(listener)
    const before = scope.getSnapshot().generation

    scope.setAuthorizedResources([SITE_WRITE])

    const snapshot = scope.getSnapshot()
    expect(snapshot.generation).toBe(before + 1)
    expect(snapshot.valid).toBe(true)
    expect(snapshot.authorization).toEqual({
      kind: 'resources',
      resources: [SITE_WRITE],
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      reason: 'authorization_changed',
      snapshot,
    })
  })

  it('marks the session invalid without clearing authorization', () => {
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      tenantId: 'tenant-a',
      resources: [SITE_READ],
    })
    const listener = vi.fn()
    scope.subscribeInvalidation(listener)
    const before = scope.getSnapshot().generation

    scope.invalidateSession()

    const snapshot = scope.getSnapshot()
    expect(snapshot.generation).toBe(before + 1)
    expect(snapshot.valid).toBe(false)
    expect(snapshot.principalKey).toBe('alice')
    expect(scope.getTenantId()).toBe('tenant-a')
    expect(snapshot.authorization).toEqual({
      kind: 'resources',
      resources: [SITE_READ],
    })
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      reason: 'session_invalidated',
      snapshot,
    })
  })

  it('still signs out after a passive invalidation so snapshots can be cleared', () => {
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      tenantId: 'tenant-a',
      resources: [SITE_READ],
    })
    const listener = vi.fn()
    scope.subscribeInvalidation(listener)
    scope.invalidateSession()
    listener.mockClear()

    scope.signOut()

    expect(scope.getSnapshot()).toMatchObject({
      valid: false,
      principalKey: 'alice',
      authorization: { kind: 'resources', resources: [] },
    })
    expect(listener.mock.calls[0]?.[0].reason).toBe('signed_out')
  })

  it('does not notify after unsubscribe, and sign-out is idempotent', () => {
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [SITE_READ],
    })
    const listener = vi.fn()
    const unsubscribe = scope.subscribeInvalidation(listener)
    scope.signOut()
    expect(listener).toHaveBeenCalledTimes(1)
    const generation = scope.getSnapshot().generation

    unsubscribe()
    scope.signOut()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(scope.getSnapshot().generation).toBe(generation)
  })
})
