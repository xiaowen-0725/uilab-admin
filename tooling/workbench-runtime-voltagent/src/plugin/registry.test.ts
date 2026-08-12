import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { BUILTIN_PLUGINS } from './builtins.js'
import { DEMO_EXAMPLE_PACKAGE } from './demo-package.js'
import type { BuiltinPluginPackage } from './plugin-package.js'
import { oauthAccessAccount } from './oauth.js'
import { createPluginRegistry } from './registry.js'
import {
  createAuthBindingStore,
  createKeychainSecretStore,
} from './secret-store.js'
import type { PluginManifest } from './manifest.js'

describe('createPluginRegistry', () => {
  it('lists connector projections from provider manifests without a core enum', () => {
    const extra: PluginManifest = {
      schemaVersion: 1,
      id: 'provider.dynamic',
      name: 'Dynamic Provider',
      version: '1.0.0',
      kind: 'local',
      contributes: {
        connectors: [
          {
            id: 'connector.dynamic',
            name: 'Dynamic',
            description: 'Dynamic connector',
            authResourceId: 'account',
            authKind: 'oauth2',
            primaryChannel: 'mcp',
            capabilities: [],
            toolScope: ['dynamic_'],
            availability: 'sidecar',
          },
        ],
      },
    }
    const reg = createPluginRegistry({
      env: {},
      builtins: [],
      extra: [extra],
    })

    assert.deepEqual(
      reg.listConnectorDescriptors().map((connector) => connector.id),
      ['connector.dynamic'],
    )
  })

  it('lists builtin manifests without hard-coded connector enum in API', () => {
    const reg = createPluginRegistry({ env: {} })
    const ids = reg.listManifests().map((m) => m.id).sort()
    assert.deepEqual(ids, [
      'cli.feishu',
      'mcp.calendar',
      'mcp.docs',
      'mcp.github',
      'skills.office',
    ])
    assert.ok(reg.resolveEnabledIds().includes('mcp.docs'))
    assert.ok(reg.resolveEnabledIds().includes('skills.office'))
    // Bundled Feishu CLI is enabled by default; Connected still requires user auth.
    assert.ok(reg.resolveEnabledIds().includes('cli.feishu'))
    // GitHub is a packaged Connector by default; enabled still means auth=missing.
    assert.ok(reg.resolveEnabledIds().includes('mcp.github'))
  })

  it('loads disabled MCP when env empty', async () => {
    const reg = createPluginRegistry({ env: {} })
    const result = await reg.load()
    assert.equal(result.tools.length, 0)
    assert.ok(result.mcpStatuses.every((s) => s.status === 'disabled'))
    await result.disconnect()
  })

  it('does not connect an enabled OAuth MCP before the user authorizes it', async () => {
    let hostCalls = 0
    const reg = createPluginRegistry({
      env: {},
      enabledIds: ['mcp.github'],
      host: {
        getTools: async () => {
          hostCalls += 1
          throw new Error('must not connect without OAuth')
        },
      },
    })

    const result = await reg.load()
    assert.equal(hostCalls, 0)
    assert.equal(
      result.plugins.find((plugin) => plugin.id === 'mcp.github')?.loadStatus,
      'loaded',
    )
    assert.equal(
      result.mcpStatuses.find((status) => status.serverId === 'github')?.status,
      'disabled',
    )
    await result.disconnect()
  })

  it('hot-loads an OAuth MCP after managed authorization without restarting the registry', async () => {
    let hostCalls = 0
    const secretStore = createKeychainSecretStore({ mode: 'fake' })
    const bindingStore = createAuthBindingStore()
    const reg = createPluginRegistry({
      env: {},
      enabledIds: ['mcp.github'],
      secretStore,
      authBindingStore: bindingStore,
      host: {
        getTools: async (servers) => {
          hostCalls += 1
          const requestInit = (servers.github as { requestInit?: RequestInit })
            .requestInit
          assert.deepEqual(requestInit?.headers, {
            Authorization: 'Bearer oauth-user-token',
          })
          return {
            tools: [
              createTool({
                name: 'search_repositories',
                description: 'search',
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              }),
            ] as any[],
            disconnect: async () => {},
          }
        },
      },
    })

    const initial = await reg.load()
    assert.equal(hostCalls, 0)
    await secretStore.set!(
      {
        backend: 'keychain',
        account: oauthAccessAccount('mcp.github', 'mcp:github'),
      },
      'oauth-user-token',
    )
    bindingStore.upsert({
      pluginId: 'mcp.github',
      resourceId: 'mcp:github',
      kind: 'oauth2',
      secretRef: {
        backend: 'keychain',
        account: oauthAccessAccount('mcp.github', 'mcp:github'),
      },
      expiresAt: Date.now() + 60_000,
      oauth: {
        tokenEndpoint: 'https://github.test/token',
        clientId: 'client',
        refreshAccount: 'oauth-refresh',
      },
    })

    const hot = await reg.loadMcpPlugin('mcp.github')
    assert.equal(hostCalls, 1)
    assert.deepEqual(hot.toolNames, ['github__search_repositories'])
    assert.equal(hot.statuses[0]?.status, 'connected')
    await hot.disconnect()
    await initial.disconnect()
  })

  it('connects docs via mock host when MCP_DOCS_URL set; tools need approval', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_URL: 'https://mcp.example/docs' },
      host: {
        getTools: async (servers) => {
          assert.ok(servers.docs)
          return {
            tools: [
              createTool({
                name: 'docs_read_item',
                description: 'r',
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              }),
            ] as any[],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    assert.ok(result.toolNames.includes('docs_read_item'))
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'connected',
    )
    assert.equal(
      (result.tools[0] as { needsApproval?: boolean }).needsApproval,
      true,
    )
    // calendar still disabled
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'calendar')?.status,
      'disabled',
    )
    await result.disconnect()
  })

  it('isolates failure: docs fail does not block calendar connect', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_CALENDAR_URL: 'https://mcp.example/cal',
      },
      host: {
        getTools: async (servers) => {
          if (servers.docs) {
            throw new Error('docs down')
          }
          return {
            tools: [
              createTool({
                name: 'cal_list',
                description: 'c',
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              }),
            ] as any[],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'failed',
    )
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'calendar')?.status,
      'connected',
    )
    assert.ok(result.toolNames.includes('cal_list'))
    await result.disconnect()
  })

  it('treats empty tool list as failed', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_URL: 'https://x' },
      host: {
        getTools: async () => ({ tools: [], disconnect: async () => {} }),
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'failed',
    )
    await result.disconnect()
  })

  it('honors FEISHU_DOCS_MCP_URL alias', async () => {
    const reg = createPluginRegistry({
      env: { FEISHU_DOCS_MCP_URL: 'https://feishu.example/mcp' },
      host: {
        getTools: async (servers) => {
          assert.equal(
            (servers.docs as { url?: string }).url,
            'https://feishu.example/mcp',
          )
          return {
            tools: [
              createTool({
                name: 'x',
                description: 'x',
                parameters: z.object({}),
                execute: async () => ({}),
              }),
            ] as any[],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'connected',
    )
    await result.disconnect()
  })

  it('PLUGINS_DISABLED skips a builtin', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://x',
        PLUGINS_DISABLED: 'mcp.docs',
      },
      host: {
        getTools: async () => {
          throw new Error('should not load docs')
        },
      },
    })
    assert.ok(!reg.resolveEnabledIds().includes('mcp.docs'))
    const result = await reg.load()
    assert.equal(
      result.plugins.find((p) => p.id === 'mcp.docs')?.enabled,
      false,
    )
    await result.disconnect()
  })

  it('accepts extra manifests without core enum change', async () => {
    const extra: PluginManifest = {
      schemaVersion: 1,
      id: 'mcp.custom',
      name: 'Custom',
      version: '0.0.1',
      kind: 'local',
      enabledByDefault: true,
      contributes: {
        mcp: [
          {
            serverId: 'custom',
            urlFromEnv: ['MCP_CUSTOM_URL'],
          },
        ],
      },
    }
    const reg = createPluginRegistry({
      env: { MCP_CUSTOM_URL: 'https://custom' },
      builtins: BUILTIN_PLUGINS,
      extra: [extra],
      host: {
        getTools: async (servers) => ({
          tools: servers.custom
            ? [
                createTool({
                  name: 'custom_tool',
                  description: 'c',
                  parameters: z.object({}),
                  execute: async () => ({}),
                }),
              ]
            : [],
          disconnect: async () => {},
        }),
      },
    })
    const result = await reg.load()
    assert.ok(result.toolNames.includes('custom_tool'))
    await result.disconnect()
  })
})

