/**
 * MCP OAuth 2.1 + PKCE host client (#31).
 * Tokens → SecretStore (Keychain); pending PKCE state is non-secret.
 * Fake/capture Runtime never imports this for inject.
 */

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  assertRuntimeConfigOutsideWorkspace,
  atomicWriteFileSync,
  withAuthBindingFileLock,
} from './auth-binding-persist.js'
import type { AuthBinding, OAuthBindingMeta, ProfileEnv, SecretRef } from './types.js'
import {
  oauthKeychainAccount,
  type AuthBindingStore,
  type SecretStore,
} from './secret-store.js'

export type PkcePair = {
  codeVerifier: string
  codeChallenge: string
  /** S256 */
  codeChallengeMethod: 'S256'
}

export type OAuthPending = {
  pendingId: string
  pluginId: string
  resourceId: string
  state: string
  codeVerifier: string
  authorizationEndpoint: string
  tokenEndpoint: string
  clientId: string
  /** Non-secret env/keychain pointer; never the client-secret value. */
  clientSecretRef?: SecretRef
  redirectUri: string
  scopes: string[]
  createdAt: number
}

export type OAuthTokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}>

/** Base64url without padding (RFC 7636). */
export function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function createPkcePair(): PkcePair {
  const codeVerifier = base64Url(randomBytes(32))
  const codeChallenge = base64Url(
    createHash('sha256').update(codeVerifier).digest(),
  )
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' }
}

export function createOAuthState(): string {
  return base64Url(randomBytes(16))
}

export function oauthAccessAccount(pluginId: string, resourceId: string): string {
  return oauthKeychainAccount(pluginId, resourceId, 'access')
}

export function oauthRefreshAccount(pluginId: string, resourceId: string): string {
  return oauthKeychainAccount(pluginId, resourceId, 'refresh')
}

export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scopes?: string[]
  resource?: string
}): string {
  const u = new URL(params.authorizationEndpoint)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', params.clientId)
  u.searchParams.set('redirect_uri', params.redirectUri)
  u.searchParams.set('state', params.state)
  u.searchParams.set('code_challenge', params.codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  if (params.scopes?.length) {
    u.searchParams.set('scope', params.scopes.join(' '))
  }
  if (params.resource) {
    u.searchParams.set('resource', params.resource)
  }
  return u.toString()
}

export async function exchangeAuthorizationCode(
  params: {
    tokenEndpoint: string
    clientId: string
    code: string
    redirectUri: string
    codeVerifier: string
    clientSecret?: string
  },
  fetchImpl: FetchLike = globalThis.fetch as FetchLike,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  })
  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret)
  }
  return tokenRequest(params.tokenEndpoint, body, fetchImpl)
}

export async function refreshAccessToken(
  params: {
    tokenEndpoint: string
    clientId: string
    refreshToken: string
    clientSecret?: string
  },
  fetchImpl: FetchLike = globalThis.fetch as FetchLike,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  })
  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret)
  }
  return tokenRequest(params.tokenEndpoint, body, fetchImpl)
}

const OAUTH_TOKEN_TIMEOUT_MS = 15_000

async function tokenRequest(
  tokenEndpoint: string,
  body: URLSearchParams,
  fetchImpl: FetchLike,
): Promise<OAuthTokenResponse> {
  const res = await Promise.race([
    fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: body.toString(),
    }),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `OAuth token 请求超时（${OAUTH_TOKEN_TIMEOUT_MS}ms）：${tokenEndpoint}`,
          ),
        )
      }, OAUTH_TOKEN_TIMEOUT_MS)
    }),
  ])
  const text = await res.text()
  if (!res.ok) {
    // Never include raw token-endpoint body (adversarial P2)
    let errCode = 'token_error'
    try {
      const j = JSON.parse(text) as { error?: string }
      if (typeof j.error === 'string' && /^[a-z0-9_]+$/i.test(j.error)) {
        errCode = j.error
      }
    } catch {
      // ignore
    }
    throw new Error(`OAuth token 交换失败 HTTP ${res.status}（${errCode}）`)
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('OAuth token 响应不是 JSON')
  }
  const obj = json as Record<string, unknown>
  if (typeof obj.access_token !== 'string' || !obj.access_token) {
    throw new Error('OAuth token 响应缺少 access_token')
  }
  return {
    access_token: obj.access_token,
    token_type: typeof obj.token_type === 'string' ? obj.token_type : undefined,
    expires_in:
      typeof obj.expires_in === 'number' ? obj.expires_in : undefined,
    refresh_token:
      typeof obj.refresh_token === 'string' ? obj.refresh_token : undefined,
    scope: typeof obj.scope === 'string' ? obj.scope : undefined,
  }
}

