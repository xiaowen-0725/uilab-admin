/**
 * In-memory Product Identity — test double and seam for derived-app adapters.
 * Sign-out, sign-in, and authorization snapshot changes increment generation
 * and notify subscribers (ADR-0025).
 */

import type {
  AuthorizedResource,
  IdentityAuthorization,
  IdentityInvalidationEvent,
  IdentityInvalidationReason,
  IdentityScopePort,
  IdentityScopeSnapshot,
  IdentityScopeUnsubscribe,
} from '@/modules/board'

export interface MemoryIdentitySeed {
  principalKey: string
  tenantId?: string | null
  resources?: readonly AuthorizedResource[]
  generation?: number
}

export interface MemoryIdentityScope extends IdentityScopePort {
  getTenantId(): string | null
  signIn(input: {
    principalKey: string
    tenantId?: string | null
    resources?: readonly AuthorizedResource[]
  }): void
  signOut(): void
  setAuthorizedResources(resources: readonly AuthorizedResource[]): void
}

function cloneResources(
  resources: readonly AuthorizedResource[],
): AuthorizedResource[] {
  return resources.map((item) => ({
    type: item.type,
    id: item.id,
    name: item.name,
    permissions: [...item.permissions],
  }))
}

function restricted(
  resources: readonly AuthorizedResource[],
): IdentityAuthorization {
  return { kind: 'resources', resources: cloneResources(resources) }
}

function freezeSnapshot(snapshot: IdentityScopeSnapshot): IdentityScopeSnapshot {
  return {
    principalKey: snapshot.principalKey,
    generation: snapshot.generation,
    valid: snapshot.valid,
    authorization:
      snapshot.authorization.kind === 'unrestricted'
        ? { kind: 'unrestricted' }
        : restricted(snapshot.authorization.resources),
  }
}

export function createMemoryIdentityScope(
  seed: MemoryIdentitySeed,
): MemoryIdentityScope {
  let tenantId = seed.tenantId ?? null
  let snapshot: IdentityScopeSnapshot = {
    principalKey: seed.principalKey,
    generation: seed.generation ?? 0,
    valid: true,
    authorization: restricted(seed.resources ?? []),
  }
  const listeners = new Set<(event: IdentityInvalidationEvent) => void>()

  function commit(
    reason: IdentityInvalidationReason,
    next: Omit<IdentityScopeSnapshot, 'generation'>,
  ): void {
    snapshot = freezeSnapshot({
      ...next,
      generation: snapshot.generation + 1,
    })
    const event: IdentityInvalidationEvent = {
      reason,
      snapshot: freezeSnapshot(snapshot),
    }
    for (const listener of [...listeners]) listener(event)
  }

  return {
    getSnapshot() {
      return freezeSnapshot(snapshot)
    },
    subscribeInvalidation(listener): IdentityScopeUnsubscribe {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getTenantId() {
      return tenantId
    },
    signIn(input) {
      tenantId = input.tenantId ?? null
      commit('signed_in', {
        principalKey: input.principalKey,
        valid: true,
        authorization: restricted(input.resources ?? []),
      })
    },
    signOut() {
      if (!snapshot.valid) return
      tenantId = null
      commit('signed_out', {
        principalKey: snapshot.principalKey,
        valid: false,
        authorization: restricted([]),
      })
    },
    setAuthorizedResources(resources) {
      if (!snapshot.valid) return
      commit('authorization_changed', {
        principalKey: snapshot.principalKey,
        valid: true,
        authorization: restricted(resources),
      })
    },
  }
}
