/**
 * #31 OAuth 2.1 PKCE + refresh (Fake AS, no real IdP).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  beginOAuthAuthorization,
  buildAuthorizationUrl,
  completeOAuthAuthorization,
  createFakeAuthorizationServer,
  createOAuthPendingStore,
  createPkcePair,
  refreshOAuthBinding,
} from './oauth.js'
import { resolveCredentialMaterial } from './secret-store.js'
import {
  createAuthBindingStore,
  createKeychainSecretStore,
} from './secret-store.js'
import { resolveMcpBearerToken } from './mcp-loader.js'
import { BUILTIN_MCP_DOCS_PLUGIN } from './builtins.js'

describe('#31 PKCE helpers', () => {
  it('createPkcePair produces S256 verifier/challenge', () => {
    const p = createPkcePair()
    assert.ok(p.codeVerifier.length >= 43)
    assert.ok(p.codeChallenge.length >= 40)
    assert.equal(p.codeChallengeMethod, 'S256')
  })

  it('buildAuthorizationUrl includes PKCE + state', () => {
    const url = buildAuthorizationUrl({
      authorizationEndpoint: 'https://as.test/authorize',
      clientId: 'c',
      redirectUri: 'http://127.0.0.1:8765/callback',
      state: 'st',
      codeChallenge: 'ch',
      scopes: ['openid', 'mcp'],
    })
    const u = new URL(url)
    assert.equal(u.searchParams.get('response_type'), 'code')
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(u.searchParams.get('state'), 'st')
    assert.equal(u.searchParams.get('scope'), 'openid mcp')
  })
})

describe('#31 Fake AS exchange + refresh', () => {
  it('uses a client-secret env reference for exchange without persisting the secret value', async () => {
    const as = createFakeAuthorizationServer({
      accessToken: 'access-secret-flow',
      refreshToken: 'refresh-secret-flow',
      requiredClientSecret: 'github-app-secret',
    })
    const pendingStore = createOAuthPendingStore()
    const values = new Map<string, string>()
    const secretStore = {
      async resolve(ref: { backend: string; envName?: string; account?: string }) {
        if (ref.backend === 'env' && ref.envName === 'GITHUB_APP_CLIENT_SECRET') {
          return 'github-app-secret'
        }
        return ref.account ? (values.get(ref.account) ?? null) : null
      },
      async set(ref: { backend: string; account?: string }, value: string) {
        if (ref.account) values.set(ref.account, value)
      },
      async clear(ref: { backend: string; account?: string }) {
        if (ref.account) values.delete(ref.account)
      },
    }
    const bindingStore = createAuthBindingStore()

    const started = beginOAuthAuthorization({
      pluginId: 'mcp.github',
      resourceId: 'mcp:github',
      authorizationEndpoint: as.authorizationEndpoint,
      tokenEndpoint: as.tokenEndpoint,
      clientId: as.clientId,
      clientSecretRef: {
        backend: 'env',
        envName: 'GITHUB_APP_CLIENT_SECRET',
      },
      redirectUri: as.redirectUri,
      pendingStore,
    })
    const challenge = new URL(started.authorizationUrl).searchParams.get(
      'code_challenge',
    )!

    const binding = await completeOAuthAuthorization({
      code: as.issueCodeForChallenge(challenge),
      state: started.state,
      pendingStore,
      secretStore,
      bindingStore,
      fetchImpl: as.fetchImpl,
    })

    assert.deepEqual(binding.oauth?.clientSecretRef, {
      backend: 'env',
      envName: 'GITHUB_APP_CLIENT_SECRET',
    })
    assert.doesNotMatch(JSON.stringify(binding), /github-app-secret/)
  })

  it('begin → complete stores tokens; inject uses bearer; refresh on expiry', async () => {
    const as = createFakeAuthorizationServer({
      accessToken: 'access-aaa',
      refreshToken: 'refresh-bbb',
      expiresIn: 3600,
    })
    const pendingStore = createOAuthPendingStore()
    const secretStore = createKeychainSecretStore({ mode: 'fake' })
    const bindingStore = createAuthBindingStore()

    const started = beginOAuthAuthorization({
      pluginId: 'mcp.docs',
      resourceId: 'bearer',
      authorizationEndpoint: as.authorizationEndpoint,
      tokenEndpoint: as.tokenEndpoint,
      clientId: as.clientId,
      redirectUri: as.redirectUri,
      scopes: ['mcp'],
      pendingStore,
    })

    // Derive challenge from pending by re-parsing is hard; issue code via URL challenge
    const authUrl = new URL(started.authorizationUrl)
    const challenge = authUrl.searchParams.get('code_challenge')!
    const code = as.issueCodeForChallenge(challenge)

    const binding = await completeOAuthAuthorization({
      code,
      state: started.state,
      pendingStore,
      secretStore,
      bindingStore,
      fetchImpl: as.fetchImpl,
    })

    assert.equal(binding.kind, 'oauth2')
    assert.ok(binding.secretRef)
    assert.ok(binding.oauth?.refreshAccount)
    assert.doesNotMatch(JSON.stringify(binding), /access-aaa|refresh-bbb/)

    const material = await resolveCredentialMaterial(
      bindingStore.get('mcp.docs', 'bearer')!,
      secretStore,
    )
    assert.equal(material.status, 'connected')
    assert.equal(material.bearerToken, 'access-aaa')

    const contrib = BUILTIN_MCP_DOCS_PLUGIN.contributes!.mcp![0]!
    assert.equal(
      resolveMcpBearerToken(
        contrib,
        { MCP_DOCS_BEARER_TOKEN: 'env-leftover' },
        { authEnforced: true, authMaterial: material },
      ),
      'access-aaa',
    )

    // Expire and refresh
    const expired = {
      ...bindingStore.get('mcp.docs', 'bearer')!,
      expiresAt: Date.now() - 1000,
    }
    bindingStore.upsert(expired)
    const refreshed = await resolveCredentialMaterial(expired, secretStore, undefined, {
      bindingStore,
      fetchImpl: as.fetchImpl,
      now: () => Date.now(),
    })
    assert.equal(refreshed.status, 'connected')
    assert.equal(refreshed.bearerToken, 'access-aaa-refreshed')
    assert.equal(as.lastRefresh, 'refresh-bbb')
  })

  it('invalid state is rejected (CSRF)', async () => {
    const as = createFakeAuthorizationServer()
    const pendingStore = createOAuthPendingStore()
    beginOAuthAuthorization({
      pluginId: 'p',
      resourceId: 'r',
      authorizationEndpoint: as.authorizationEndpoint,
      tokenEndpoint: as.tokenEndpoint,
      clientId: as.clientId,
      redirectUri: as.redirectUri,
      pendingStore,
    })
    await assert.rejects(
      () =>
        completeOAuthAuthorization({
          code: 'x',
          state: 'wrong-state',
          pendingStore,
          secretStore: createKeychainSecretStore({ mode: 'fake' }),
          bindingStore: createAuthBindingStore(),
          fetchImpl: as.fetchImpl,
        }),
      /state|CSRF|无效/,
    )
  })

  it('refresh failure → expired status', async () => {
    const as = createFakeAuthorizationServer({ failRefresh: true })
    const secretStore = createKeychainSecretStore({ mode: 'fake' })
    const bindingStore = createAuthBindingStore()
    await secretStore.set!(
      { backend: 'keychain', account: 'oauth:p:r:access' },
      'old-access',
    )
    await secretStore.set!(
      { backend: 'keychain', account: 'oauth:p:r:refresh' },
      'bad-refresh',
    )
    const binding = {
      pluginId: 'p',
      resourceId: 'r',
      kind: 'oauth2' as const,
      secretRef: {
        backend: 'keychain' as const,
        account: 'oauth:p:r:access',
      },
      expiresAt: Date.now() - 1,
      oauth: {
        tokenEndpoint: as.tokenEndpoint,
        clientId: as.clientId,
        refreshAccount: 'oauth:p:r:refresh',
      },
    }
    bindingStore.upsert(binding)
    const material = await resolveCredentialMaterial(binding, secretStore, undefined, {
      bindingStore,
      fetchImpl: as.fetchImpl,
    })
    assert.equal(material.status, 'expired')
    assert.equal(material.bearerToken, undefined)

    const token = await refreshOAuthBinding({
      binding,
      secretStore,
      bindingStore,
      fetchImpl: as.fetchImpl,
    })
    assert.equal(token, null)
  })

  it('revoke clears inject', async () => {
    const secretStore = createKeychainSecretStore({ mode: 'fake' })
    const bindingStore = createAuthBindingStore()
    await secretStore.set!(
      { backend: 'keychain', account: 'oauth:p:r:access' },
      'tok',
    )
    bindingStore.upsert({
      pluginId: 'p',
      resourceId: 'r',
      kind: 'oauth2',
      secretRef: { backend: 'keychain', account: 'oauth:p:r:access' },
      expiresAt: Date.now() + 60_000,
      oauth: {
        tokenEndpoint: 'https://as.test/token',
        clientId: 'c',
        refreshAccount: 'oauth:p:r:refresh',
      },
    })
    bindingStore.clear('p', 'r')
    // After clear, effective status via binding store is revoked at auth-status layer;
    // material for raw binding without revoke still has token — registry uses isRevoked
    assert.equal(bindingStore.isRevoked('p', 'r'), true)
  })
})
