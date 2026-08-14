import { describe, expect, it } from 'vitest'
import { createDefaultProject, isSpecifiedWorkProject } from './types'

describe('isSpecifiedWorkProject', () => {
  it('accepts opened or created roots', () => {
    expect(
      isSpecifiedWorkProject({
        localRoot: '/tmp/alpha',
        rootSource: 'opened',
      }),
    ).toBe(true)
    expect(
      isSpecifiedWorkProject({
        localRoot: '/tmp/beta',
        rootSource: 'created',
      }),
    ).toBe(true)
  })

  it('rejects auto roots, missing roots, and the Web fixture', () => {
    expect(
      isSpecifiedWorkProject({
        localRoot: '/tmp/auto',
        rootSource: 'auto',
      }),
    ).toBe(false)
    expect(
      isSpecifiedWorkProject({
        localRoot: null,
        rootSource: 'created',
      }),
    ).toBe(false)
    expect(isSpecifiedWorkProject(createDefaultProject())).toBe(false)
  })
})
