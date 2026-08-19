/**
 * Identity Module — public Interface.
 *
 * Owns: Product Identity (current principal, tenant, authorized-resource
 * snapshot, invalidation). Board consumes it through IdentityScopePort
 * (owned by modules/board). Template default is the no-identity adapter.
 *
 * Does not own: Connector auth, Board snapshots, vertical login UI.
 */

export { createAnonymousIdentityScope } from './adapters/anonymous-identity-scope'
export {
  createMemoryIdentityScope,
  type MemoryIdentityScope,
  type MemoryIdentitySeed,
  type MemoryIdentitySession,
} from './adapters/memory-identity-scope'
