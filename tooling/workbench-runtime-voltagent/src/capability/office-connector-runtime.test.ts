import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import {
  createAuthBindingStore,
  createKeychainSecretStore,
  createToolIdentityRegistry,
  type ConnectorDescriptor,
  type PluginManifest,
  type PluginRegistry,
  type PluginRegistryLoadResult,
  type PluginAuthStatus,
} from '../plugin/index.js'
import { createOfficeConnectorRuntime } from './office-connector-runtime.js'

const CONNECTOR_ID = 'connector.hybrid', PLUGIN_A = 'plugin.a', PLUGIN_B = 'plugin.b'

describe('createOfficeConnectorRuntime canonical tool ownership', () => {
  it('revoking plugin A hot-reclaims only A tools from a multi-plugin Hybrid Connector', async () => {
    const identities = createToolIdentityRegistry()
    const pluginBIdentity = identities.register(canonical(PLUGIN_B, 'shared-b'), {
      preferredPublicName: 'shared__lookup',
    })
    const pluginBTool = tool(pluginBIdentity.publicName)
    const bindingStore = createAuthBindingStore()
    const secretStore = createKeychainSecretStore({ mode: 'fake' })
    const authStatuses: PluginAuthStatus[] = [connectedAuth()]
    const descriptor: ConnectorDescriptor = {
      id: CONNECTOR_ID,
      name: 'Hybrid Connector',
      description: 'One Connector contributed by multiple plugins',
      pluginRefs: [PLUGIN_A, PLUGIN_B],
      primaryChannel: 'hybrid',
      capabilities: [capability('mcp', ['shared__']), capability('domain_cli', [])],
      authSummarySource: { pluginId: PLUGIN_A, resourceId: 'oauth:shared', kind: 'oauth2' },
      commandScopes: [],
      toolScope: ['shared__'],
      availability: 'sidecar',
    }
    const manifests: PluginManifest[] = [pluginAManifest()]
    let pluginAToolName = ''
    const registry = {
      listManifests: () => manifests,
      listConnectorDescriptors: () => [descriptor],
      listFakeCatalog: () => [],
      listQueryCatalog: () => [],
      listQueryHandlers: () => ({}),
      listPresetBoards: () => [],
      resolveEnabledIds: () => [PLUGIN_A, PLUGIN_B],
      refreshAuthStatuses: async () => authStatuses,
      getAuthRuntimeStores: () => ({ bindingStore, secretStore }),
      loadMcpPlugin: async () => {
        const identity = identities.register(
          canonical(PLUGIN_A, 'shared-a'),
          { preferredPublicName: 'shared__lookup' },
        )
        pluginAToolName = identity.publicName
        return {
          tools: [tool(pluginAToolName)],
          toolNames: [pluginAToolName],
          toolIdentities: identities.list(),
          statuses: [{ pluginId: PLUGIN_A, serverId: 'shared-a',
            status: 'connected' as const, toolNames: [pluginAToolName] }],
          disconnect: async () => {},
        }
      },
      load: async () => plugins,
    } satisfies PluginRegistry
    const plugins = {
      plugins: [PLUGIN_A, PLUGIN_B].map((id) => ({
        id,
        name: id,
        version: '1.0.0',
        kind: 'builtin' as const,
        enabled: true,
        loadStatus: 'loaded' as const,
        mcp: [],
        cli: [],
        auth: id === PLUGIN_A ? authStatuses : [],
      })),
      connectorDescriptors: [descriptor],
      tools: [pluginBTool],
      toolNames: [pluginBTool.name],
      toolIdentities: identities.list(),
      resolveToolIdentity: (name: string) => identities.resolve(name),
      mcpStatuses: [],
      cliStatuses: [],
      authStatuses,
      authDoctorLine: '',
      authStatusLine: '',
      discoveryFailures: [],
      skillRoots: [],
      skillsResults: [],
      queries: [],
      disconnect: async () => {},
    } satisfies PluginRegistryLoadResult
    const runtime = createOfficeConnectorRuntime({
      env: {}, registry, plugins, manifests, baseToolNames: [], oauthFetch: brokerFetch,
    })

    await runtime.execute({ kind: 'start-auth', connectorId: CONNECTOR_ID })
    await runtime.execute({ kind: 'reconcile-auth' })
    assert.equal(
      plugins.resolveToolIdentity(pluginAToolName)?.canonical.pluginId,
      PLUGIN_A,
    )
    assert.equal(
      plugins.resolveToolIdentity(pluginBTool.name)?.canonical.pluginId,
      PLUGIN_B,
    )

    const revoked = await runtime.execute({
      kind: 'revoke-auth',
      connectorId: CONNECTOR_ID,
    })
    assert.equal(revoked.kind, 'auth-revoked')
    assert.ok(!revoked.snapshot.packagedToolNames.includes(pluginAToolName))
    assert.ok(revoked.snapshot.packagedToolNames.includes(pluginBTool.name))
    assert.deepEqual(
      runtime.toolsFor({
        taskId: 'task-selected',
        selectedConnectorIds: [CONNECTOR_ID],
      }).map((candidate) => candidate.name),
      [pluginBTool.name],
    )
    await runtime.dispose()
  })
})

function connectedAuth(): PluginAuthStatus {
  return { pluginId: PLUGIN_A, pluginEnabled: true, resourceId: 'oauth:shared',
    kind: 'oauth2', status: 'connected' }
}

function pluginAManifest(): PluginManifest {
  return { schemaVersion: 1, id: PLUGIN_A, name: 'Plugin A', version: '1.0.0',
    kind: 'builtin', contributes: { auth: [{ resourceId: 'oauth:shared', kind: 'oauth2',
      oauth: { strategy: 'managed_broker', mcpServerId: 'shared-a', providerId: 'shared',
        brokerBaseUrl: 'https://broker.test' } }] } }
}

function canonical(pluginId: string, channelId: string) {
  return { pluginId, channel: 'mcp' as const, channelId, originalName: 'lookup' }
}

function capability(channel: 'mcp' | 'domain_cli', toolNames: string[]) {
  return { id: channel, name: channel, channel, toolNames, available: true }
}

function tool(name: string) {
  return createTool({
    name,
    description: name,
    parameters: z.object({}),
    execute: async () => ({ ok: true }),
  })
}

async function brokerFetch(input: string) {
  const start = input.endsWith('/v1/oauth/sessions')
  const body = start ? {
    session_id: 'session-canonical', authorization_url: 'https://provider.test/authorize',
    claim_token: 'claim-token-canonical', token_endpoint: 'https://broker.test/token',
    client_id: 'workbench-test', expires_in: 900, poll_interval: 1,
  } : { status: 'authorized', access_token: 'access-token', expires_in: 3600 }
  return {
    ok: true,
    status: start ? 201 : 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}
