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

export interface MemoryIdentitySession {
  principalKey: string
  tenantId?: string | null
  resources?: readonly AuthorizedResource[]
}

export interface MemoryIdentitySeed extends MemoryIdentitySession {
  generation?: number
}

export interface MemoryIdentityScope extends IdentityScopePort {
  getTenantId(): string | null
  signIn(input: MemoryIdentitySession): void
  signOut(): void
  setAuthorizedResources(resources: readonly AuthorizedResource[]): void
}

function cloneResources(
  resources: readonly AuthorizedResource[],
): AuthorizedResource[] {
  return resources.map((resource) => ({
    type: resource.type,
    id: resource.id,
    name: resource.name,
    permissions: [...resource.permissions],
  }))
}

function restricted(
  resources: readonly AuthorizedResource[],
): IdentityAuthorization {
  return { kind: 'resources', resources: cloneResources(resources) }
}

export function createMemoryIdentityScope(
  seed: MemoryIdentitySeed,
): MemoryIdentityScope {
  let principalKey = seed.principalKey
  let tenantId = seed.tenantId ?? null
  let generation = seed.generation ?? 0
  let valid = true
  let resources = cloneResources(seed.resources ?? [])
  const listeners = new Set<(event: IdentityInvalidationEvent) => void>()

  function getSnapshot(): IdentityScopeSnapshot {
    return {
      principalKey,
      generation,
      valid,
      authorization: restricted(resources),
    }
  }

  function notify(reason: IdentityInvalidationReason): void {
    generation += 1
    const event: IdentityInvalidationEvent = {
      reason,
      snapshot: getSnapshot(),
    }
    for (const listener of [...listeners]) listener(event)
  }

  return {
    getSnapshot,
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
      principalKey = input.principalKey
      valid = true
      resources = cloneResources(input.resources ?? [])
      notify('signed_in')
    },
    signOut() {
      if (!valid) return
      tenantId = null
      valid = false
      resources = []
      notify('signed_out')
    },
    setAuthorizedResources(nextResources) {
      if (!valid) return
      resources = cloneResources(nextResources)
      notify('authorization_changed')
    },
  }
}
