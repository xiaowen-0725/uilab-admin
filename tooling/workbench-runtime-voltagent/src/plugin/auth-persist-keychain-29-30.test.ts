/**
 * #29 user-level AuthBinding persistence + #30 Keychain SecretStore / migration.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  createPersistedAuthBindingStore,
  defaultRuntimeConfigDir,
  loadAuthBindingSnapshot,
  parseAuthBindingSnapshot,
  resolveAuthBindingsFilePath,
} from './auth-binding-persist.js'
import {
  resolveAuthResourceStatus,
} from './auth-status.js'
import { resolveMcpBearerToken } from './mcp-loader.js'
import { BUILTIN_MCP_DOCS_PLUGIN } from './builtins.js'
import { createPluginRegistry } from './registry.js'
import {
  createDefaultSecretStore,
  createEnvSecretStore,
  createKeychainSecretStore,
  migrateEnvSecretsToKeychain,
  resolveCredentialMaterial,
  resolveKeychainCapability,
} from './secret-store.js'

const SENTINEL = 'sentinel-pat-for-tests-only-xyz'

async function tempRuntimeDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'uilab-runtime-'))
}

describe('#29 defaultRuntimeConfigDir', () => {
  it('uses UILAB_RUNTIME_DIR when set', () => {
    assert.equal(
      defaultRuntimeConfigDir({ UILAB_RUNTIME_DIR: '/tmp/custom-uilab' }),
      path.resolve('/tmp/custom-uilab'),
    )
  })

  it('defaults under home .uilab/runtime', () => {
    const dir = defaultRuntimeConfigDir({}, () => '/Users/demo')
    assert.equal(dir, path.join('/Users/demo', '.uilab', 'runtime'))
    assert.ok(!dir.includes('workspace'))
  })
})

describe('#29 parseAuthBindingSnapshot safety', () => {
  it('accepts non-secret bindings', () => {
    const snap = parseAuthBindingSnapshot(
      JSON.stringify({
        schemaVersion: 1,
        bindings: [
          {
            pluginId: 'mcp.docs',
            resourceId: 'bearer',
            kind: 'static_bearer',
            secretRef: { backend: 'keychain', account: 'uilab:mcp.docs:bearer:env' },
            loginHint: 'ok',
          },
        ],
        revoked: ['other::r'],
      }),
    )
    assert.equal(snap.bindings.length, 1)
    assert.equal(snap.bindings[0]!.secretRef?.backend, 'keychain')
    assert.deepEqual(snap.revoked, ['other::r'])
  })

  it('rejects inline secret values on secretRef', () => {
    assert.throws(
      () =>
        parseAuthBindingSnapshot(
          JSON.stringify({
            schemaVersion: 1,
            bindings: [
              {
                pluginId: 'p',
                resourceId: 'r',
                kind: 'static_bearer',
                secretRef: {
                  backend: 'keychain',
                  account: 'a',
                  value: 'ghp_secret',
                },
              },
            ],
            revoked: [],
          }),
        ),
      /secret|内联/,
    )
  })
})

describe('#29 createPersistedAuthBindingStore round-trip', () => {
  it('upsert/clear survive process restart via disk', async () => {
    const root = await tempRuntimeDir()
    try {
      const store1 = await createPersistedAuthBindingStore({ rootDir: root })
      store1.upsert({
        pluginId: 'mcp.docs',
        resourceId: 'bearer',
        kind: 'static_bearer',
        secretRef: { backend: 'keychain', account: 'uilab:mcp.docs:bearer:env' },
        loginHint: 'Keychain PAT',
      })
      store1.clear('github', 'api')

      const filePath = resolveAuthBindingsFilePath(root)
      const raw = await readFile(filePath, 'utf8')
      assert.doesNotMatch(raw, /ghp_|sk-|Bearer /i)
      assert.match(raw, /keychain/)
      assert.match(raw, /uilab:mcp\.docs:bearer:env/)

      const store2 = await createPersistedAuthBindingStore({ rootDir: root })
      const b = store2.get('mcp.docs', 'bearer')
      assert.equal(b?.kind, 'static_bearer')
      assert.equal(
        b?.secretRef && b.secretRef.backend === 'keychain'
          ? b.secretRef.account
          : null,
        'uilab:mcp.docs:bearer:env',
      )
      assert.equal(store2.isRevoked('github', 'api'), true)

      // status path uses reloaded binding + keychain material
      const keychain = createKeychainSecretStore({ mode: 'fake' })
      await keychain.set!(
        { backend: 'keychain', account: 'uilab:mcp.docs:bearer:env' },
        SENTINEL,
      )
      const st = await resolveAuthResourceStatus(
        'mcp.docs',
        {
          resourceId: 'bearer',
          kind: 'static_bearer',
          envNames: ['MCP_DOCS_BEARER_TOKEN'],
        },
        true,
        {
          store: keychain,
          bindingStore: store2,
          env: {},
        },
      )
      assert.equal(st.status, 'connected')
      assert.doesNotMatch(JSON.stringify(st), new RegExp(SENTINEL))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('loadAuthBindingSnapshot returns null for missing file', async () => {
    const root = await tempRuntimeDir()
    try {
      const snap = await loadAuthBindingSnapshot(
        resolveAuthBindingsFilePath(root),
      )
      assert.equal(snap, null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('#30 createKeychainSecretStore', () => {
  it('fake mode set/resolve/clear', async () => {
    assert.equal(resolveKeychainCapability({ mode: 'fake' }), 'fake')
    const store = createKeychainSecretStore({ mode: 'fake' })
    assert.equal(store.capability, 'fake')
    const ref = { backend: 'keychain' as const, account: 'TEST_PAT' }
    assert.equal(await store.resolve(ref), null)
    await store.set!(ref, SENTINEL)
    assert.equal(await store.resolve(ref), SENTINEL)
    await store.clear!(ref)
    assert.equal(await store.resolve(ref), null)
  })

  it('unsupported mode: resolve null, set throws Chinese', async () => {
    assert.equal(
      resolveKeychainCapability({ mode: 'unsupported' }),
      'unsupported',
    )
    const store = createKeychainSecretStore({ mode: 'unsupported' })
    assert.equal(
      await store.resolve({ backend: 'keychain', account: 'x' }),
      null,
    )
    await assert.rejects(
      () => store.set!({ backend: 'keychain', account: 'x' }, 'v'),
      /不支持|Keychain/,
    )
  })

  it('auto on non-darwin → unsupported', () => {
    assert.equal(
      resolveKeychainCapability({ mode: 'auto', platform: 'linux' }),
      'unsupported',
    )
  })

  it('auto on darwin → available', () => {
    assert.equal(
      resolveKeychainCapability({ mode: 'auto', platform: 'darwin' }),
      'available',
    )
  })

  it('credential material from fake keychain is injectable as bearer', async () => {
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    await keychain.set!(
      { backend: 'keychain', account: 'uilab:mcp.docs:bearer:env' },
      SENTINEL,
    )
    const material = await resolveCredentialMaterial(
      {
        pluginId: 'mcp.docs',
        resourceId: 'bearer',
        kind: 'static_bearer',
        secretRef: { backend: 'keychain', account: 'uilab:mcp.docs:bearer:env' },
      },
      keychain,
    )
    assert.equal(material.status, 'connected')
    assert.equal(material.bearerToken, SENTINEL)

    const contrib = BUILTIN_MCP_DOCS_PLUGIN.contributes!.mcp![0]!
    const token = resolveMcpBearerToken(
      contrib,
      { MCP_DOCS_BEARER_TOKEN: 'env-leftover' },
      { authEnforced: true, authMaterial: material },
    )
    assert.equal(token, SENTINEL)
  })

  it('migrateEnvSecretsToKeychain copies env into keychain accounts', async () => {
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    const result = await migrateEnvSecretsToKeychain(
      ['MCP_DOCS_BEARER_TOKEN', 'EMPTY', 'MISSING'],
      {
        env: { MCP_DOCS_BEARER_TOKEN: SENTINEL, EMPTY: '' },
        keychain,
      },
    )
    assert.equal(result.migrated.length, 1)
    assert.equal(result.migrated[0]!.account, 'MCP_DOCS_BEARER_TOKEN')
    assert.ok(result.skipped.length >= 2)
    assert.equal(
      await keychain.resolve({
        backend: 'keychain',
        account: 'MCP_DOCS_BEARER_TOKEN',
      }),
      SENTINEL,
    )
  })
})

describe('#30 createDefaultSecretStore composite', () => {
  it('resolves env and fake keychain', async () => {
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    await keychain.set!({ backend: 'keychain', account: 'K' }, SENTINEL)
    const store = createDefaultSecretStore(
      { E: 'from-env' },
      { keychain },
    )
    assert.equal(
      await store.resolve({ backend: 'env', envName: 'E' }, { E: 'from-env' }),
      'from-env',
    )
    assert.equal(
      await store.resolve({ backend: 'keychain', account: 'K' }),
      SENTINEL,
    )
  })
})

describe('#29+#30 registry inject with keychain binding', () => {
  it('connected via keychain material on docs MCP', async () => {
    let seenAuth: string | undefined
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    await keychain.set!(
      { backend: 'keychain', account: 'uilab:mcp.docs:bearer:env' },
      SENTINEL,
    )
    const root = await tempRuntimeDir()
    try {
      const bindings = await createPersistedAuthBindingStore({ rootDir: root })
      bindings.upsert({
        pluginId: 'mcp.docs',
        resourceId: 'bearer',
        kind: 'static_bearer',
        secretRef: { backend: 'keychain', account: 'uilab:mcp.docs:bearer:env' },
      })

      const reg = createPluginRegistry({
        env: { MCP_DOCS_URL: 'https://mcp.example/docs' },
        builtins: [BUILTIN_MCP_DOCS_PLUGIN],
        secretStore: keychain,
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
      const result = await reg.load()
      assert.equal(
        result.authStatuses.find((a) => a.pluginId === 'mcp.docs')?.status,
        'connected',
      )
      assert.equal(seenAuth, `Bearer ${SENTINEL}`)
      await result.disconnect()

      // second process: reload bindings from disk, same inject
      const bindings2 = await createPersistedAuthBindingStore({ rootDir: root })
      const reg2 = createPluginRegistry({
        env: { MCP_DOCS_URL: 'https://mcp.example/docs' },
        builtins: [BUILTIN_MCP_DOCS_PLUGIN],
        secretStore: keychain,
        authBindingStore: bindings2,
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
      const result2 = await reg2.load()
      assert.equal(
        result2.authStatuses.find((a) => a.pluginId === 'mcp.docs')?.status,
        'connected',
      )
      assert.equal(seenAuth, `Bearer ${SENTINEL}`)
      await result2.disconnect()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
