import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CONNECTOR_FEISHU_DESCRIPTOR } from './builtins.js'
import {
  isConnectorEffective,
  resolveEffectiveConnectors,
  resolveEffectiveSkills,
} from './effective-capabilities.js'

describe('isConnectorEffective', () => {
  const base = {
    connectorId: 'connector.feishu',
    pluginGloballyEnabled: true,
    authStatus: 'connected' as const,
    taskSelected: true,
  }

  it('tools enter only when enabled ∧ connected ∧ taskSelected', () => {
    const d = isConnectorEffective(base)
    assert.equal(d.capabilityEntersNextTurn, true)
    assert.equal(d.chipVisible, true)
    assert.deepEqual(d.reasons, [])
  })

  it('globally enabled but not task-selected → tools absent (not demoted)', () => {
    const d = isConnectorEffective({ ...base, taskSelected: false })
    assert.equal(d.capabilityEntersNextTurn, false)
    assert.equal(d.chipVisible, false)
    assert.ok(d.reasons.includes('not_task_selected'))
  })

  it('task-selected but not connected → chip may stay; tools absent', () => {
    const d = isConnectorEffective({
      ...base,
      authStatus: 'missing',
    })
    assert.equal(d.capabilityEntersNextTurn, false)
    assert.equal(d.chipVisible, true)
    assert.ok(d.reasons.includes('not_connected'))
  })

  it('plugin disabled → tools absent', () => {
    const d = isConnectorEffective({
      ...base,
      pluginGloballyEnabled: false,
    })
    assert.equal(d.capabilityEntersNextTurn, false)
    assert.ok(d.reasons.includes('plugin_not_enabled'))
  })

  it('taskMuted → tools absent even if selected+connected', () => {
    const d = isConnectorEffective({ ...base, taskMuted: true })
    assert.equal(d.capabilityEntersNextTurn, false)
    assert.equal(d.chipVisible, true)
    assert.ok(d.reasons.includes('task_muted'))
  })

  it('auth expired / error still blocks tools', () => {
    for (const authStatus of ['expired', 'error'] as const) {
      const d = isConnectorEffective({ ...base, authStatus })
      assert.equal(d.capabilityEntersNextTurn, false)
      assert.ok(d.reasons.some((r) => r.startsWith('auth_')))
    }
  })
})

describe('resolveEffectiveConnectors', () => {
  it('projects Feishu native command scopes without wrapped tools', () => {
    const result = resolveEffectiveConnectors({
      connectors: [
        {
          connectorId: 'connector.feishu',
          pluginGloballyEnabled: true,
          authStatus: 'connected',
          taskSelected: true,
        },
        {
          connectorId: 'connector.other',
          pluginGloballyEnabled: true,
          authStatus: 'connected',
          taskSelected: false,
        },
      ],
      descriptors: [CONNECTOR_FEISHU_DESCRIPTOR],
      packagedToolNames: ['mcp.docs.read'],
    })
    assert.deepEqual(result.effectiveConnectorIds, ['connector.feishu'])
    assert.deepEqual(result.effectiveToolNames, [])
    assert.deepEqual(result.effectiveCommandScopes, ['lark-cli'])
  })

  it('deselect Feishu → empty effective tools even if packaged', () => {
    const result = resolveEffectiveConnectors({
      connectors: [
        {
          connectorId: 'connector.feishu',
          pluginGloballyEnabled: true,
          authStatus: 'connected',
          taskSelected: false,
        },
      ],
      descriptors: [CONNECTOR_FEISHU_DESCRIPTOR],
      packagedToolNames: [],
    })
    assert.deepEqual(result.effectiveConnectorIds, [])
    assert.deepEqual(result.effectiveToolNames, [])
    assert.deepEqual(result.effectiveCommandScopes, [])
  })
})

describe('resolveEffectiveSkills', () => {
  it('unions expert defaults with task selection, intersects discoverable roots', () => {
    const skills = resolveEffectiveSkills({
      expertDefaultSkills: ['meeting-notes', 'ghost-skill'],
      taskSelectedSkills: ['planning-and-task-breakdown'],
      discoverableSkillRoots: [
        'meeting-notes',
        'planning-and-task-breakdown',
        'weekly-report',
      ],
    })
    assert.deepEqual(skills, [
      'meeting-notes',
      'planning-and-task-breakdown',
    ])
  })
})
