import { describe, expect, it, vi } from 'vitest'
import {
  ANONYMOUS_IDENTITY_GENERATION,
  ANONYMOUS_PRINCIPAL_KEY,
} from '@/modules/board'
import { createAnonymousIdentityScope } from '@/modules/identity'

describe('createAnonymousIdentityScope', () => {
  it('is a stable unrestricted anonymous principal', () => {
    const scope = createAnonymousIdentityScope()
    expect(scope.getSnapshot()).toEqual({
      principalKey: ANONYMOUS_PRINCIPAL_KEY,
      generation: ANONYMOUS_IDENTITY_GENERATION,
      valid: true,
      authorization: { kind: 'unrestricted' },
    })
  })

  it('never invalidates and keeps generation constant', () => {
    const scope = createAnonymousIdentityScope()
    const listener = vi.fn()
    const unsubscribe = scope.subscribeInvalidation(listener)

    expect(scope.getSnapshot().generation).toBe(ANONYMOUS_IDENTITY_GENERATION)
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
    expect(scope.getSnapshot().generation).toBe(ANONYMOUS_IDENTITY_GENERATION)
  })
})
