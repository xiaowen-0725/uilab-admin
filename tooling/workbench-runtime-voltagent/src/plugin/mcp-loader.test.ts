import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { createAuthBindingStore } from './auth-binding-store.js'
import {
  BUILTIN_CONNECTOR_DESCRIPTORS,
  BUILTIN_MCP_CALENDAR_PLUGIN,
  BUILTIN_MCP_DOCS_PLUGIN,
  BUILTIN_PLUGINS,
  CONNECTOR_GITHUB_ID,
} from './builtins.js'
import {
  applyMcpNeedsApproval,
  buildMcpChildEnv,
  forceToolNeedsApproval,
  loadResolvedMcpServers,
  mergeReadOnlyAllowlist,
  resolveMcpContribution,
  wrapMcpToolsWithTaskSelectionGate,
} from './mcp-loader.js'
import { createPluginRegistry, formatRegistryMcpStatusLine } from './registry.js'
import { decideToolNeedsApproval } from './security-policy.js'
import { oauthAccessAccount } from './oauth.js'
import { createKeychainSecretStore } from './secret-store.js'

function docsContrib() {
  return BUILTIN_MCP_DOCS_PLUGIN.contributes!.mcp![0]
}

function calendarContrib() {
  return BUILTIN_MCP_CALENDAR_PLUGIN.contributes!.mcp![0]
}

describe('MCP tool approval (fail-closed)', () => {
  it('uses the Turn snapshot and rejects a connector omitted from that Turn', async () => {
    let calls = 0
    const source = createTool({
      name: 'github__search_repositories',
      description: 'search',
      parameters: z.object({}),
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const [gated] = wrapMcpToolsWithTaskSelectionGate(
      [source as any],
      BUILTIN_CONNECTOR_DESCRIPTORS,
    )

    const blocked = await gated.execute?.(
      {},
      {
        conversationId: 'task-a',
        context: new Map([['capabilityConnectorIds', []]]),
      } as any,
    )
    assert.deepEqual(blocked, {
      ok: false,
      error: 'not_task_selected',
      hint: '连接器「GitHub」工具面未进入本 Task；本 Task 未选用该连接器',
    })
    assert.equal(calls, 0)

    const allowed = await gated.execute?.(
      {},
      {
        conversationId: 'task-a',
        context: new Map([
          ['capabilityConnectorIds', [CONNECTOR_GITHUB_ID]],
        ]),
      } as any,
    )
    assert.deepEqual(allowed, { ok: true })
    assert.equal(calls, 1)
  })

  it('requires approval for everything by default', () => {
    const empty = new Set<string>()
    for (const name of [
      'docs_write_document',
      'docs_read_document',
      'list_calendars',
      'calendar_get_and_set_event',
      'docs_mark_as_read',
      'mystery_cloud_action',
    ]) {
      assert.equal(
        decideToolNeedsApproval({ toolName: name, readOnlyAllowlist: empty }),
        true,
      )
    }
  })

  it('frees only exact allowlist names', () => {
    const allow = mergeReadOnlyAllowlist(
      { MCP_READ_ONLY_TOOL_NAMES: 'docs_read_document,list_calendars' },
      [],
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'docs_read_document',
        readOnlyAllowlist: allow,
      }),
      false,
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'list_calendars',
        readOnlyAllowlist: allow,
      }),
      false,
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'docs_read_document_extra',
        readOnlyAllowlist: allow,
      }),
      true,
    )
  })

  it('forceToolNeedsApproval / applyMcpNeedsApproval on real Tools', () => {
    const tool = createTool({
      name: 'docs_write_document',
      description: 'write',
      parameters: z.object({ path: z.string() }),
      execute: async () => ({ ok: true }),
    })
    assert.notEqual(tool.needsApproval, true)
    assert.equal(forceToolNeedsApproval(tool as any).needsApproval, true)

    const read = createTool({
      name: 'docs_read_document',
      description: 'read',
      parameters: z.object({ path: z.string() }),
      execute: async () => ({ ok: true }),
    })
    const write = createTool({
      name: 'docs_write_document',
      description: 'write',
      parameters: z.object({ path: z.string() }),
      execute: async () => ({ ok: true }),
    })
    const out = applyMcpNeedsApproval(
      [read, write] as any,
      new Set(['docs_read_document']),
    )
    assert.notEqual(out[0].needsApproval, true)
    assert.equal(out[1].needsApproval, true)
  })

  it('fails closed without changing execution when needsApproval is non-writable', async () => {
    let calls = 0
    const source = createTool({
      name: 'docs_write_document',
      description: 'write',
      parameters: z.object({ path: z.string() }),
      needsApproval: false,
      execute: async function (args) {
        calls += 1
        return {
          path: args.path,
          receiverName: this.name,
        }
      },
    })
    Object.defineProperty(source, 'needsApproval', {
      value: false,
      writable: false,
      configurable: true,
    })

    const forced = forceToolNeedsApproval(source as any)

    assert.equal(source.needsApproval, false)
    assert.equal(forced.needsApproval, true)
    assert.deepEqual(await forced.execute?.({ path: 'report.md' }), {
      path: 'report.md',
      receiverName: 'docs_write_document',
    })
    assert.equal(calls, 1)
  })
})

