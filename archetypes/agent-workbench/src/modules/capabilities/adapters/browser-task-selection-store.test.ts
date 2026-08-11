import { describe, expect, it } from 'vitest'
import { createBrowserTaskCapabilitySelectionStore } from './browser-task-selection-store'

describe('createBrowserTaskCapabilitySelectionStore', () => {
  it('round-trips separate Task selections without credential material', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const first = createBrowserTaskCapabilitySelectionStore({ storage })
    first.set('task-a', {
      connectorIds: ['connector.feishu'],
      skillIds: [],
      expertId: null,
    })
    first.set('task-b', {
      connectorIds: [],
      skillIds: ['meeting-notes'],
      expertId: 'expert.office-meeting',
    })

    const reloaded = createBrowserTaskCapabilitySelectionStore({ storage })
    expect(reloaded.get('task-a')).toEqual({
      connectorIds: ['connector.feishu'],
      skillIds: [],
      expertId: null,
    })
    expect(reloaded.get('task-b')).toEqual({
      connectorIds: [],
      skillIds: ['meeting-notes'],
      expertId: 'expert.office-meeting',
    })
    expect([...values.values()].join()).not.toMatch(/token|secret|credential/i)
  })

  it('fails closed to no persisted selection for malformed storage', () => {
    const storage = {
      getItem: () => '{broken',
      setItem: () => {},
    }
    const store = createBrowserTaskCapabilitySelectionStore({ storage })
    expect(store.get('task-a')).toBeNull()
  })
})
