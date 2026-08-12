/**
 * Keychain account encoders — pure leaf module with zero dependencies.
 *
 * Extracted from secret-store.ts to break the circular dependency:
 * credential-resolver.ts needed isHostOwnedKeychainAccount from secret-store.ts,
 * while secret-store.ts façade re-exported resolveCredentialMaterial from
 * credential-resolver.ts. Moving these pure functions to a leaf file lets
 * credential-resolver import from here without creating a cycle.
 *
 * Format: length-prefixed segments so pluginId/resourceId containing `:`
 * cannot collide (e.g. a + b:c vs a:b + c).
 */

/**
 * Length-prefixed segment so pluginId/resourceId containing `:` cannot collide.
 */
export function encodeAuthScopeSegment(value: string): string {
  const s = String(value ?? '')
  return `${s.length}.${s}`
}

/**
 * Host-owned Keychain account for operator-stored plugin secrets.
 * Local plugin.json must never invent arbitrary accounts (cross-plugin theft).
 * Format: uilab:v1:{len.pluginId}:{len.resourceId}:{role}
 */
export function pluginAuthKeychainAccount(
  pluginId: string,
  resourceId: string,
  role: 'env' | 'access' = 'env',
): string {
  return `uilab:v1:${encodeAuthScopeSegment(pluginId)}:${encodeAuthScopeSegment(resourceId)}:${role}`
}

/**
 * OAuth Keychain accounts (same unambiguous encoding).
 * Format: oauth:v1:{len.pluginId}:{len.resourceId}:{access|refresh}
 */
export function oauthKeychainAccount(
  pluginId: string,
  resourceId: string,
  role: 'access' | 'refresh',
): string {
  return `oauth:v1:${encodeAuthScopeSegment(pluginId)}:${encodeAuthScopeSegment(resourceId)}:${role}`
}

/**
 * True when account is exactly the host-owned account for this plugin resource.
 * Exact match only — no prefix checks (prevents encoding collisions).
 */
export function isHostOwnedKeychainAccount(
  pluginId: string,
  resourceId: string,
  account: string,
): boolean {
  if (!account || !pluginId || !resourceId) return false
  return (
    account === pluginAuthKeychainAccount(pluginId, resourceId, 'env') ||
    account === pluginAuthKeychainAccount(pluginId, resourceId, 'access') ||
    account === oauthKeychainAccount(pluginId, resourceId, 'access') ||
    account === oauthKeychainAccount(pluginId, resourceId, 'refresh')
  )
}
