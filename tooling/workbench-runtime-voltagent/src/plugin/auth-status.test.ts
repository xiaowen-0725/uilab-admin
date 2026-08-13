import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAuthBindingStore } from './auth-binding-store.js'
import {
  formatAuthDoctorLine,
  formatAuthStatusSummary,
  resolveAuthResourceStatus,
  resolvePluginAuthStatuses,
  sanitizeHint,
} from './auth-status.js'
import { BUILTIN_MCP_DOCS_PLUGIN, BUILTIN_PLUGINS } from './builtins.js'
import { resolveAuthStatus } from './credential-resolver.js'
import {
  createEnvSecretStore,
  createMemorySecretStore,
} from './secret-store.js'
import { createPluginRegistry } from './registry.js'
import type { AuthResourceContribution } from './manifest.js'

describe('resolveAuthStatus cli_session probe', () => {
  it('connected when statusCommand exit 0; missing otherwise', async () => {
    const binding = {
      pluginId: 'cli.feishu',
      resourceId: 'cli:feishu',
      kind: 'cli_session' as const,
      loginHint: '请先运行 lark-cli auth login',
      statusCommand: { command: '/bin/true', argv: [] as string[] },
    }
    const store = createEnvSecretStore({})
    const ok = await resolveAuthStatus(binding, store, {}, {
      runner: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
    })
    assert.equal(ok.status, 'connected')

    const miss = await resolveAuthStatus(binding, store, {}, {
      runner: async () => ({ stdout: '', stderr: 'not logged in', exitCode: 1 }),
    })
    assert.equal(miss.status, 'missing')
    assert.match(miss.hint ?? '', /lark-cli|login/)
    assert.doesNotMatch(miss.hint ?? '', /token|secret/i)
  })

  it('error when probe throws', async () => {
    const r = await resolveAuthStatus(
      {
        pluginId: 'p',
        resourceId: 'cli:x',
        kind: 'cli_session',
        statusCommand: { command: 'x', argv: [] },
        loginHint: 'login please',
      },
      createEnvSecretStore({}),
      {},
      {
        runner: async () => {
          throw new Error('spawn failed')
        },
      },
    )
    assert.equal(r.status, 'error')
    assert.match(r.hint ?? '', /login please|spawn/)
  })

  it('requires the Provider-declared user identity instead of accepting a bot-only exit 0', async () => {
    const binding = {
      pluginId: 'cli.feishu',
      resourceId: 'cli:feishu',
      kind: 'cli_session' as const,
      loginHint: '请先授权飞书用户账号',
      statusCommand: {
        command: '/fake/lark-cli',
        argv: ['auth', 'status', '--json', '--verify'],
        connectedWhen: {
          jsonPath: ['identities', 'user', 'available'],
          equals: true,
        },
      },
    }
    const store = createEnvSecretStore({})
    const botOnly = await resolveAuthStatus(binding, store, {}, {
      runner: async () => ({
        stdout: JSON.stringify({
          identity: 'bot',
          verified: true,
          identities: {
            bot: { status: 'ready', available: true },
            user: { status: 'missing', available: false },
          },
        }),
        stderr: '',
        exitCode: 0,
      }),
    })
    assert.equal(botOnly.status, 'missing')

    const userReady = await resolveAuthStatus(binding, store, {}, {
      runner: async () => ({
        stdout: JSON.stringify({
          identity: 'user',
          verified: true,
          identities: {
            bot: { status: 'ready', available: true },
            user: { status: 'ready', available: true },
          },
        }),
        stderr: '',
        exitCode: 0,
      }),
    })
    assert.equal(userReady.status, 'connected')
  })
})

describe('binding clear → missing', () => {
  it('memory secret binding connected then clear falls back to missing env', async () => {
    const memory = createMemorySecretStore()
    await memory.set!({ backend: 'memory', key: 'pat' }, 'super-secret-pat-value')
    const bindings = createAuthBindingStore()
    const resource: AuthResourceContribution = {
      resourceId: 'api',
      kind: 'env_ref',
      envNames: ['GITHUB_PAT'],
      loginHint: '配置 GITHUB_PAT',
    }

    bindings.upsert({
      pluginId: 'github',
      resourceId: 'api',
      kind: 'static_bearer',
      secretRef: { backend: 'memory', key: 'pat' },
    })

    const connected = await resolveAuthResourceStatus(
      'github',
      resource,
      true,
      { store: memory, bindingStore: bindings, env: {} },
    )
    assert.equal(connected.status, 'connected')
    assert.ok(!JSON.stringify(connected).includes('super-secret'))

    bindings.clear('github', 'api')
    const after = await resolveAuthResourceStatus('github', resource, true, {
      store: createEnvSecretStore({}),
      bindingStore: bindings,
      env: {},
    })
    assert.equal(after.status, 'missing')
    assert.match(after.hint ?? '', /GITHUB_PAT|配置/)
  })
})

