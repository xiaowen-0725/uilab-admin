/**
 * IdentityScopePort — Board's narrow view of Product Identity (ADR-0024 §3).
 *
 * Port follows the consumer. `modules/identity` supplies the adapter;
 * Composition Root wires it. Resource `type` is plugin-declared — this
 * file must stay free of vertical domain words.
 */

export interface AuthorizedResource {
  type: string
  id: string
  name: string
  permissions: string[]
}

/**
 * Unrestricted = no-identity default (every resource parameter passes).
 * Restricted + empty = signed-in principal with no authorized resources.
 */
export type IdentityAuthorization =
  | { readonly kind: 'unrestricted' }
  | { readonly kind: 'resources'; readonly resources: readonly AuthorizedResource[] }

export const UNRESTRICTED_AUTHORIZATION = {
  kind: 'unrestricted',
} as const satisfies IdentityAuthorization

/**
 * Monotonic identity generation / authorization revision (ADR-0025).
 * Sign-out, sign-in, and authorization snapshot changes all increment.
 * The no-identity default stays at this constant forever.
 */
export const ANONYMOUS_IDENTITY_GENERATION = 0

export interface IdentityScopeSnapshot {
  /** Current (or last-known) principal. No-identity default is `'anonymous'`. */
  readonly principalKey: string
  /** Monotonic generation captured at evaluate start and rechecked on commit. */
  readonly generation: number
  /** False after sign-out or session invalidation (gate ①). */
  readonly valid: boolean
  readonly authorization: IdentityAuthorization
}

export type IdentityInvalidationReason =
  | 'signed_out'
  | 'session_invalidated'
  | 'signed_in'
  | 'authorization_changed'

export interface IdentityInvalidationEvent {
  readonly reason: IdentityInvalidationReason
  readonly snapshot: IdentityScopeSnapshot
}

export type IdentityScopeUnsubscribe = () => void

export interface IdentityScopePort {
  getSnapshot(): IdentityScopeSnapshot
  subscribeInvalidation(
    listener: (event: IdentityInvalidationEvent) => void,
  ): IdentityScopeUnsubscribe
}
