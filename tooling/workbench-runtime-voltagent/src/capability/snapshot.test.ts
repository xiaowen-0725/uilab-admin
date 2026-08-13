import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PluginAuthStatus } from '../plugin/auth-status.js'
import {
  BUILTIN_CONNECTOR_DESCRIPTORS,
  CONNECTOR_FEISHU_ID,
  CONNECTOR_GITHUB_ID,
} from '../plugin/builtins.js'
import { createCapabilitySelectionStore } from './selection-store.js'
import { buildCapabilitySnapshot } from './snapshot.js'
import {
  filterToolsForTaskSelection,
  gateConnectorToolInvoke,
} from './tool-gate.js'

const AUTH_CONNECTED: PluginAuthStatus = {
  pluginId: 'cli.feishu',
  resourceId: 'cli:feishu',
  kind: 'cli_session',
  pluginEnabled: true,
  status: 'connected',
}

const AUTH_MISSING: PluginAuthStatus = {
  ...AUTH_CONNECTED,
  status: 'missing',
  hint: '请先运行 lark-cli auth login',
}

const GITHUB_AUTH_CONNECTED: PluginAuthStatus = {
  pluginId: 'mcp.github',
  resourceId: 'mcp:github',
  kind: 'oauth2',
  pluginEnabled: true,
  status: 'connected',
}

describe('buildCapabilitySnapshot effective algorithm', () => {
  it('makes dynamically discovered GitHub MCP tools effective without CLI translation', () => {
    const snap = buildCapabilitySnapshot({
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      version: 1,
      taskId: 'task-github',
      selection: {
        connectorIds: [CONNECTOR_GITHUB_ID],
        skillIds: [],
        expertId: null,
      },
      authStatuses: [GITHUB_AUTH_CONNECTED],
      enabledPluginIds: ['mcp.github'],
      packagedToolNames: ['github__search_repositories', 'mcp.docs.read'],
    })

    const github = snap.connectors.find((c) => c.id === CONNECTOR_GITHUB_ID)
    assert.equal(github?.primaryChannel, 'mcp')
    assert.equal(github?.capabilityEffective, true)
    assert.deepEqual(github?.effectiveToolNames, [
      'github__search_repositories',
    ])
    assert.deepEqual(snap.effectiveToolNames, ['github__search_repositories'])
  })

  it('enabled + connected + taskSelected → native command scope effective', () => {
    const store = createCapabilitySelectionStore()
    store.set('task-1', {
      connectorIds: [CONNECTOR_FEISHU_ID],
      skillIds: [],
      expertId: 'expert.office-meeting',
    })
    const snap = buildCapabilitySnapshot({
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      version: 1,
      taskId: 'task-1',
      selectionStore: store,
      authStatuses: [AUTH_CONNECTED],
      enabledPluginIds: ['cli.feishu', 'skills.office'],
      packagedToolNames: [],
      discoverableSkillIds: ['meeting-notes'],
      nowIso: () => '2026-08-09T00:00:00.000Z',
    })
    const feishu = snap.connectors.find((c) => c.id === CONNECTOR_FEISHU_ID)
    assert.ok(feishu)
    assert.equal(feishu.enabled, true)
    assert.equal(feishu.connected, true)
    assert.equal(feishu.taskSelected, true)
    assert.equal(feishu.capabilityEffective, true)
    assert.deepEqual(feishu.commandScopes, ['lark-cli'])
    assert.deepEqual(feishu.effectiveCommandScopes, ['lark-cli'])
    assert.deepEqual(snap.effectiveToolNames, [])
    assert.deepEqual(snap.effectiveCommandScopes, ['lark-cli'])
    assert.equal(snap.honesty.authBoundary, 'provider_declared')
    assert.match(snap.honesty.note, /PluginManifest.*不进入 Renderer/)
    assert.match(snap.honesty.note, /凭据均不进入 Renderer/)
    assert.equal(
      snap.experts.find((e) => e.id === 'expert.office-meeting')?.taskSelected,
      true,
    )
  })

  it('selecting xhs-cover keeps catalog instruction on the snapshot for the next Turn', () => {
    const snap = buildCapabilitySnapshot({
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      version: 1,
      taskId: 'task-xhs',
      selection: {
        connectorIds: [],
        skillIds: [],
        expertId: 'expert.xhs-cover',
      },
      authStatuses: [],
      enabledPluginIds: [],
      packagedToolNames: [],
    })
    const expert = snap.experts.find((e) => e.id === 'expert.xhs-cover')
    assert.ok(expert)
    assert.equal(expert.taskSelected, true)
    assert.match(expert.instruction ?? '', /小红书封面专家/)
    assert.equal(
      snap.experts.find((e) => e.id === 'expert.office-meeting')?.taskSelected,
      false,
    )
  })

  it('globally enabled but not task selected → tools absent', () => {
    const snap = buildCapabilitySnapshot({
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      version: 2,
      taskId: 'task-2',
      selection: { connectorIds: [], skillIds: [], expertId: null },
      authStatuses: [AUTH_CONNECTED],
      enabledPluginIds: ['cli.feishu'],
      packagedToolNames: [],
    })
    const feishu = snap.connectors.find((c) => c.id === CONNECTOR_FEISHU_ID)!
    assert.equal(feishu.capabilityEffective, false)
    assert.ok(feishu.reasons.includes('not_task_selected'))
    assert.deepEqual(snap.effectiveToolNames, [])
    assert.deepEqual(snap.effectiveCommandScopes, [])
  })

  it('task selected but not connected → chip selected, tools absent', () => {
    const snap = buildCapabilitySnapshot({
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      version: 3,
      taskId: 'task-3',
      selection: {
        connectorIds: [CONNECTOR_FEISHU_ID],
        skillIds: [],
        expertId: null,
      },
      authStatuses: [AUTH_MISSING],
      enabledPluginIds: ['cli.feishu'],
      packagedToolNames: [],
    })
    const feishu = snap.connectors.find((c) => c.id === CONNECTOR_FEISHU_ID)!
    assert.equal(feishu.taskSelected, true)
    assert.equal(feishu.connected, false)
    assert.equal(feishu.capabilityEffective, false)
    assert.ok(feishu.reasons.includes('not_connected'))
  })
})