describe('resolveMcpContribution (builtin manifests)', () => {
  it('returns null when env empty', () => {
    assert.equal(
      resolveMcpContribution('mcp.docs', docsContrib(), {}),
      null,
    )
    assert.equal(
      resolveMcpContribution('mcp.calendar', calendarContrib(), {}),
      null,
    )
  })

  it('resolves docs http URL and Feishu alias', () => {
    const a = resolveMcpContribution('mcp.docs', docsContrib(), {
      MCP_DOCS_URL: 'https://mcp.example/docs',
      MCP_DOCS_BEARER_TOKEN: 'tok',
    })
    assert.ok(a)
    assert.equal(a!.transport, 'http')
    assert.equal((a!.server as { url: string }).url, 'https://mcp.example/docs')

    const b = resolveMcpContribution('mcp.docs', docsContrib(), {
      FEISHU_DOCS_MCP_URL: 'https://mcp.example/feishu-docs',
    })
    assert.equal(
      (b!.server as { url: string }).url,
      'https://mcp.example/feishu-docs',
    )
  })

  it('resolves calendar stdio command', () => {
    const c = resolveMcpContribution('mcp.calendar', calendarContrib(), {
      MCP_CALENDAR_COMMAND: 'npx',
      MCP_CALENDAR_ARGS: '-y,@example/calendar-mcp',
    })
    assert.ok(c)
    assert.equal(c!.transport, 'stdio')
    assert.equal((c!.server as { command: string }).command, 'npx')
  })
})

describe('buildMcpChildEnv (connector-scoped)', () => {
  it('does not leak calendar-only secrets into docs child', () => {
    const docsEnv = buildMcpChildEnv(docsContrib(), {
      PATH: '/usr/bin',
      FEISHU_APP_ID: 'app',
      GOOGLE_APPLICATION_CREDENTIALS: '/secret/google.json',
      DEEPSEEK_API_KEY: 'sk-should-never-pass',
    })
    assert.equal(docsEnv.FEISHU_APP_ID, 'app')
    assert.equal(docsEnv.GOOGLE_APPLICATION_CREDENTIALS, undefined)
    assert.equal(docsEnv.DEEPSEEK_API_KEY, undefined)
  })

  it('allows google credentials for calendar only', () => {
    const calEnv = buildMcpChildEnv(calendarContrib(), {
      PATH: '/usr/bin',
      GOOGLE_APPLICATION_CREDENTIALS: '/secret/google.json',
      OPENAI_API_KEY: 'sk-nope',
    })
    assert.equal(
      calEnv.GOOGLE_APPLICATION_CREDENTIALS,
      '/secret/google.json',
    )
    assert.equal(calEnv.OPENAI_API_KEY, undefined)
  })

  it('honors MCP_DOCS_CHILD_ENV_KEYS without granting model keys', () => {
    const docsEnv = buildMcpChildEnv(docsContrib(), {
      PATH: '/bin',
      CUSTOM_DOCS_TOKEN: 'tok',
      MCP_DOCS_CHILD_ENV_KEYS: 'CUSTOM_DOCS_TOKEN,DEEPSEEK_API_KEY,GEMINI_API_KEY',
      DEEPSEEK_API_KEY: 'sk-nope',
      GEMINI_API_KEY: 'gem-nope',
    })
    assert.equal(docsEnv.CUSTOM_DOCS_TOKEN, 'tok')
    assert.equal(docsEnv.DEEPSEEK_API_KEY, undefined)
    assert.equal(docsEnv.GEMINI_API_KEY, undefined)
  })
})

