import { describe, expect, it } from 'vitest'
import { commitFenceRejects, identityEpochMetadataKey } from './identity-barrier'

describe('commitFenceRejects', () => {
  it('lets the first commit through when no epoch has been stored', () => {
    expect(commitFenceRejects(3, undefined)).toBe(false)
    expect(commitFenceRejects(undefined, 3)).toBe(false)
  })

  it('rejects a captured generation that no longer matches the stored epoch', () => {
    expect(commitFenceRejects(3, 4)).toBe(true)
    expect(commitFenceRejects(4, 4)).toBe(false)
  })

  it('rejects a commit whose execution key is no longer live', () => {
    expect(commitFenceRejects(4, 4, 'exec_1', { exec_1: 'alice' })).toBe(false)
    expect(commitFenceRejects(4, 4, 'exec_1', {})).toBe(true)
  })
})

describe('identityEpochMetadataKey', () => {
  it('namespaces the epoch by principal', () => {
    expect(identityEpochMetadataKey('alice')).toBe('board.identity.epoch:alice')
  })
})
