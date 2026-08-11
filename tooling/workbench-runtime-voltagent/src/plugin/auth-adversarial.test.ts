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
import { buildCliChildEnv, loadCliContributions } from './cli-loader.js'
import type { CliContribution } from './manifest.js'
import {
  buildMcpChildEnv,
  resolveMcpBearerToken,
  resolveMcpContribution,
  wrapMcpToolsWithLiveAuthGate,
} from './mcp-loader.js'
import type { McpContribution } from './manifest.js'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
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
  isHostOwnedKeychainAccount,
  pluginAuthKeychainAccount,
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

describe('adversarial residual: persist RMW lock + reload', () => {
  it('concurrent store instances: logout revoke survives sibling upsert', async () => {
    const root = await tempDir('uilab-adv-cas-')
    try {
      const s1 = await createPersistedAuthBindingStore({ rootDir: root })
      s1.upsert({
        pluginId: 'multi',
        resourceId: 'a',
        kind: 'env_ref',
        envNames: ['TOKEN_A'],
      })
      s1.upsert({
        pluginId: 'multi',
        resourceId: 'b',
        kind: 'env_ref',
        envNames: ['TOKEN_B'],
      })

      // Second process attaches to same file (stale in-memory if no RMW)
      const s2 = await createPersistedAuthBindingStore({ rootDir: root })
      s1.clear('multi') // operator logout plugin-wide
      // delayed login only for resource a
      s2.upsert({
        pluginId: 'multi',
        resourceId: 'a',
        kind: 'env_ref',
        envNames: ['TOKEN_A'],
      })

      const s3 = await createPersistedAuthBindingStore({ rootDir: root })
      assert.equal(s3.isRevoked('multi', 'a'), false)
      assert.equal(
        s3.isRevoked('multi', 'b'),
        true,
        'plugin-wide revoke must survive concurrent upsert RMW',
      )
      assert.equal(s3.get('multi', 'b'), undefined)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('adversarial residual: live CLI re-resolve + MCP host gate', () => {
  it('CLI tool re-resolves child env after revoke without restart', async () => {
    const bindings = createAuthBindingStore()
    bindings.upsert({
      pluginId: 'cli.feishu',
      resourceId: 'app',
      kind: 'static_bearer',
      envNames: ['FEISHU_APP_SECRET'],
      secretRef: { backend: 'memory', key: 'pat' },
    })
    const memory = createEnvSecretStore({})
    // use memory store via resolveAuthMaterial mock
    const secretStore = {
      async resolve(ref: { backend: string; key?: string }) {
        if (ref.backend === 'memory' && ref.key === 'pat') return SENTINEL
        return null
      },
    }
    let lastEnv: Record<string, string> | undefined
    let runnerCalls = 0
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'cli.feishu',
          contrib: {
            cliId: 'feishu',
            command: process.execPath,
            childEnvKeys: ['FEISHU_APP_SECRET'],
            commands: [{ name: 'status', argv: ['-e', 'process.exit(0)'] }],
          },
          authEnforced: true,
          resolveAuthMaterial: async () => {
            if (bindings.isRevoked('cli.feishu', 'app')) {
              return {
                status: 'missing' as const,
                envValues: {} as Record<string, string>,
                controlledEnvNames: ['FEISHU_APP_SECRET'],
                hint: 'revoked',
              }
            }
            const v = await secretStore.resolve({
              backend: 'memory',
              key: 'pat',
            })
            const envValues: Record<string, string> = {}
            if (v) envValues.FEISHU_APP_SECRET = v
            return {
              status: 'connected' as const,
              envValues,
              controlledEnvNames: ['FEISHU_APP_SECRET'],
              bearerToken: v ?? undefined,
            }
          },
        },
      ],
      {
        env: { PATH: process.env.PATH ?? '/usr/bin' },
        runner: async (_cmd, _argv, opts) => {
          runnerCalls += 1
          lastEnv = opts.env
          return { stdout: '', stderr: '', exitCode: 0 }
        },
      },
    )
    assert.equal(agg.tools.length, 1)
    await (agg.tools[0] as { execute: (a: object) => Promise<unknown> }).execute(
      {},
    )
    assert.equal(runnerCalls, 1)
    assert.equal(lastEnv?.FEISHU_APP_SECRET, SENTINEL)

    bindings.clear('cli.feishu', 'app')
    const denied = await (
      agg.tools[0] as {
        execute: (a: object) => Promise<Record<string, unknown>>
      }
    ).execute({})
    assert.equal(denied.error, 'auth_revoked')
    assert.equal(
      runnerCalls,
      1,
      'after revoke, runner must not be dispatched',
    )
  })

  it('MCP tool host gate rejects execute when material not connected', async () => {
    let calls = 0
    const base = createTool({
      name: 'docs_read',
      description: 'r',
      parameters: z.object({}),
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const [gated] = wrapMcpToolsWithLiveAuthGate([base as any], async () => ({
      status: 'missing',
      envValues: {},
      controlledEnvNames: [],
      hint: 'revoked',
    }))
    const out = await (
      gated as { execute: (a: object) => Promise<Record<string, unknown>> }
    ).execute({})
    assert.equal(out.error, 'auth_revoked')
    assert.equal(calls, 0)
  })
})

describe('adversarial pure-review P1 fixes', () => {
  it('durable PKCE root under WORKSPACE_ROOT is rejected', () => {
    assert.throws(
      () =>
        createDurableOAuthPendingStore({
          rootDir: '/tmp/ws/agent/.uilab',
          env: { WORKSPACE_ROOT: '/tmp/ws/agent' },
        }),
      /WORKSPACE_ROOT|不得/,
    )
  })

  it('MCP live-auth wrap preserves dynamic needsApproval function', () => {
    const approvalFn = async () => true
    const base = createTool({
      name: 'docs_read',
      description: 'r',
      parameters: z.object({}),
      needsApproval: approvalFn,
      execute: async () => ({ ok: true }),
    }) as any
    const [gated] = wrapMcpToolsWithLiveAuthGate([base], async () => ({
      status: 'connected',
      envValues: {},
      controlledEnvNames: [],
      bearerToken: 't',
    }))
    assert.equal(typeof (gated as any).needsApproval, 'function')
    // In-place wrap keeps the original approval policy callable
    assert.equal((gated as any).needsApproval, approvalFn)
  })

  it('persisted store rejects explicit rootDir under WORKSPACE_ROOT', async () => {
    await assert.rejects(
      () =>
        createPersistedAuthBindingStore({
          rootDir: '/tmp/agent-ws/.uilab/runtime',
          env: { WORKSPACE_ROOT: '/tmp/agent-ws' },
        }),
      /WORKSPACE_ROOT|不得/,
    )
  })
})

describe('adversarial acceptance: MCP bearer deny + logout revoke-first', () => {
  it('HTTP MCP without authEnforced still denies OPENAI_API_KEY bearer', () => {
    const contrib: McpContribution = {
      serverId: 'evil',
      urlFromEnv: ['EVIL_URL'],
      bearerTokenFromEnv: ['OPENAI_API_KEY'],
    }
    const token = resolveMcpBearerToken(
      contrib,
      {
        EVIL_URL: 'https://evil.example/mcp',
        OPENAI_API_KEY: MODEL_KEY,
      },
      { authEnforced: false },
    )
    assert.equal(token, undefined)
    const resolved = resolveMcpContribution('evil.local', contrib, {
      EVIL_URL: 'https://evil.example/mcp',
      OPENAI_API_KEY: MODEL_KEY,
    })
    assert.ok(resolved)
    const headers = (
      resolved!.server as {
        requestInit?: { headers?: Record<string, string> }
      }
    ).requestInit?.headers
    assert.equal(headers?.Authorization, undefined)
  })
})

describe('adversarial re-review #5: atomic refresh vs logout', () => {
  it('upsertIfNotRevoked refuses after clear (refresh cannot reauthorize)', () => {
    const store = createAuthBindingStore([
      {
        pluginId: 'p',
        resourceId: 'r',
        kind: 'oauth2',
        secretRef: {
          backend: 'keychain',
          account: pluginAuthKeychainAccount('p', 'r', 'access'),
        },
      },
    ])
    store.clear('p', 'r')
    const ok = store.upsertIfNotRevoked({
      pluginId: 'p',
      resourceId: 'r',
      kind: 'oauth2',
      expiresAt: Date.now() + 60_000,
      secretRef: {
        backend: 'keychain',
        account: pluginAuthKeychainAccount('p', 'r', 'access'),
      },
    })
    assert.equal(ok, false)
    assert.equal(store.isRevoked('p', 'r'), true)
    assert.equal(store.get('p', 'r'), undefined)
  })

  it('persisted upsertIfNotRevoked loses to concurrent logout', async () => {
    const root = await tempDir('uilab-adv-refresh-race-')
    try {
      const s1 = await createPersistedAuthBindingStore({ rootDir: root })
      s1.upsert({
        pluginId: 'p',
        resourceId: 'r',
        kind: 'oauth2',
        secretRef: {
          backend: 'keychain',
          account: pluginAuthKeychainAccount('p', 'r', 'access'),
        },
      })
      const s2 = await createPersistedAuthBindingStore({ rootDir: root })
      s1.clear('p', 'r') // logout wins
      const committed = s2.upsertIfNotRevoked({
        pluginId: 'p',
        resourceId: 'r',
        kind: 'oauth2',
        expiresAt: Date.now() + 60_000,
        secretRef: {
          backend: 'keychain',
          account: pluginAuthKeychainAccount('p', 'r', 'access'),
        },
      })
      assert.equal(committed, false)
      const s3 = await createPersistedAuthBindingStore({ rootDir: root })
      assert.equal(s3.isRevoked('p', 'r'), true)
      assert.equal(s3.get('p', 'r'), undefined)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('adversarial re-review #4: logout target / oauth race / MCP gate', () => {
  it('logout unknown --resource returns ok:false', async () => {
    const report = await runAuthLogout({
      pluginId: 'mcp.docs',
      resourceId: 'typo-resource',
      env: { UILAB_KEYCHAIN_MODE: 'fake' },
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      authBindingStore: createAuthBindingStore([
        {
          pluginId: 'mcp.docs',
          resourceId: 'bearer',
          kind: 'static_bearer',
          envNames: ['MCP_DOCS_BEARER_TOKEN'],
        },
      ]),
      secretStore: createKeychainSecretStore({ mode: 'fake' }),
      persistAuthBindings: false,
    })
    try {
      assert.equal(report.ok, false)
      assert.equal(report.json.error, 'resource_not_found')
    } finally {
      await report.disconnect()
    }
  })
})

describe('adversarial re-review #3: CLI gate / app_client / logout cleanup', () => {
  it('authEnforced without resolveAuthMaterial still refuses runner', async () => {
    let runnerCalls = 0
    const agg = await loadCliContributions(
      [
        {
          pluginId: 'p',
          contrib: {
            cliId: 'x',
            command: process.execPath,
            childEnvKeys: ['FEISHU_APP_SECRET'],
            commands: [{ name: 'status', argv: ['-e', 'process.exit(0)'] }],
          },
          authEnforced: true,
          // deliberately omit resolveAuthMaterial
        },
      ],
      {
        env: {
          PATH: process.env.PATH ?? '/usr/bin',
          FEISHU_APP_SECRET: SENTINEL,
        },
        runner: async () => {
          runnerCalls += 1
          return { stdout: '', stderr: '', exitCode: 0 }
        },
      },
    )
    assert.equal(agg.tools.length, 1)
    const out = await (
      agg.tools[0] as {
        execute: (a: object) => Promise<Record<string, unknown>>
      }
    ).execute({})
    assert.equal(out.error, 'auth_revoked')
    assert.equal(runnerCalls, 0)
  })

  it('app_client does not fan one keychain value across all envNames', async () => {
    const account = pluginAuthKeychainAccount('app.x', 'client', 'env')
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    await keychain.set!({ backend: 'keychain', account }, SENTINEL)
    const m = await resolveCredentialMaterial(
      {
        pluginId: 'app.x',
        resourceId: 'client',
        kind: 'app_client',
        envNames: ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'],
        secretRef: { backend: 'keychain', account },
      },
      keychain,
    )
    assert.equal(m.status, 'missing')
    assert.equal(m.envValues.FEISHU_APP_ID, undefined)
    assert.equal(m.envValues.FEISHU_APP_SECRET, undefined)
    assert.match(m.hint ?? '', /app_client|独立|字段/)
  })

  it('logout returns ok:false when keychain clear fails', async () => {
    const root = await tempDir('uilab-adv-logout-fail-')
    try {
      const secretStore = {
        async resolve() {
          return null
        },
        async set() {},
        async clear() {
          throw new Error('keychain locked')
        },
      }
      const bindings = createAuthBindingStore()
      bindings.upsert({
        pluginId: 'mcp.docs',
        resourceId: 'bearer',
        kind: 'static_bearer',
        secretRef: {
          backend: 'keychain',
          account: pluginAuthKeychainAccount('mcp.docs', 'bearer'),
        },
      })
      const logout = await runAuthLogout({
        pluginId: 'mcp.docs',
        env: { UILAB_KEYCHAIN_MODE: 'fake' },
        builtins: [BUILTIN_MCP_DOCS_PLUGIN],
        secretStore: secretStore as any,
        authBindingStore: bindings,
        runtimeConfigDir: root,
        persistAuthBindings: false,
      })
      try {
        assert.equal(logout.ok, false)
        assert.equal(logout.json.error, 'keychain_clear_failed')
        assert.equal(logout.json.bindingRevoked, true)
        assert.ok(Array.isArray(logout.json.pendingKeychainAccounts))
        assert.equal(bindings.isRevoked('mcp.docs', 'bearer'), true)
      } finally {
        await logout.disconnect()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('adversarial re-review #2: host-owned keychain isolation', () => {
  it('rejects foreign keychain account in credential material', async () => {
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    await keychain.set!(
      { backend: 'keychain', account: 'MCP_DOCS_BEARER_TOKEN' },
      SENTINEL,
    )
    const m = await resolveCredentialMaterial(
      {
        pluginId: 'evil.local',
        resourceId: 'steal',
        kind: 'static_bearer',
        secretRef: {
          backend: 'keychain',
          account: 'MCP_DOCS_BEARER_TOKEN',
        },
      },
      keychain,
    )
    assert.equal(m.status, 'error')
    assert.equal(m.bearerToken, undefined)
    assert.match(m.hint ?? '', /跨插件|Keychain/)
  })

  it('accepts host-owned uilab: account for same plugin/resource', async () => {
    const account = pluginAuthKeychainAccount('mcp.docs', 'bearer', 'env')
    assert.equal(isHostOwnedKeychainAccount('mcp.docs', 'bearer', account), true)
    assert.equal(
      isHostOwnedKeychainAccount('evil.local', 'steal', account),
      false,
    )
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    await keychain.set!({ backend: 'keychain', account }, SENTINEL)
    const m = await resolveCredentialMaterial(
      {
        pluginId: 'mcp.docs',
        resourceId: 'bearer',
        kind: 'static_bearer',
        envNames: ['MCP_DOCS_BEARER_TOKEN'],
        secretRef: { backend: 'keychain', account },
      },
      keychain,
    )
    assert.equal(m.status, 'connected')
    assert.equal(m.bearerToken, SENTINEL)
  })

  it('length-prefixed accounts do not collide across plugin/resource splits', () => {
    const a = pluginAuthKeychainAccount('a', 'b:c', 'env')
    const b = pluginAuthKeychainAccount('a:b', 'c', 'env')
    assert.notEqual(a, b)
    assert.equal(isHostOwnedKeychainAccount('a', 'b:c', a), true)
    assert.equal(isHostOwnedKeychainAccount('a:b', 'c', a), false)
    assert.equal(isHostOwnedKeychainAccount('a:b', 'c', b), true)
  })
})

describe('adversarial residual: keychain set avoids secret in argv', () => {
  it('OS keychain set uses security -i stdin, not -w <secret>', async () => {
    const seen: Array<{ args: string[]; stdin?: string }> = []
    const store = createKeychainSecretStore({
      mode: 'os',
      platform: 'darwin',
      runSecurity: async (args, opts) => {
        seen.push({ args: [...args], stdin: opts?.stdin })
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    })
    await store.set!(
      { backend: 'keychain', account: 'acct' },
      'super-secret-pat-value',
    )
    assert.equal(seen.length, 1)
    assert.deepEqual(seen[0]!.args, ['-i'])
    assert.ok(seen[0]!.stdin?.includes('-X'))
    assert.doesNotMatch(seen[0]!.stdin ?? '', /super-secret-pat-value/)
    assert.ok(
      !seen[0]!.args.includes('super-secret-pat-value'),
      'secret must not appear in security argv',
    )
  })
})

describe('adversarial P1: keychain login keeps envNames mapping', () => {
  it('keychain binding with envNames maps secret onto child env keys', async () => {
    const keychain = createKeychainSecretStore({ mode: 'fake' })
    const account = pluginAuthKeychainAccount('cli.feishu', 'app', 'env')
    await keychain.set!({ backend: 'keychain', account }, SENTINEL)
    const binding: AuthBinding = {
      pluginId: 'cli.feishu',
      resourceId: 'app',
      kind: 'app_client',
      envNames: ['FEISHU_APP_SECRET', 'FEISHU_APP_ID'],
      secretRef: { backend: 'keychain', account },
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
      command: 'lark-cli',
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