/** Pending PKCE sessions (CSRF state). May be memory or durable file. */
export type OAuthPendingStore = {
  put(pending: OAuthPending): void
  take(pendingId: string): OAuthPending | undefined
  takeByState(state: string): OAuthPending | undefined
}

const PENDING_TTL_MS = 15 * 60_000

export function createOAuthPendingStore(): OAuthPendingStore {
  const byId = new Map<string, OAuthPending>()
  const byState = new Map<string, string>()
  return {
    put(pending) {
      byId.set(pending.pendingId, pending)
      byState.set(pending.state, pending.pendingId)
    },
    take(pendingId) {
      const p = byId.get(pendingId)
      if (!p) return undefined
      byId.delete(pendingId)
      byState.delete(p.state)
      if (Date.now() - p.createdAt > PENDING_TTL_MS) return undefined
      return p
    },
    takeByState(state) {
      const id = byState.get(state)
      if (!id) return undefined
      return this.take(id)
    },
  }
}

/**
 * Durable PKCE pending store under runtime config dir (cross-CLI-process).
 * File mode 0600; one-shot consume; TTL 15m; exclusive lock on every RMW.
 */
export function createDurableOAuthPendingStore(options: {
  rootDir: string
  filename?: string
  env?: ProfileEnv
  /** Test-only: allow under WORKSPACE_ROOT */
  skipWorkspaceGuard?: boolean
}): OAuthPendingStore {
  if (!options.skipWorkspaceGuard) {
    assertRuntimeConfigOutsideWorkspace(
      options.rootDir,
      options.env ?? process.env,
    )
  }
  const filePath = path.join(
    options.rootDir,
    options.filename ?? 'oauth-pending.json',
  )

  type FileShape = { schemaVersion: 1; items: OAuthPending[] }

  function readAll(): OAuthPending[] {
    try {
      if (!existsSync(filePath)) return []
      const raw = readFileSync(filePath, 'utf8')
      const data = JSON.parse(raw) as FileShape
      if (data?.schemaVersion !== 1 || !Array.isArray(data.items)) {
        throw new Error('oauth-pending schema 无效')
      }
      const now = Date.now()
      return data.items.filter(
        (p) =>
          p &&
          typeof p.state === 'string' &&
          typeof p.codeVerifier === 'string' &&
          now - (p.createdAt ?? 0) <= PENDING_TTL_MS,
      )
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'ENOENT') return []
      throw err instanceof Error
        ? err
        : new Error(`读取 oauth-pending 失败：${String(err)}`)
    }
  }

  function writeAll(items: OAuthPending[]): void {
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    const body = `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`
    if (/\b(ghp_|sk-|access_token)\b/i.test(body)) {
      throw new Error('oauth-pending 禁止包含 token 字段')
    }
    atomicWriteFileSync(filePath, body)
  }

  function withLock<T>(fn: () => T): T {
    let result!: T
    withAuthBindingFileLock(filePath, () => {
      result = fn()
    })
    return result
  }

  return {
    put(pending) {
      withLock(() => {
        const items = readAll().filter(
          (p) => p.pendingId !== pending.pendingId && p.state !== pending.state,
        )
        items.push(pending)
        writeAll(items)
      })
    },
    take(pendingId) {
      return withLock(() => {
        const items = readAll()
        const idx = items.findIndex((p) => p.pendingId === pendingId)
        if (idx < 0) return undefined
        const [p] = items.splice(idx, 1)
        writeAll(items)
        return p
      })
    },
    takeByState(state) {
      return withLock(() => {
        const items = readAll()
        const idx = items.findIndex((p) => p.state === state)
        if (idx < 0) return undefined
        const [p] = items.splice(idx, 1)
        writeAll(items)
        if (!p || Date.now() - (p.createdAt ?? 0) > PENDING_TTL_MS) {
          return undefined
        }
        return p
      })
    },
  }
}