describe('createPluginRegistry — BuiltinPluginPackage seam (#49)', () => {
  it('registers a demo package connector without Host branching on Provider id', () => {
    const reg = createPluginRegistry({
      env: {},
      builtins: [],
      packages: [DEMO_EXAMPLE_PACKAGE],
    })

    const descriptors = reg.listConnectorDescriptors()
    const ids = descriptors.map((c) => c.id)
    assert.ok(
      ids.includes('connector.demo'),
      'demo package connector must be registered',
    )

    const demo = descriptors.find((c) => c.id === 'connector.demo')
    assert.equal(demo?.brandIconKey, 'demo.example')
    assert.equal(demo?.pluginRefs[0], 'mcp.demo')
  })

  it('coexists with existing builtins without conflicts', () => {
    const reg = createPluginRegistry({
      env: {},
      packages: [DEMO_EXAMPLE_PACKAGE],
    })

    const ids = reg.listConnectorDescriptors().map((c) => c.id)
    assert.ok(ids.includes('connector.github'))
    assert.ok(ids.includes('connector.feishu'))
    assert.ok(ids.includes('connector.demo'))
  })

  it('duplicate manifest id between package and builtin fails closed (builtin wins)', () => {
    const conflictPkg: BuiltinPluginPackage = {
      id: 'conflict.test',
      manifests: [
        {
          schemaVersion: 1,
          id: 'mcp.github',
          name: 'Conflict',
          version: '0.0.1',
          kind: 'builtin',
          contributes: {},
        },
      ],
    }
    // mergeManifests: builtins first → the package's mcp.github is silently
    // dropped (first wins). No throw, no duplicate.
    const reg = createPluginRegistry({
      env: {},
      packages: [conflictPkg],
    })
    const manifests = reg.listManifests()
    const githubCount = manifests.filter((m) => m.id === 'mcp.github').length
    assert.equal(githubCount, 1, 'duplicate id must not produce two manifests')
  })

  it('exposes package fakeCatalog entries via listFakeCatalog', () => {
    const reg = createPluginRegistry({
      env: {},
      builtins: [],
      packages: [DEMO_EXAMPLE_PACKAGE],
    })
    const catalog = reg.listFakeCatalog()
    assert.equal(catalog.length, 1)
    assert.equal(catalog[0]?.connectorId, 'connector.demo')
    assert.equal(catalog[0]?.connectionState, 'missing')
  })

  it('returns empty fakeCatalog when no packages are registered', () => {
    const reg = createPluginRegistry({
      env: {},
      builtins: [],
    })
    assert.deepEqual(reg.listFakeCatalog(), [])
  })
})
