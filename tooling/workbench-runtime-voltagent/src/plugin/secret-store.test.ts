import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAuthBindingStore,
  createCompositeSecretStore,
  createEnvSecretStore,
  createKeychainSecretStoreStub,
  createMemorySecretStore,
  resolveAuthStatus,
} from './secret-store.js'
import type { AuthBinding, SecretRef } from './types.js'

describe('createMemorySecretStore', () => {
  it('sets resolves and clears memory refs only', async () => {
    const store = createMemorySecretStore()
    const ref: SecretRef = { backend: 'memory', key: 'pat' }
    assert.equal(await store.resolve(ref), null)
    await store.set!(ref, 'secret-value')
    assert.equal(await store.resolve(ref), 'secret-value')
    await store.clear!(ref)
    assert.equal(await store.resolve(ref), null)
  })

  it('does not resolve env refs', async () => {
    const store = createMemorySecretStore([['x', '1']])
    assert.equal(
      await store.resolve({ backend: 'env', envName: 'x' }),
      null,
    )
  })
})

describe('createEnvSecretStore', () => {
  it('resolves non-empty env names as SecretRef', async () => {
    const store = createEnvSecretStore({
      GITHUB_PAT: 'ghp_test',
      EMPTY: '',
    })
    assert.equal(
      await store.resolve({ backend: 'env', envName: 'GITHUB_PAT' }),
      'ghp_test',
    )
    assert.equal(await store.resolve({ backend: 'env', envName: 'EMPTY' }), null)
    assert.equal(await store.resolve({ backend: 'env', envName: 'MISSING' }), null)
  })
})

describe('createKeychainSecretStoreStub', () => {
  it('resolve returns null; set explains not implemented', async () => {
    const store = createKeychainSecretStoreStub()
    assert.equal(
      await store.resolve({ backend: 'keychain', account: 'gh' }),
      null,
    )
    await assert.rejects(
      () => store.set!({ backend: 'keychain', account: 'gh' }, 'x'),
      /尚未实现|Keychain|不支持/,
    )
  })
})

describe('createCompositeSecretStore', () => {
  it('prefers memory over env', async () => {
    const memory = createMemorySecretStore()
    await memory.set!({ backend: 'memory', key: 't' }, 'from-memory')
    const env = createEnvSecretStore({ T: 'from-env' })
    // different refs — composite tries each store for the same ref
    const store = createCompositeSecretStore([memory, env])
    assert.equal(
      await store.resolve({ backend: 'memory', key: 't' }),
      'from-memory',
    )
    assert.equal(await store.resolve({ backend: 'env', envName: 'T' }), 'from-env')
  })
})

describe('resolveAuthStatus', () => {
  it('none_required when no env or secret ref', async () => {
    const store = createEnvSecretStore({})
    const binding: AuthBinding = {
      pluginId: 'p',
      resourceId: 'r',
      kind: 'env_ref',
    }
    const r = await resolveAuthStatus(binding, store, {})
    assert.equal(r.status, 'none_required')
  })

  it('missing when env absent; connected when present', async () => {
    const store = createEnvSecretStore()
    const binding: AuthBinding = {
      pluginId: 'github',
      resourceId: 'mcp:api',
      kind: 'env_ref',
      envNames: ['GITHUB_PAT'],
      loginHint: '请配置 GITHUB_PAT',
    }
    const missing = await resolveAuthStatus(binding, store, {})
    assert.equal(missing.status, 'missing')
    assert.match(missing.hint ?? '', /GITHUB_PAT|请配置/)
    assert.doesNotMatch(missing.hint ?? '', /ghp_/)

    const ok = await resolveAuthStatus(binding, store, {
      GITHUB_PAT: 'ghp_real_secret_value',
    })
    assert.equal(ok.status, 'connected')
    // hint optional when connected — must not echo secret
    if (ok.hint) assert.doesNotMatch(ok.hint, /ghp_real/)
  })

  it('secretRef env path', async () => {
    const store = createEnvSecretStore({ MY_TOKEN: 'abc' })
    const binding: AuthBinding = {
      pluginId: 'p',
      resourceId: 'r',
      kind: 'static_bearer',
      secretRef: { backend: 'env', envName: 'MY_TOKEN' },
    }
    assert.equal((await resolveAuthStatus(binding, store)).status, 'connected')
    assert.equal(
      (
        await resolveAuthStatus(binding, store, { MY_TOKEN: undefined })
      ).status,
      'missing',
    )
  })

  it('cli_session reports missing with login hint (MVP)', async () => {
    const store = createEnvSecretStore({})
    const r = await resolveAuthStatus(
      {
        pluginId: 'feishu',
        resourceId: 'cli:feishu',
        kind: 'cli_session',
        loginHint: '请先运行 lark-cli auth login',
      },
      store,
    )
    assert.equal(r.status, 'missing')
    assert.match(r.hint ?? '', /lark-cli/)
  })

  it('oauth2 reports missing when no tokens', async () => {
    const r = await resolveAuthStatus(
      {
        pluginId: 'p',
        resourceId: 'mcp:remote',
        kind: 'oauth2',
      },
      createEnvSecretStore({}),
    )
    assert.equal(r.status, 'missing')
    assert.match(r.hint ?? '', /OAuth|login|未登录/i)
  })
})

describe('createAuthBindingStore', () => {
  it('upsertes gets and clears bindings without storing secrets', () => {
    const store = createAuthBindingStore()
    store.upsert({
      pluginId: 'github',
      resourceId: 'api',
      kind: 'env_ref',
      envNames: ['GITHUB_PAT'],
    })
    assert.equal(store.get('github', 'api')?.envNames?.[0], 'GITHUB_PAT')
    store.clear('github', 'api')
    assert.equal(store.get('github', 'api'), undefined)
  })
})