describe('PluginRegistry auth merge', () => {
  it('enabled plugin can still be auth=missing (enable ≠ login)', async () => {
    const reg = createPluginRegistry({
      env: {},
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
    })
    const result = await reg.load()
    const docs = result.plugins.find((p) => p.id === 'mcp.docs')
    assert.equal(docs?.enabled, true)
    const auth = result.authStatuses.find(
      (a) => a.pluginId === 'mcp.docs' && a.resourceId === 'bearer',
    )
    assert.equal(auth?.pluginEnabled, true)
    assert.equal(auth?.status, 'missing')
    assert.match(result.authDoctorLine, /mcp\.docs\/bearer/)
    assert.match(result.authDoctorLine, /auth=missing/)
    assert.doesNotMatch(result.authDoctorLine, /ghp_|sk-/)
    await result.disconnect()
  })

  it('bearer env → auth=connected without leaking value', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_BEARER_TOKEN: 'sk-super-secret-token-xyz' },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
    })
    const result = await reg.load()
    const auth = result.authStatuses.find((a) => a.pluginId === 'mcp.docs')
    assert.equal(auth?.status, 'connected')
    assert.doesNotMatch(result.authDoctorLine, /sk-super-secret/)
    assert.doesNotMatch(result.authStatusLine, /sk-super-secret/)
    await result.disconnect()
  })

  it('cli_session uses injected runner when plugin enabled', async () => {
    const reg = createPluginRegistry({
      env: {
        PLUGINS_ENABLED: 'cli.feishu',
        FEISHU_CLI_PATH: '/fake/lark-cli',
      },
      builtins: BUILTIN_PLUGINS,
      cliRunner: async (cmd, argv) => {
        // status probe and tool exec both use runner
        if (argv[0] === 'auth' && argv[1] === 'status') {
          return {
            stdout: JSON.stringify({
              identity: 'user',
              verified: true,
              identities: {
                bot: { status: 'ready', available: true },
                user: { status: 'ready', available: true },
              },
            }),
            stderr: '',
            exitCode: 0,
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    })
    assert.ok(reg.resolveEnabledIds().includes('skills.office'))
    const result = await reg.load()
    const auth = result.authStatuses.find(
      (a) => a.pluginId === 'cli.feishu' && a.resourceId === 'cli:feishu',
    )
    assert.equal(auth?.pluginEnabled, true)
    assert.equal(auth?.status, 'connected')
    await result.disconnect()
  })

  it('bearer auth accepts MCP token aliases', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_TOKEN: 'tok-alias' },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
    })
    const result = await reg.load()
    const auth = result.authStatuses.find((a) => a.pluginId === 'mcp.docs')
    assert.equal(auth?.status, 'connected')
    await result.disconnect()
  })
})

describe('format helpers', () => {
  it('formatAuthStatusSummary and sanitizeHint', () => {
    assert.equal(
      formatAuthStatusSummary([
        {
          pluginId: 'a',
          resourceId: 'r',
          kind: 'env_ref',
          pluginEnabled: true,
          status: 'missing',
          hint: 'x',
        },
      ]),
      'a/r=missing',
    )
    assert.match(sanitizeHint('token ghp_abc123secret'), /\*\*\*/)
    // do not rewrite resource status lines
    assert.match(
      sanitizeHint('auth bearer=missing · 配置 MCP_DOCS_BEARER_TOKEN'),
      /auth bearer=missing/,
    )
    assert.equal(formatAuthDoctorLine([]), 'auth=none')
  })
})

describe('resolvePluginAuthStatuses multi', () => {
  it('resolves none_required for empty auth resource', async () => {
    const statuses = await resolvePluginAuthStatuses(
      [
        {
          pluginId: 'p',
          enabled: true,
          resources: [{ resourceId: 'none', kind: 'env_ref' }],
        },
      ],
      { env: {} },
    )
    assert.equal(statuses[0]?.status, 'none_required')
  })
})