export function beginOAuthAuthorization(params: {
  pluginId: string
  resourceId: string
  authorizationEndpoint: string
  tokenEndpoint: string
  clientId: string
  clientSecretRef?: SecretRef
  redirectUri: string
  scopes?: string[]
  resource?: string
  pendingStore: OAuthPendingStore
}): { pendingId: string; authorizationUrl: string; state: string } {
  const pkce = createPkcePair()
  const state = createOAuthState()
  const pendingId = base64Url(randomBytes(12))
  const pending: OAuthPending = {
    pendingId,
    pluginId: params.pluginId,
    resourceId: params.resourceId,
    state,
    codeVerifier: pkce.codeVerifier,
    authorizationEndpoint: params.authorizationEndpoint,
    tokenEndpoint: params.tokenEndpoint,
    clientId: params.clientId,
    clientSecretRef: params.clientSecretRef,
    redirectUri: params.redirectUri,
    scopes: params.scopes ?? [],
    createdAt: Date.now(),
  }
  params.pendingStore.put(pending)
  const authorizationUrl = buildAuthorizationUrl({
    authorizationEndpoint: params.authorizationEndpoint,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    state,
    codeChallenge: pkce.codeChallenge,
    scopes: params.scopes,
    resource: params.resource,
  })
  return { pendingId, authorizationUrl, state }
}

export async function completeOAuthAuthorization(params: {
  code: string
  state: string
  pendingStore: OAuthPendingStore
  secretStore: SecretStore
  bindingStore: AuthBindingStore
  fetchImpl?: FetchLike
  now?: () => number
  loginHint?: string
}): Promise<AuthBinding> {
  const pending = params.pendingStore.takeByState(params.state)
  if (!pending) {
    throw new Error('OAuth state 无效或已过期（可能 CSRF 或重复提交）')
  }
  // Optional max age 15m
  if (Date.now() - pending.createdAt > 15 * 60_000) {
    throw new Error('OAuth 授权会话已超时，请重新 login')
  }

  const tokens = await exchangeAuthorizationCode(
    {
      tokenEndpoint: pending.tokenEndpoint,
      clientId: pending.clientId,
      code: params.code,
      redirectUri: pending.redirectUri,
      codeVerifier: pending.codeVerifier,
      clientSecret: pending.clientSecretRef
        ? ((await params.secretStore.resolve(pending.clientSecretRef)) ?? undefined)
        : undefined,
    },
    params.fetchImpl,
  )

  return persistOAuthTokens({
    pluginId: pending.pluginId,
    resourceId: pending.resourceId,
    tokens,
    tokenEndpoint: pending.tokenEndpoint,
    clientId: pending.clientId,
    clientSecretRef: pending.clientSecretRef,
    authorizationEndpoint: pending.authorizationEndpoint,
    redirectUri: pending.redirectUri,
    scopes: pending.scopes,
    secretStore: params.secretStore,
    bindingStore: params.bindingStore,
    now: params.now,
    loginHint: params.loginHint,
  })
}

