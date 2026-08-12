/**
 * AuthBindingStore — in-memory binding table + revoke state machine.
 *
 * Carved from secret-store.ts for locality: auth-binding concerns (upsert,
 * revoke, reauthorize, snapshot) have zero dependency on secret backends or
 * credential resolution. Only depends on ./types.js for AuthBinding shape.
 */

import type { AuthBinding } from './types.js'

/** In-memory binding table for tests / ephemeral host state (no secrets). */
export type AuthBindingStore = {
  list(): AuthBinding[]
  get(pluginId: string, resourceId: string): AuthBinding | undefined
  upsert(binding: AuthBinding): void
  /**
   * Atomic refresh commit: upsert only if resource is not currently revoked.
   * Returns false when revoked (logout wins over in-flight OAuth refresh).
   * Explicit login should use upsert() which re-authorizes.
   */
  upsertIfNotRevoked(binding: AuthBinding): boolean
  /**
   * Remove override and mark resource revoked (#28).
   * After clear, status/inject ignore process-env leftovers until upsert again.
   */
  clear(pluginId: string, resourceId?: string): void
  /** True after clear until a new upsert for that resource (or plugin-wide clear). */
  isRevoked(pluginId: string, resourceId: string): boolean
  /** Revoke keys for persistence (#29) */
  listRevoked(): string[]
}

export type CreateAuthBindingStoreOptions = {
  /** Restored revoke keys (`pluginId::resourceId` or `pluginId::*`) */
  revoked?: string[]
  /**
   * Resources re-authorized after a plugin-wide revoke (`pluginId::resourceId`).
   * One resource login must not re-enable siblings (adversarial P1).
   */
  reauthorized?: string[]
}

/** Split persisted revoke list into revoked + reauthorized markers (`!plugin::res`). */
export function splitRevokedSnapshot(revokedList: string[]): {
  revoked: string[]
  reauthorized: string[]
} {
  const revoked: string[] = []
  const reauthorized: string[] = []
  for (const k of revokedList) {
    if (k.startsWith('!')) reauthorized.push(k.slice(1))
    else revoked.push(k)
  }
  return { revoked, reauthorized }
}

export function createAuthBindingStore(
  initial: AuthBinding[] = [],
  options: CreateAuthBindingStoreOptions = {},
): AuthBindingStore {
  const map = new Map<string, AuthBinding>()
  /** Keys: `pluginId::resourceId` or `pluginId::*` for plugin-wide revoke */
  const revoked = new Set<string>(options.revoked ?? [])
  /** Explicit re-login after plugin-wide revoke */
  const reauthorized = new Set<string>(options.reauthorized ?? [])
  const keyOf = (p: string, r: string) => `${p}::${r}`
  for (const b of initial) map.set(keyOf(b.pluginId, b.resourceId), b)
  const isRevoked = (pluginId: string, resourceId: string) => {
    const k = keyOf(pluginId, resourceId)
    if (revoked.has(k)) return true
    if (revoked.has(`${pluginId}::*`) && !reauthorized.has(k)) return true
    return false
  }

  return {
    list: () => [...map.values()],
    get: (pluginId, resourceId) => map.get(keyOf(pluginId, resourceId)),
    upsert: (binding) => {
      const k = keyOf(binding.pluginId, binding.resourceId)
      map.set(k, binding)
      // Clear only this resource's revoke; never drop plugin-wide wildcard
      revoked.delete(k)
      reauthorized.add(k)
    },
    upsertIfNotRevoked: (binding) => {
      // Refresh must not clear revoke markers (logout wins concurrent races).
      if (isRevoked(binding.pluginId, binding.resourceId)) return false
      map.set(keyOf(binding.pluginId, binding.resourceId), binding)
      return true
    },
    clear: (pluginId, resourceId) => {
      if (resourceId) {
        const k = keyOf(pluginId, resourceId)
        map.delete(k)
        revoked.add(k)
        reauthorized.delete(k)
        return
      }
      for (const k of [...map.keys()]) {
        if (k.startsWith(`${pluginId}::`)) {
          map.delete(k)
          revoked.add(k)
          reauthorized.delete(k)
        }
      }
      // Wildcard: future/unknown resources stay revoked until each is re-upserted
      revoked.add(`${pluginId}::*`)
    },
    isRevoked,

    listRevoked: () => {
      // Persist wildcard + per-resource + reauth markers as revoked list;
      // reauthorized entries are encoded as `!pluginId::resourceId` for restore.
      const out = [...revoked]
      for (const k of reauthorized) out.push(`!${k}`)
      return out
    },
  }
}

/** Snapshot of non-secret binding state for persistence (#29). */
export type AuthBindingStoreSnapshot = {
  schemaVersion: 1
  bindings: AuthBinding[]
  revoked: string[]
}

/** Export store for disk (never includes secret values). */
export function snapshotAuthBindingStore(
  store: AuthBindingStore,
): AuthBindingStoreSnapshot {
  return {
    schemaVersion: 1,
    bindings: store.list().map(sanitizeBindingForPersist),
    revoked: store.listRevoked(),
  }
}

function sanitizeBindingForPersist(b: AuthBinding): AuthBinding {
  // Drop any accidental secret-shaped fields; only keep non-secret refs
  return {
    pluginId: b.pluginId,
    resourceId: b.resourceId,
    kind: b.kind,
    envNames: b.envNames ? [...b.envNames] : undefined,
    secretRef: b.secretRef ? { ...b.secretRef } : undefined,
    loginHint: b.loginHint,
    expiresAt: b.expiresAt,
    oauth: b.oauth
      ? {
          tokenEndpoint: b.oauth.tokenEndpoint,
          clientId: b.oauth.clientId,
          refreshAccount: b.oauth.refreshAccount,
          clientSecretRef: b.oauth.clientSecretRef
            ? { ...b.oauth.clientSecretRef }
            : undefined,
          authorizationEndpoint: b.oauth.authorizationEndpoint,
          redirectUri: b.oauth.redirectUri,
          scopes: b.oauth.scopes ? [...b.oauth.scopes] : undefined,
        }
      : undefined,
    statusCommand: b.statusCommand
      ? {
          command: b.statusCommand.command,
          argv: b.statusCommand.argv ? [...b.statusCommand.argv] : undefined,
        }
      : undefined,
  }
}
