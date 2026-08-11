import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createToolIdentityRegistry } from './tool-identity.js'

describe('ToolIdentityRegistry', () => {
  it('preserves a valid unique provider tool name', () => {
    const registry = createToolIdentityRegistry()
    const registered = registry.register({
      pluginId: 'provider.docs',
      channel: 'mcp',
      channelId: 'docs',
      originalName: 'read_document',
    })

    assert.equal(registered.publicName, 'read_document')
    assert.deepEqual(registry.resolve('read_document')?.canonical, {
      pluginId: 'provider.docs',
      channel: 'mcp',
      channelId: 'docs',
      originalName: 'read_document',
    })
  })

  it('normalizes an invalid model name while retaining original identity', () => {
    const registry = createToolIdentityRegistry()
    const registered = registry.register({
      pluginId: 'provider.docs',
      channel: 'mcp',
      channelId: 'docs',
      originalName: 'docs.read-item',
    })

    assert.equal(registered.publicName, 'docs_read-item')
    assert.equal(
      registry.resolve('docs_read-item')?.canonical.originalName,
      'docs.read-item',
    )
  })

  it('uses a reversible channel namespace when provider names collide', () => {
    const registry = createToolIdentityRegistry()
    const first = registry.register({
      pluginId: 'provider.docs',
      channel: 'mcp',
      channelId: 'docs',
      originalName: 'search',
    })
    const second = registry.register({
      pluginId: 'provider.calendar',
      channel: 'mcp',
      channelId: 'calendar',
      originalName: 'search',
    })

    assert.equal(first.publicName, 'search')
    assert.equal(second.publicName, 'calendar__search')
    assert.equal(
      registry.resolve(second.publicName)?.canonical.pluginId,
      'provider.calendar',
    )
    assert.equal(
      registry.resolve(second.publicName)?.canonical.originalName,
      'search',
    )
  })
})