export async function persistOAuthTokens(params: {
  pluginId: string
  resourceId: string
  tokens: OAuthTokenResponse
  tokenEndpoint: string
  clientId: string
  clientSecretRef?: SecretRef
  authorizationEndpoint?: string
  redirectUri?: string
  scopes?: string[]
  secretStore: SecretStore
  bindingStore: AuthBindingStore
  now?: () => number
  loginHint?: string
}): Promise<AuthBinding> {
  if (!params.secretStore.set) {
    throw new Error('SecretStore 不可写，无法保存 OAuth token')
  }
  const accessAccount = oauthAccessAccount(params.pluginId, params.resourceId)
  const refreshAccount = oauthRefreshAccount(params.pluginId, params.resourceId)
  const accessRef: SecretRef = { backend: 'keychain', account: accessAccount }
  await params.secretStore.set(accessRef, params.tokens.access_token)

  if (params.tokens.refresh_token) {
    await params.secretStore.set(
      { backend: 'keychain', account: refreshAccount },
      params.tokens.refresh_token,
    )
  }

  const now = params.now?.() ?? Date.now()
  const expiresIn = params.tokens.expires_in ?? 3600
  // Refresh slightly early (30s skew)
  const expiresAt = now + Math.max(30, expiresIn - 30) * 1000

  const oauth: OAuthBindingMeta = {
    tokenEndpoint: params.tokenEndpoint,
    clientId: params.clientId,
    clientSecretRef: params.clientSecretRef,
    refreshAccount,
    authorizationEndpoint: params.authorizationEndpoint,
    redirectUri: params.redirectUri,
    scopes: params.scopes,
  }

  const binding: AuthBinding = {
    pluginId: params.pluginId,
    resourceId: params.resourceId,
    kind: 'oauth2',
    secretRef: accessRef,
    expiresAt,
    oauth,
    loginHint: params.loginHint,
  }
  params.bindingStore.upsert(binding)
  return binding
}

/**
 * Refresh access token when expired; updates binding expiresAt.
 * Returns new access token or null on failure.
 */
export async function refreshOAuthBinding(params: {
  binding: AuthBinding
  secretStore: SecretStore
  bindingStore?: AuthBindingStore
  fetchImpl?: FetchLike
  now?: () => number
}): Promise<string | null> {
  const meta = params.binding.oauth
  if (!meta?.refreshAccount || !params.secretStore.set) return null
  const refresh = await params.secretStore.resolve({
    backend: 'keychain',
    account: meta.refreshAccount,
  })
  if (!refresh) return null

  try {
    const tokens = await refreshAccessToken(
      {
        tokenEndpoint: meta.tokenEndpoint,
        clientId: meta.clientId,
        refreshToken: refresh,
        clientSecret: meta.clientSecretRef
          ? ((await params.secretStore.resolve(meta.clientSecretRef)) ?? undefined)
          : undefined,
      },
      params.fetchImpl,
    )
    const accessAccount =
      params.binding.secretRef?.backend === 'keychain'
        ? params.binding.secretRef.account
        : oauthAccessAccount(params.binding.pluginId, params.binding.resourceId)
    await params.secretStore.set(
      { backend: 'keychain', account: accessAccount },
      tokens.access_token,
    )
    if (tokens.refresh_token) {
      await params.secretStore.set(
        { backend: 'keychain', account: meta.refreshAccount },
        tokens.refresh_token,
      )
    }
    const now = params.now?.() ?? Date.now()
    const expiresIn = tokens.expires_in ?? 3600
    const expiresAt = now + Math.max(30, expiresIn - 30) * 1000

    const nextBinding: AuthBinding = {
      ...params.binding,
      secretRef: { backend: 'keychain', account: accessAccount },
      expiresAt,
      oauth: meta,
    }

    // Atomic vs logout: only commit if still not revoked (under lock for
    // persisted stores). Never use upsert() here — it would reauthorize.
    if (params.bindingStore) {
      const committed = params.bindingStore.upsertIfNotRevoked(nextBinding)
      if (!committed) {
        try {
          await params.secretStore.clear?.({
            backend: 'keychain',
            account: accessAccount,
          })
          if (tokens.refresh_token && meta.refreshAccount) {
            await params.secretStore.clear?.({
              backend: 'keychain',
              account: meta.refreshAccount,
            })
          }
        } catch {
          // ignore
        }
        return null
      }
    }
    return tokens.access_token
  } catch {
    return null
  }
}

