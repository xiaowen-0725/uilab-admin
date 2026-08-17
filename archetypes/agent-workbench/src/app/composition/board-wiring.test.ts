import { describe, expect, it } from 'vitest'
import { createMemoryBoardStore } from '@/modules/board'
import { createBoardCapabilityApi } from './board-wiring'

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
