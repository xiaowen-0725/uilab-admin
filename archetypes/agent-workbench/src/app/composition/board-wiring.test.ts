import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_IDENTITY_GENERATION,
  ANONYMOUS_PRINCIPAL_KEY,
  createMemoryBoardStore,
} from '@/modules/board'
import { createMemoryIdentityScope } from '@/modules/identity'
import { createBoardCapabilityApi, resolveIdentityScope } from './board-wiring'

describe('resolveIdentityScope', () => {
  it('defaults to the no-identity adapter', () => {
    const scope = resolveIdentityScope()
    expect(scope.getSnapshot()).toEqual({
      principalKey: ANONYMOUS_PRINCIPAL_KEY,
      generation: ANONYMOUS_IDENTITY_GENERATION,
      valid: true,
      authorization: { kind: 'unrestricted' },
    })
  })

  it('keeps an injected scope', () => {
    const injected = createMemoryIdentityScope({ principalKey: 'alice' })
    expect(resolveIdentityScope(injected)).toBe(injected)
  })
})

describe('createBoardCapabilityApi', () => {
  it('resolves no features until the Task is granted', async () => {
    const api = createBoardCapabilityApi(createMemoryBoardStore())
    expect(await api.resolveFeatureIds(null)).toEqual([])
    expect(await api.resolveFeatureIds('task-1')).toEqual([])
  })

  it('grants board before the Task is selected', async () => {
    const api = createBoardCapabilityApi(createMemoryBoardStore())
    await api.grantCapability('task-1')
    expect(await api.resolveFeatureIds('task-1')).toEqual(['board'])
    expect(await api.resolveFeatureIds('task-other')).toEqual([])
  })
})
