import { describe, expect, it } from 'vitest'
import { isInstantDemo } from './test-env'

describe('isInstantDemo', () => {
  it('is true under Vitest so persistence and Board ports stay in-memory', () => {
    expect(isInstantDemo()).toBe(true)
  })
})
