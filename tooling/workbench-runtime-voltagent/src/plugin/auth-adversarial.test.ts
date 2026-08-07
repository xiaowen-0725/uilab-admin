/**
 * Adversarial regression tests for Codex auth review 2026-08-07 (P0/P1).
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  assertRuntimeConfigOutsideWorkspace,
  createPersistedAuthBindingStore,
  parseAuthBindingSnapshot,
} from './auth-binding-persist.js'
import { buildCliChildEnv } from './cli-loader.js'
import type { CliContribution } from './manifest.js'
import { buildMcpChildEnv } from './mcp-loader.js'
import type { McpContribution } from './manifest.js'
import {
  beginOAuthAuthorization,
  createDurableOAuthPendingStore,
  createFakeAuthorizationServer,
  completeOAuthAuthorization,
} from './oauth.js'
import { runAuthLogin, runAuthLogout } from './operator-auth.js'
import { BUILTIN_MCP_DOCS_PLUGIN } from './builtins.js'
import {
  createAuthBindingStore,
  createEnvSecretStore,
  createKeychainSecretStore,
  resolveCredentialMaterial,
  snapshotAuthBindingStore,
} from './secret-store.js'
import type { AuthBinding } from './types.js'
import { loadAuthBindingSnapshot } from './auth-binding-persist.js'

const SENTINEL = 'sentinel-adversarial-token-xyz'
const MODEL_KEY = 'sk-openai-should-never-inject-xyz'

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

describe('adversarial P0: model-key hard-deny after auth overlay', () => {
  it('buildMcpChildEnv does not re-inject OPENAI_API_KEY from material', () => {
    const contrib: McpContribution = {
      serverId: 'hostile',
      commandFromEnv: ['HOSTILE_CMD'],
      childEnvKeys: ['OPENAI_API_KEY', 'FEISHU_APP_ID'],
    }
    const env = {
      HOSTILE_CMD: '/bin/true',
      OPENAI_API_KEY: MODEL_KEY,
      FEISHU_APP_ID: 'app',
    }
    const child = buildMcpChildEnv(contrib, env, {
      authEnforced: true,
      authMaterial: {
        status: 'connected',
        envValues: {
          OPENAI_API_KEY: MODEL_KEY,
          FEISHU_APP_ID: 'from-material',
        },
        controlledEnvNames: ['OPENAI_API_KEY', 'FEISHU_APP_ID'],
      },
    })
    assert.equal(child.OPENAI_API_KEY, undefined, 'modelKeyReadded must be false')
    assert.equal(child.FEISHU_APP_ID, 'from-material')
  })

  it('buildCliChildEnv does not re-inject OPENAI_API_KEY from material', () => {
    const contrib: CliContribution = {
      cliId: 'hostile',
      command: 'hostile-cli',
      childEnvKeys: ['OPENAI_API_KEY', 'FEISHU_APP_SECRET'],
      commands: [{ name: 'x', argv: ['status'] }],
    }
    const child = buildCliChildEnv(
      contrib,
      { OPENAI_API_KEY: MODEL_KEY, FEISHU_APP_SECRET: 'env' },
      {
        authEnforced: true,
        authMaterial: {
          status: 'connected',
          envValues: {
            OPENAI_API_KEY: MODEL_KEY,
            FEISHU_APP_SECRET: SENTINEL,
          },
          controlledEnvNames: ['OPENAI_API_KEY', 'FEISHU_APP_SECRET'],
        },
      },
    )
    assert.equal(child.OPENAI_API_KEY, undefined)
    assert.equal(child.FEISHU_APP_SECRET, SENTINEL)
  })

  it('resolveCredentialMaterial rejects OPENAI_API_KEY envNames', async () => {
    const store = createEnvSecretStore({ OPENAI_API_KEY: MODEL_KEY })
    const m = await resolveCredentialMaterial(
      {
        pluginId: 'hostile',
        resourceId: 'llm',
        kind: 'env_ref',
        envNames: ['OPENAI_API_KEY'],
      },
      store,
    )
    assert.equal(m.status, 'error')
    assert.equal(m.bearerToken, undefined)
    assert.deepEqual(m.envValues, {})
    assert.match(m.hint ?? '', /模型密钥|禁止/)
  })
})

describe('adversarial P1: sibling revoke not undone by one upsert', () => {
  it('plugin-wide clear keeps sibling revoked after re-login one resource', () => {
    const store = createAuthBindingStore([
      {
        pluginId: 'multi',
        resourceId: 'a',
        kind: 'env_ref',
        envNames: ['TOKEN_A'],
      },
      {
        pluginId: 'multi',
        resourceId: 'b',
        kind: 'env_ref',
        envNames: ['TOKEN_B'],
      },
    ])
    store.clear('multi')
    assert.equal(store.isRevoked('multi', 'a'), true)
    assert.equal(store.isRevoked('multi', 'b'), true)

    store.upsert({
      pluginId: 'multi',
      resourceId: 'a',
      kind: 'env_ref',
      envNames: ['TOKEN_A'],
    })
    assert.equal(store.isRevoked('multi', 'a'), false)
    assert.equal(
      store.isRevoked('multi', 'b'),
      true,
      'sibling must stay revoked under plugin-wide *',
    )
    assert.equal(store.isRevoked('multi', 'never-seen'), true)
  })

  it('persist round-trip preserves reauth markers', async () => {
    const root = await tempDir('uilab-adv-revoke-')
    try {
      const s1 = await createPersistedAuthBindingStore({ rootDir: root })
      s1.clear('multi')
      s1.upsert({
        pluginId: 'multi',
        resourceId: 'a',
        kind: 'env_ref',
        envNames: ['TOKEN_A'],
      })
      const snap = snapshotAuthBindingStore(s1)
      assert.ok(snap.revoked.includes('multi::*'))
      assert.ok(snap.revoked.some((k) => k === '!multi::a' || k.startsWith('!')))

      const s2 = await createPersistedAuthBindingStore({ rootDir: root })
      assert.equal(s2.isRevoked('multi', 'a'), false)
      assert.equal(s2.isRevoked('multi', 'b'), true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('adversarial P1: durable PKCE pending across "processes"', () => {
  it('oauth-begin write + oauth-complete read from separate store instances', async () => {
    const root = await tempDir('uilab-adv-pkce-')
    try {
      const as = createFakeAuthorizationServer()
      const pending1 = createDurableOAuthPendingStore({ rootDir: root })
      const begun = beginOAuthAuthorization({
        pluginId: 'mcp.docs',
        resourceId: 'oauth',
        authorizationEndpoint: as.authorizationEndpoint,
        tokenEndpoint: as.tokenEndpoint,
        clientId: as.clientId,
        redirectUri: as.redirectUri,
        scopes: ['mcp'],
        pendingStore: pending1,
      })
      // Simulate new CLI process: new store reading same file
      const pending2 = createDurableOAuthPendingStore({ rootDir: root })
      const challenge = new URL(begun.authorizationUrl).searchParams.get(
        'code_challenge',
      )!
      const code = as.issueCodeForChallenge(challenge)
      const secretStore = createKeychainSecretStore({ mode: 'fake' })
      const bindingStore = createAuthBindingStore()
      const binding = await completeOAuthAuthorization({
        code,
        state: begun.state,
        pendingStore: pending2,
        secretStore,
        bindingStore,
        fetchImpl: as.fetchImpl,
      })
      assert.equal(binding.kind, 'oauth2')
      assert.equal(binding.pluginId, 'mcp.docs')
      const access = await secretStore.resolve(binding.secretRef!)
      assert.ok(access && access.length > 0)

      // One-shot: second complete fails
      await assert.rejects(
        () =>
          completeOAuthAuthorization({
            code,
            state: begun.state,
            pendingStore: createDurableOAuthPendingStore({ rootDir: root }),
            secretStore,
            bindingStore,
            fetchImpl: as.fetchImpl,
          }),
        /无效|过期|CSRF/,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('adversarial P1: multi-resource logout + keychain refresh clear', () => {
  it('logout without --resource clears all plugin bindings and oauth refresh', async () => {
    const root = await tempDir('uilab-adv-logout-')
    try {
      const keychain = createKeychainSecretStore({ mode: 'fake' })
      await keychain.set!(
        { backend: 'keychain', account: 'oauth:multi:r1:access' },
        'access-1',
      )
      await keychain.set!(
        { backend: 'keychain', account: 'oauth:multi:r1:refresh' },
        'refresh-1',
      )
      await keychain.set!(
        { backend: 'keychain', account: 'oauth:multi:r2:access' },
        'access-2',
      )
      await keychain.set!(
        { backend: 'keychain', account: 'oauth:multi:r2:refresh' },
        'refresh-2',
      )

      const bindings = createAuthBindingStore()
      bindings.upsert({
        pluginId: 'multi',
        resourceId: 'r1',
        kind: 'oauth2',
        secretRef: { backend: 'keychain', account: 'oauth:multi:r1:access' },
        oauth: {
          tokenEndpoint: 'https://as.test/token',
          clientId: 'c',
          refreshAccount: 'oauth:multi:r1:refresh',
        },
      })
      bindings.upsert({
        pluginId: 'multi',
        resourceId: 'r2',
        kind: 'oauth2',
        secretRef: { backend: 'keychain', account: 'oauth:multi:r2:access' },
        oauth: {
          tokenEndpoint: 'https://as.test/token',
          clientId: 'c',
          refreshAccount: 'oauth:multi:r2:refresh',
        },
      })

      const logout = await runAuthLogout({
        pluginId: 'multi',
        env: { UILAB_KEYCHAIN_MODE: 'fake' },
        builtins: [],
        secretStore: keychain,
        authBindingStore: bindings,
        runtimeConfigDir: root,
        persistAuthBindings: false,
      })
      try {
        assert.equal(logout.ok, true)
        assert.equal(logout.json.needsSidecarRestart, true)
        const cleared = logout.json.clearedResources as string[]
        assert.ok(cleared.includes('r1'))
        assert.ok(cleared.includes('r2'))
        assert.equal(bindings.get('multi', 'r1'), undefined)
        assert.equal(bindings.get('multi', 'r2'), undefined)
        assert.equal(bindings.isRevoked('multi', 'r1'), true)
        assert.equal(bindings.isRevoked('multi', 'r2'), true)
        assert.equal(
          await keychain.resolve({
            backend: 'keychain',
            account: 'oauth:multi:r1:access',
          }),
          null,
        )
        assert.equal(
          await keychain.resolve({
            backend: 'keychain',
            account: 'oauth:multi:r1:refresh',
          }),
          null,
        )
        assert.equal(
          await keychain.resolve({
            backend: 'keychain',
            account: 'oauth:multi:r2:refresh',
          }),
          null,
        )
      } finally {
        await logout.disconnect()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('adversarial P1: persist path safety + strict SecretRef', () => {
  it('rejects runtime dir under WORKSPACE_ROOT', () => {
    assert.throws(
      () =>
        assertRuntimeConfigOutsideWorkspace('/tmp/ws/agent-writable/.uilab', {
          WORKSPACE_ROOT: '/tmp/ws/agent-writable',
        }),
      /WORKSPACE_ROOT|不得/,
    )
  })

  it('rejects unknown SecretRef fields (no access_token smuggle)', () => {
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
                  access_token: 'smuggle',
                },
              },
            ],
            revoked: [],
          }),
        ),
      /未知字段|access_token|secretRef/,
    )
  })

  it('rejects top-level access_token on binding', () => {
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
                access_token: 'smuggle',
              },
            ],
            revoked: [],
          }),
        ),
      /未知字段|密文|access_token/,
    )
  })

  it('atomic persist writes non-secret file mode content', async () => {
    const root = await tempDir('uilab-adv-atomic-')
    try {
      const store = await createPersistedAuthBindingStore({ rootDir: root })
      store.upsert({
        pluginId: 'p',
        resourceId: 'r',
        kind: 'static_bearer',
        secretRef: { backend: 'keychain', account: 'acct' },
      })
      const raw = await readFile(path.join(root, 'auth-bindings.json'), 'utf8')
      assert.doesNotMatch(raw, /ghp_|sk-|access_token\s*:/i)
      assert.match(raw, /keychain/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('adversarial re-review: operator --from-env model-key bypass', () => {
  it('rejects --from-env OPENAI_API_KEY even when resource envNames look benign', async () => {
    const report = await runAuthLogin({
      env: {
        OPENAI_API_KEY: MODEL_KEY,
        UILAB_KEYCHAIN_MODE: 'fake',
      },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      pluginId: 'mcp.docs',
      fromEnv: 'OPENAI_API_KEY',
      authBindingStore: createAuthBindingStore(),
      secretStore: createKeychainSecretStore({ mode: 'fake' }),
      persistAuthBindings: false,
    })
    try {
      assert.equal(report.ok, false)
      assert.equal(report.json.error, 'model_secret_denied')
      assert.match(report.text, /模型|禁止/)
      assert.doesNotMatch(report.text, new RegExp(MODEL_KEY))
    } finally {
      await report.disconnect()
    }
  })

  it('rejects --from-env not declared on the auth resource', async () => {
    const report = await runAuthLogin({
      env: {
        RANDOM_CONNECTOR_TOKEN: SENTINEL,
        UILAB_KEYCHAIN_MODE: 'fake',
      },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      pluginId: 'mcp.docs',
      fromEnv: 'RANDOM_CONNECTOR_TOKEN',
      authBindingStore: createAuthBindingStore(),
      secretStore: createKeychainSecretStore({ mode: 'fake' }),
      persistAuthBindings: false,
    })
    try {
      assert.equal(report.ok, false)
      assert.equal(report.json.error, 'from_env_not_declared')
    } finally {
      await report.disconnect()
    }
  })
})

describe('adversarial re-review: persist read fail-closed', () => {
  it('loadAuthBindingSnapshot propagates non-ENOENT I/O errors', async () => {
    await assert.rejects(
      () =>
        loadAuthBindingSnapshot('/tmp/does-not-matter.json', {
          readFile: async () => {
            const err = new Error('EACCES permission denied') as Error & {
              code?: string
            }
            err.code = 'EACCES'
            throw err
          },
          writeFile: async () => {},
          mkdir: async () => undefined,
        }),
      /EACCES|permission|读取/,
    )
  })
})

describe('adversarial P1: keychain login keeps envNames mapping', () => {
  it('keychain binding with envNames maps secret onto child env keys', async () => {
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    await keychain.set!(
      { backend: 'keychain', account: 'FEISHU_APP_SECRET' },
      SENTINEL,
    )
    const binding: AuthBinding = {
      pluginId: 'cli.feishu',
      resourceId: 'app',
      kind: 'app_client',
      envNames: ['FEISHU_APP_SECRET', 'FEISHU_APP_ID'],
      secretRef: { backend: 'keychain', account: 'FEISHU_APP_SECRET' },
    }
    // app_client requires all envNames — only secret maps; FEISHU_APP_ID missing → missing
    // For static_bearer style mapping of single secret onto first envNames:
    const material = await resolveCredentialMaterial(
      {
        ...binding,
        kind: 'static_bearer',
        envNames: ['FEISHU_APP_SECRET'],
      },
      keychain,
    )
    assert.equal(material.status, 'connected')
    assert.equal(material.envValues.FEISHU_APP_SECRET, SENTINEL)

    const contrib: CliContribution = {
      cliId: 'feishu',
      command: 'feishu-cli',
      childEnvKeys: ['FEISHU_APP_SECRET'],
      commands: [{ name: 'x', argv: ['auth', 'status'] }],
    }
    const child = buildCliChildEnv(
      contrib,
      { FEISHU_APP_SECRET: 'stale-env' },
      {
        authEnforced: true,
        authMaterial: material,
      },
    )
    assert.equal(child.FEISHU_APP_SECRET, SENTINEL)
  })
})
