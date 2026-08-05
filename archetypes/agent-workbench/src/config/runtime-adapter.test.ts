import { describe, expect, it } from 'vitest'
import {
  resolveRuntimeAdapterMode,
  resolveVoltAgentBaseUrl,
  resolveVoltAgentId,
} from './runtime-adapter'

describe('runtime-adapter config', () => {
  it('defaults to fake', () => {
    expect(resolveRuntimeAdapterMode({})).toBe('fake')
    expect(resolveRuntimeAdapterMode({ VITE_RUNTIME_ADAPTER: '' })).toBe('fake')
  })

  it('selects voltagent when configured', () => {
    expect(resolveRuntimeAdapterMode({ VITE_RUNTIME_ADAPTER: 'voltagent' })).toBe(
      'voltagent',
    )
    expect(resolveRuntimeAdapterMode({ VITE_RUNTIME_ADAPTER: 'Volt' })).toBe('voltagent')
  })

  it('resolves base url without trailing slash', () => {
    expect(resolveVoltAgentBaseUrl({})).toBe('/voltagent-runtime')
    expect(
      resolveVoltAgentBaseUrl({ VITE_VOLTAGENT_BASE_URL: 'http://localhost:4000/' }),
    ).toBe('http://localhost:4000')
  })

  it('resolves agent id', () => {
    expect(resolveVoltAgentId({})).toBe('workbench')
    expect(resolveVoltAgentId({ VITE_VOLTAGENT_AGENT_ID: 'assistant' })).toBe('assistant')
  })
})