describe('loadResolvedMcpServers tool decoration', () => {
  it('composes forced approval, live auth, public naming, hooks, and task selection', async () => {
    let authChecks = 0
    let sourceCalls = 0
    const hooks = { onStart: async () => {} }
    const source = createTool({
      name: 'create_issue',
      description: 'Create an issue',
      parameters: z.object({
        title: z.string(),
      }),
      needsApproval: false,
      hooks,
      execute: async ({ title }) => {
        sourceCalls += 1
        return { title }
      },
    })

    const loaded = await loadResolvedMcpServers(
      [
        {
          serverId: 'github',
          pluginId: 'mcp.github',
          transport: 'http',
          server: {
            type: 'http',
            url: 'https://mcp.example/github',
            timeout: 10,
          },
          readOnlyToolNames: ['search_repositories'],
          toolNamePrefix: 'github__',
          resolveAuthMaterial: async () => {
            authChecks += 1
            return {
              status: 'connected',
              envValues: {},
              controlledEnvNames: [],
              bearerToken: 'live-token',
            }
          },
        },
      ],
      {
        connectorDescriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
        host: {
          getTools: async () => ({
            tools: [source as any],
            disconnect: async () => {},
          }),
        },
      },
    )

    try {
      const [exposed] = loaded.tools
      assert.equal(exposed.name, 'github__create_issue')
      assert.equal(exposed.needsApproval, true)
      assert.equal(exposed.hooks, hooks)
      assert.deepEqual(
        await exposed.execute?.(
          { title: 'C3 characterization' },
          {
            conversationId: 'task-a',
            context: new Map([['capabilityConnectorIds', []]]),
          } as any,
        ),
        {
          ok: false,
          error: 'not_task_selected',
          hint: '连接器「GitHub」工具面未进入本 Task；本 Task 未选用该连接器',
        },
      )
      assert.equal(authChecks, 0)
      assert.equal(sourceCalls, 0)

      assert.deepEqual(
        await exposed.execute?.(
          { title: 'C3 characterization' },
          {
            conversationId: 'task-a',
            context: new Map([
              ['capabilityConnectorIds', [CONNECTOR_GITHUB_ID]],
            ]),
          } as any,
        ),
        { title: 'C3 characterization' },
      )
      assert.equal(authChecks, 1)
      assert.equal(sourceCalls, 1)
    } finally {
      await loaded.disconnect()
    }
  })
})