describe('gateConnectorToolInvoke', () => {
  it('removes unselected connector tools from the model-visible Turn tool set', () => {
    const tools = [
      { name: 'read_file' },
      { name: 'github__search_repositories' },
    ]
    assert.deepEqual(
      filterToolsForTaskSelection(
        tools,
        BUILTIN_CONNECTOR_DESCRIPTORS,
        [],
      ).map((tool) => tool.name),
      ['read_file'],
    )
    assert.deepEqual(
      filterToolsForTaskSelection(
        tools,
        BUILTIN_CONNECTOR_DESCRIPTORS,
        [CONNECTOR_GITHUB_ID],
      ).map((tool) => tool.name),
      ['read_file', 'github__search_repositories'],
    )
  })

  it('does not describe missing GitHub MCP bearer as a CLI session problem', () => {
    const store = createCapabilitySelectionStore()
    store.setActiveTaskId('github-task')
    store.set('github-task', {
      connectorIds: [CONNECTOR_GITHUB_ID],
      skillIds: [],
      expertId: null,
    })
    const gate = gateConnectorToolInvoke('github__search_repositories', {
      store,
      taskId: 'github-task',
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      authLookup: () => ({
        pluginGloballyEnabled: true,
        authStatus: 'missing',
      }),
    })

    assert.equal(gate.allowed, false)
    if (!gate.allowed) {
      assert.match(gate.hint, /未连接/)
      assert.doesNotMatch(gate.hint, /CLI session/)
    }
  })

  it('does not map removed Feishu wrapper names to a connector', () => {
    const store = createCapabilitySelectionStore()
    store.setActiveTaskId('t1')
    store.set('t1', { connectorIds: [], skillIds: [], expertId: null })
    const gate = gateConnectorToolInvoke('removed_provider_wrapper', {
      store,
      taskId: 't1',
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      authLookup: () => ({
        pluginGloballyEnabled: true,
        authStatus: 'connected',
      }),
    })
    assert.equal(gate.allowed, true)
  })

  it('continues to gate actual MCP tool scopes', () => {
    const store = createCapabilitySelectionStore()
    store.setActiveTaskId('t1')
    store.set('t1', {
      connectorIds: [CONNECTOR_GITHUB_ID],
      skillIds: [],
      expertId: null,
    })
    const gate = gateConnectorToolInvoke('github__search_repositories', {
      store,
      taskId: 't1',
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      authLookup: () => ({
        pluginGloballyEnabled: true,
        authStatus: 'connected',
      }),
    })
    assert.equal(gate.allowed, true)
  })

  it('fails closed for connector tools when no Task execution context exists', () => {
    const store = createCapabilitySelectionStore()
    const gate = gateConnectorToolInvoke('github__search_repositories', {
      store,
      taskId: null,
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      authLookup: () => ({
        pluginGloballyEnabled: true,
        authStatus: 'connected',
      }),
    })
    assert.equal(gate.allowed, false)
    if (!gate.allowed) assert.equal(gate.reason, 'missing_task_context')
  })

  it('uses the immutable Turn selection snapshot instead of later store changes', () => {
    const store = createCapabilitySelectionStore()
    store.set('task-a', {
      connectorIds: [],
      skillIds: [],
      expertId: null,
    })
    store.setActiveTaskId('task-a')

    const gate = gateConnectorToolInvoke('github__search_repositories', {
      store,
      taskId: 'task-a',
      selectedConnectorIds: [CONNECTOR_GITHUB_ID],
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      authLookup: () => ({
        pluginGloballyEnabled: true,
        authStatus: 'connected',
      }),
    })

    assert.equal(gate.allowed, true)
  })
})
