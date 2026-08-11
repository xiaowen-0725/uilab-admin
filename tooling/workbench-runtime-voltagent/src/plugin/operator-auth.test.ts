/**
 * #32 operator auth login | logout | status
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { BUILTIN_MCP_DOCS_PLUGIN, BUILTIN_PLUGINS } from './builtins.js'
import { createPersistedAuthBindingStore } from './auth-binding-persist.js'
import {
  runAuthLogin,
  runAuthLogout,
  runAuthStatus,
} from './operator-auth.js'
import { createPluginRegistry } from './registry.js'
import {
  createAuthBindingStore,
  createDefaultSecretStore,
  createKeychainSecretStore,
} from './secret-store.js'

const SENTINEL = 'sentinel-operator-auth-token-xyz'

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'uilab-auth-cli-'))
}

describe('#32 runAuthStatus', () => {
  it('reports missing without secrets in output', async () => {
    const report = await runAuthStatus({
      env: {},
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      persistAuthBindings: false,
      authBindingStore: createAuthBindingStore(),
      secretStore: createKeychainSecretStore({ mode: 'fake' }),
    })
    try {
      const docs = report.rows.find((r) => r.pluginId === 'mcp.docs')
      assert.equal(docs?.status, 'missing')
      assert.doesNotMatch(report.text, /sk-|ghp_|password=/i)
      assert.doesNotMatch(JSON.stringify(report.json), /sk-|ghp_/)
    } finally {
      await report.disconnect()
    }
  })
})

describe('#32 runAuthLogin / logout', () => {
  it('login from-env to keychain → status connected; logout revokes env leftovers', async () => {
    const root = await tempDir()
    try {
      const keychain = createKeychainSecretStore({ mode: 'fake' })
      const secretStore = createDefaultSecretStore(
        {
          MCP_DOCS_BEARER_TOKEN: SENTINEL,
          UILAB_KEYCHAIN_MODE: 'fake',
        },
        { keychain },
      )
      const bindings = await createPersistedAuthBindingStore({
        rootDir: root,
      })

      const login = await runAuthLogin({
        env: {
          MCP_DOCS_BEARER_TOKEN: SENTINEL,
          UILAB_KEYCHAIN_MODE: 'fake',
        },
        builtins: BUILTIN_PLUGINS,
        pluginId: 'mcp.docs',
        fromEnv: 'MCP_DOCS_BEARER_TOKEN',
        secretStore,
        authBindingStore: bindings,
        runtimeConfigDir: root,
      })
      try {
        assert.equal(login.ok, true)
        assert.match(login.text, /keychain|已登录/)
        assert.doesNotMatch(login.text, new RegExp(SENTINEL))
        assert.equal(
          await keychain.resolve({
            backend: 'keychain',
            account: 'uilab:v1:8.mcp.docs:6.bearer:env',
          }),
          SENTINEL,
        )
      } finally {
        await login.disconnect()
      }

      // Inject path: MCP Authorization uses keychain material despite no env in resolve overlay... 
      // status via same stores
      const status = await runAuthStatus({
        env: {
          // leftover env still present
          MCP_DOCS_BEARER_TOKEN: SENTINEL,
          UILAB_KEYCHAIN_MODE: 'fake',
        },
        builtins: [BUILTIN_MCP_DOCS_PLUGIN],
        secretStore,
        authBindingStore: bindings,
        persistAuthBindings: false,
      })
      try {
        assert.equal(
          status.rows.find((r) => r.pluginId === 'mcp.docs')?.status,
          'connected',
        )
      } finally {
        await status.disconnect()
      }

      const logout = await runAuthLogout({
        env: {
          MCP_DOCS_BEARER_TOKEN: SENTINEL,
          UILAB_KEYCHAIN_MODE: 'fake',
        },
        builtins: BUILTIN_PLUGINS,
        pluginId: 'mcp.docs',
        secretStore,
        authBindingStore: bindings,
        runtimeConfigDir: root,
      })
      try {
        assert.equal(logout.ok, true)
        assert.match(logout.text, /登出|撤销/)
        assert.doesNotMatch(logout.text, new RegExp(SENTINEL))
      } finally {
        await logout.disconnect()
      }

      // After logout: revoked even with env leftover
      const after = await runAuthStatus({
        env: {
          MCP_DOCS_BEARER_TOKEN: SENTINEL,
          UILAB_KEYCHAIN_MODE: 'fake',
        },
        builtins: [BUILTIN_MCP_DOCS_PLUGIN],
        secretStore,
        authBindingStore: bindings,
        persistAuthBindings: false,
      })
      try {
        assert.equal(
          after.rows.find((r) => r.pluginId === 'mcp.docs')?.status,
          'missing',
        )
      } finally {
        await after.disconnect()
      }

      // Registry inject: no Authorization
      let seenAuth: string | undefined
      const reg = createPluginRegistry({
        env: {
          MCP_DOCS_URL: 'https://mcp.example/docs',
          MCP_DOCS_BEARER_TOKEN: SENTINEL,
        },
        builtins: [BUILTIN_MCP_DOCS_PLUGIN],
        secretStore,
        authBindingStore: bindings,
        host: {
          getTools: async (servers) => {
            const docs = servers.docs as {
              requestInit?: { headers?: Record<string, string> }
            }
            seenAuth = docs?.requestInit?.headers?.Authorization
            return {
              tools: [
                {
                  name: 'docs_read_document',
                  description: 'r',
                  parameters: {},
                  execute: async () => ({}),
                } as any,
              ],
              disconnect: async () => {},
            }
          },
        },
      })
      const loaded = await reg.load()
      assert.equal(seenAuth, undefined)
      await loaded.disconnect()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('login without --from-env when env empty fails safely', async () => {
    const report = await runAuthLogin({
      env: { UILAB_KEYCHAIN_MODE: 'fake' },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      pluginId: 'mcp.docs',
      fromEnv: 'MCP_DOCS_BEARER_TOKEN',
      authBindingStore: createAuthBindingStore(),
      secretStore: createKeychainSecretStore({ mode: 'fake' }),
      persistAuthBindings: false,
    })
    try {
      assert.equal(report.ok, false)
      assert.match(report.text, /为空|from-env/)
    } finally {
      await report.disconnect()
    }
  })

  it('cli_session login returns loginHint without secrets', async () => {
    const report = await runAuthLogin({
      env: {},
      builtins: BUILTIN_PLUGINS,
      pluginId: 'cli.feishu',
      authBindingStore: createAuthBindingStore(),
      secretStore: createKeychainSecretStore({ mode: 'fake' }),
      persistAuthBindings: false,
    })
    try {
      assert.equal(report.ok, true)
      assert.match(report.text, /cli_session|lark-cli/)
    } finally {
      await report.disconnect()
    }
  })
})
