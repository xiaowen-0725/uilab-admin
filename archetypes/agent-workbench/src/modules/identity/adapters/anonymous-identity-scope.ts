/**
 * No-identity default — template path, example boards, public jobs (ADR-0024 §3).
 * principalKey is always anonymous, authorization is unrestricted, generation
 * is constant, and invalidation never fires.
 */

import type {
  IdentityScopePort,
  IdentityScopeSnapshot,
  IdentityScopeUnsubscribe,
} from '@/modules/board'

const ANONYMOUS_SNAPSHOT: IdentityScopeSnapshot = {
  principalKey: 'anonymous',
  generation: 0,
  valid: true,
  authorization: { kind: 'unrestricted' },
}

export function createAnonymousIdentityScope(): IdentityScopePort {
  return {
    getSnapshot() {
      return {
        principalKey: ANONYMOUS_SNAPSHOT.principalKey,
        generation: ANONYMOUS_SNAPSHOT.generation,
        valid: ANONYMOUS_SNAPSHOT.valid,
        authorization: { kind: 'unrestricted' },
      }
    },
    subscribeInvalidation(): IdentityScopeUnsubscribe {
      return () => {}
    },
  }
}