describe('PluginRegistry MCP load', () => {
  it('discovers official GitHub MCP tools under a stable public prefix after managed authorization', async () => {
    const github = BUILTIN_PLUGINS.find((plugin) => plugin.id === 'mcp.github')
    assert.ok(github, 'expected builtin mcp.github')

    const secretStore = createKeychainSecretStore({ mode: 'fake' })
    const bindingStore = createAuthBindingStore()
    const accessAccount = oauthAccessAccount('mcp.github', 'mcp:github')
    await secretStore.set!(
      { backend: 'keychain', account: accessAccount },
      'managed-oauth-token',
    )
    bindingStore.upsert({
      pluginId: 'mcp.github',
      resourceId: 'mcp:github',
      kind: 'oauth2',
      secretRef: { backend: 'keychain', account: accessAccount },
      expiresAt: Date.now() + 60_000,
    })
    let capturedServers: Record<string, unknown> | undefined
    const reg = createPluginRegistry({
      env: { PLUGINS_ENABLED: 'mcp.github' },
      secretStore,
      authBindingStore: bindingStore,
      host: {
        getTools: async (servers) => {
          capturedServers = servers
          return {
            tools: [
              createTool({
                name: 'search_repositories',
                description: 'Search repositories',
                parameters: z.object({ query: z.string() }),
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
      (capturedServers?.github as { url?: string } | undefined)?.url,
      'https://api.githubcopilot.com/mcp/',
    )
    assert.equal(
      (
        capturedServers?.github as
          | { requestInit?: { headers?: { Authorization?: string } } }
          | undefined
      )?.requestInit?.headers?.Authorization,
      'Bearer managed-oauth-token',
    )
    assert.ok(result.toolNames.includes('github__search_repositories'))
    assert.deepEqual(
      result.toolIdentities.find(
        (identity) => identity.publicName === 'github__search_repositories',
      )?.canonical,
      {
        pluginId: 'mcp.github',
        channel: 'mcp',
        channelId: 'github',
        originalName: 'search_repositories',
      },
    )
    await result.disconnect()
  })

  it('keeps a reversible provider identity when MCP tool names collide', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_CALENDAR_URL: 'https://mcp.example/calendar',
      },
      host: {
        getTools: async () => ({
          tools: [
            createTool({
              name: 'search',
              description: 'search',
              parameters: z.object({}),
              execute: async () => ({ ok: true }),
            }),
          ] as any[],
          disconnect: async () => {},
        }),
      },
    })

    const result = await reg.load()
    assert.ok(result.toolNames.includes('search'))
    assert.ok(result.toolNames.includes('calendar__search'))
    assert.deepEqual(
      result.toolIdentities.find(
        (identity) => identity.publicName === 'calendar__search',
      )?.canonical,
      {
        pluginId: 'mcp.calendar',
        channel: 'mcp',
        channelId: 'calendar',
        originalName: 'search',
      },
    )
    await result.disconnect()
  })

  it('disabled when no MCP env; both builtins report disabled', async () => {
    const reg = createPluginRegistry({ env: {}, builtins: BUILTIN_PLUGINS })
    const result = await reg.load()
    assert.equal(result.tools.length, 0)
    const mcp = result.mcpStatuses.filter((s) =>
      ['docs', 'calendar'].includes(s.serverId),
    )
    assert.equal(mcp.length, 2)
    assert.ok(mcp.every((s) => s.status === 'disabled'))
    await result.disconnect()
  })

  it('connects via mock host; tools need approval without allowlist', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_CALENDAR_URL: 'https://mcp.example/cal',
      },
      host: {
        getTools: async (servers) => {
          const ids = Object.keys(servers)
          const tools = ids.flatMap((id) => [
            createTool({
              name: `${id}_read_item`,
              description: 'read',
              parameters: z.object({ q: z.string().optional() }),
              execute: async () => ({ ok: true }),
            }),
            createTool({
              name: `${id}_write_item`,
              description: 'write',
              parameters: z.object({ q: z.string().optional() }),
              execute: async () => ({ ok: true }),
            }),
          ]) as any[]
          return { tools, disconnect: async () => {} }
        },
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.filter((s) => s.status === 'connected').length,
      2,
    )
    assert.ok(result.toolNames.includes('docs_read_item'))
    assert.ok(result.toolNames.includes('calendar_write_item'))
    for (const tool of result.tools) {
      assert.equal(
        (tool as { needsApproval?: boolean }).needsApproval,
        true,
        `expected approval for ${tool.name}`,
      )
    }
    await result.disconnect()
  })

  it('env allowlist frees exact read tool only', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_READ_ONLY_TOOL_NAMES: 'docs_read_item',
      },
      host: {
        getTools: async () => ({
          tools: [
            createTool({
              name: 'docs_read_item',
              description: 'read',
              parameters: z.object({}),
              execute: async () => ({ ok: true }),
            }),
            createTool({
              name: 'docs_write_item',
              description: 'write',
              parameters: z.object({}),
              execute: async () => ({ ok: true }),
            }),
          ] as any[],
          disconnect: async () => {},
        }),
      },
    })
    const result = await reg.load()
    const read = result.tools.find((t) => t.name === 'docs_read_item') as {
      needsApproval?: boolean
    }
    const write = result.tools.find((t) => t.name === 'docs_write_item') as {
      needsApproval?: boolean
    }
    assert.notEqual(read?.needsApproval, true)
    assert.equal(write?.needsApproval, true)
    await result.disconnect()
  })

  it('degrades on host failure without throwing', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_URL: 'https://mcp.example/docs' },
      host: {
        getTools: async () => {
          throw new Error('ECONNREFUSED mock')
        },
      },
    })
    const result = await reg.load()
    assert.equal(result.tools.length, 0)
    const docs = result.mcpStatuses.find((s) => s.serverId === 'docs')
    assert.equal(docs?.status, 'failed')
    assert.match(docs?.reason ?? '', /ECONNREFUSED|连接失败/)
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'calendar')?.status,
      'disabled',
    )
    await result.disconnect()
  })
})

describe('formatRegistryMcpStatusLine', () => {
  it('formats status line for logs', () => {
    const line = formatRegistryMcpStatusLine([
      {
        pluginId: 'mcp.docs',
        serverId: 'docs',
        status: 'connected',
        toolNames: ['a', 'b'],
      },
      {
        pluginId: 'mcp.calendar',
        serverId: 'calendar',
        status: 'failed',
        toolNames: [],
        reason: 'x',
      },
    ])
    assert.equal(line, 'docs=ok(2),calendar=fail')
  })
})