/** Fake Authorization Server for unit tests (no network). */
export function createFakeAuthorizationServer(options?: {
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  failRefresh?: boolean
  failExchange?: boolean
  requiredClientSecret?: string
}): {
  authorizationEndpoint: string
  tokenEndpoint: string
  clientId: string
  redirectUri: string
  /** Capture last code_verifier for assertions */
  lastVerifier: string | null
  lastRefresh: string | null
  fetchImpl: FetchLike
  /** Issue a code bound to verifier challenge (S256) */
  issueCodeForChallenge: (codeChallenge: string) => string
} {
  const accessToken = options?.accessToken ?? 'fake-access-token-aaaa'
  const refreshToken = options?.refreshToken ?? 'fake-refresh-token-bbbb'
  const expiresIn = options?.expiresIn ?? 3600
  const codes = new Map<string, string>() // code -> challenge
  let lastVerifier: string | null = null
  let lastRefresh: string | null = null

  return {
    authorizationEndpoint: 'https://as.test/authorize',
    tokenEndpoint: 'https://as.test/token',
    clientId: 'uilab-test-client',
    redirectUri: 'http://127.0.0.1:8765/callback',
    get lastVerifier() {
      return lastVerifier
    },
    get lastRefresh() {
      return lastRefresh
    },
    issueCodeForChallenge(codeChallenge: string) {
      const code = base64Url(randomBytes(12))
      codes.set(code, codeChallenge)
      return code
    },
    fetchImpl: async (input, init) => {
      if (!input.includes('/token')) {
        return {
          ok: false,
          status: 404,
          text: async () => 'not found',
          json: async () => ({}),
        }
      }
      const body = new URLSearchParams(init?.body ?? '')
      const grant = body.get('grant_type')
      if (grant === 'authorization_code') {
        if (options?.failExchange) {
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: 'invalid_grant' }),
            json: async () => ({ error: 'invalid_grant' }),
          }
        }
        const code = body.get('code') ?? ''
        const verifier = body.get('code_verifier') ?? ''
        if (
          options?.requiredClientSecret &&
          body.get('client_secret') !== options.requiredClientSecret
        ) {
          return {
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ error: 'bad_client_secret' }),
            json: async () => ({ error: 'bad_client_secret' }),
          }
        }
        lastVerifier = verifier
        const expectedChallenge = codes.get(code)
        const actualChallenge = base64Url(
          createHash('sha256').update(verifier).digest(),
        )
        if (!expectedChallenge || expectedChallenge !== actualChallenge) {
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: 'invalid_pkce' }),
            json: async () => ({ error: 'invalid_pkce' }),
          }
        }
        codes.delete(code)
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: expiresIn,
              token_type: 'Bearer',
            }),
          json: async () => ({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: expiresIn,
          }),
        }
      }
      if (grant === 'refresh_token') {
        lastRefresh = body.get('refresh_token')
        if (options?.failRefresh) {
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: 'invalid_grant' }),
            json: async () => ({ error: 'invalid_grant' }),
          }
        }
        if (body.get('refresh_token') !== refreshToken) {
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: 'invalid_refresh' }),
            json: async () => ({ error: 'invalid_refresh' }),
          }
        }
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: `${accessToken}-refreshed`,
              refresh_token: refreshToken,
              expires_in: expiresIn,
              token_type: 'Bearer',
            }),
          json: async () => ({
            access_token: `${accessToken}-refreshed`,
            expires_in: expiresIn,
          }),
        }
      }
      return {
        ok: false,
        status: 400,
        text: async () => 'bad grant',
        json: async () => ({}),
      }
    },
  }
}
