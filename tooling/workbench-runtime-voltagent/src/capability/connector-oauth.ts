/**
 * Product-facing managed Connector OAuth runtime.
 *
 * The platform Connector Broker owns the Provider OAuth App and Client Secret.
 * The local Sidecar owns only an expiring claim capability, then stores the
 * resulting access/refresh material in the OS Keychain. Nothing secret crosses
 * the Renderer seam.
 */

import type { AuthBindingStore } from '../plugin/auth-binding-store.js'
import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
import type { PluginManifest } from '../plugin/manifest.js'
import { persistOAuthTokens } from '../plugin/oauth.js'
import { firstEnv } from '../plugin/parse-util.js'
import type { SecretStore } from '../plugin/secret-store.js'
import type { ProfileEnv } from '../plugin/types.js'

export type ConnectorOAuthFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean
  status: number
  headers: Headers
  text: () => Promise<string>
  json: () => Promise<unknown>
}>

export type ConnectorOAuthCompletion = {
  connectorId: string
  pluginId: string
  resourceId: string
  expiresAt?: number
}

export type ConnectorOAuthRuntime = {
  begin(connectorId: string): Promise<{
    authorizationUrl: string
    expiresIn: number
  }>
  /** Poll all Sidecar-owned pending sessions; returns newly authorized rows. */
  reconcile(): Promise<ConnectorOAuthCompletion[]>
}

type ManagedSession = {
  connectorId: string
  connectorName: string
  pluginId: string
  resourceId: string
  sessionId: string
  claimToken: string
  claimUrl: string
  tokenEndpoint: string
  clientId: string
  authorizationUrl: string
  scopes: string[]
  expiresAt: number
  pollIntervalMs: number
  nextPollAt: number
}

const BROKER_TIMEOUT_MS = 15_000

export function createConnectorOAuthRuntime(options: {
  env?: ProfileEnv
  descriptors: readonly ConnectorDescriptor[]
  manifests: readonly PluginManifest[]
  secretStore: SecretStore
  bindingStore: AuthBindingStore
  fetchImpl?: ConnectorOAuthFetch
  now?: () => number
}): ConnectorOAuthRuntime {
  const env = options.env ?? process.env
  const fetchImpl =
    options.fetchImpl ?? (globalThis.fetch as ConnectorOAuthFetch)
  const now = options.now ?? Date.now
  const sessions = new Map<string, ManagedSession>()

  function resolve(connectorId: string) {
    const descriptor = options.descriptors.find((row) => row.id === connectorId)
    if (!descriptor || descriptor.authSummarySource.kind !== 'oauth2') {
      throw new Error(`连接器 ${connectorId} 未声明 OAuth2`)
    }
    const manifest = options.manifests.find(
      (row) => row.id === descriptor.authSummarySource.pluginId,
    )
    const resource = manifest?.contributes?.auth?.find(
      (row) => row.resourceId === descriptor.authSummarySource.resourceId,
    )
    const oauth = resource?.oauth
    if (!manifest || !resource || !oauth) {
      throw new Error(`连接器 ${connectorId} 缺少 Provider OAuth contribution`)
    }
    if (oauth.strategy !== 'managed_broker') {
      throw new Error(`连接器 ${connectorId} 不是平台托管 OAuth`)
    }
    const brokerBaseUrl =
      firstEnv(env, oauth.brokerBaseUrlFromEnv) ?? oauth.brokerBaseUrl?.trim()
    if (!brokerBaseUrl) {
      const configHint = oauth.brokerBaseUrlFromEnv?.join(' / ') || 'Broker URL'
      throw new Error(
        `平台「${descriptor.name}」连接服务尚未配置；这不是用户凭据问题，请由平台部署 ${configHint}。`,
      )
    }
    const broker = requireHttpsUrl(brokerBaseUrl, 'Connector Broker URL')
    return { descriptor, manifest, resource, oauth, broker }
  }

  return {
    async begin(connectorId) {
      const config = resolve(connectorId)
      const sessionsUrl = new URL(
        '/v1/oauth/sessions',
        config.broker,
      ).toString()
      const response = await brokerFetch(fetchImpl, sessionsUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schema_version: 1,
          provider: config.oauth.providerId,
          connector_id: connectorId,
          client: 'uilab-agent-workbench',
          transport: 'local-sidecar-poll',
        }),
      })
      if (!response.ok) {
        throw new Error(`平台连接服务创建授权会话失败 HTTP ${response.status}`)
      }
      const body = await safeJson(response, '平台连接服务授权会话')
      const sessionId = requireString(body.session_id, 'session_id')
      const claimToken = requireString(body.claim_token, 'claim_token')
      if (claimToken.length < 16) {
        throw new Error('平台连接服务 claim_token 强度不足')
      }
      const authorizationUrl = requireHttpsUrl(
        requireString(body.authorization_url, 'authorization_url'),
        'authorization_url',
      )
      const tokenEndpoint = requireHttpsUrl(
        requireString(body.token_endpoint, 'token_endpoint'),
        'token_endpoint',
      )
      const clientId = requireString(body.client_id, 'client_id')
      const expiresIn = positiveNumber(body.expires_in, 900)
      const pollIntervalMs = Math.max(
        1_000,
        positiveNumber(body.poll_interval, 2) * 1_000,
      )
      const claimUrl = new URL(
        `/v1/oauth/sessions/${encodeURIComponent(sessionId)}/claim`,
        config.broker,
      ).toString()
      sessions.set(connectorId, {
        connectorId,
        connectorName: config.descriptor.name,
        pluginId: config.manifest.id,
        resourceId: config.resource.resourceId,
        sessionId,
        claimToken,
        claimUrl,
        tokenEndpoint,
        clientId,
        authorizationUrl,
        scopes: config.oauth.scopes ?? [],
        expiresAt: now() + expiresIn * 1_000,
        pollIntervalMs,
        nextPollAt: 0,
      })
      return { authorizationUrl, expiresIn }
    },

    async reconcile() {
      const completed: ConnectorOAuthCompletion[] = []
      for (const [connectorId, session] of sessions) {
        if (now() >= session.expiresAt) {
          sessions.delete(connectorId)
          continue
        }
        if (now() < session.nextPollAt) continue
        session.nextPollAt = now() + session.pollIntervalMs
        const response = await brokerFetch(fetchImpl, session.claimUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${session.claimToken}`,
          },
        })
        if (response.status === 202) continue
        if (response.status === 404 || response.status === 410) {
          sessions.delete(connectorId)
          continue
        }
        if (!response.ok) {
          throw new Error(`平台连接服务领取授权失败 HTTP ${response.status}`)
        }
        const body = await safeJson(response, '平台连接服务授权领取')
        if (body.status === 'pending') continue
        if (body.status !== 'authorized') {
          throw new Error('平台连接服务返回未知授权状态')
        }
        const accessToken = requireString(body.access_token, 'access_token')
        const binding = await persistOAuthTokens({
          pluginId: session.pluginId,
          resourceId: session.resourceId,
          tokens: {
            access_token: accessToken,
            token_type:
              typeof body.token_type === 'string' ? body.token_type : 'bearer',
            expires_in:
              typeof body.expires_in === 'number' ? body.expires_in : undefined,
            refresh_token:
              typeof body.refresh_token === 'string'
                ? body.refresh_token
                : undefined,
            scope: typeof body.scope === 'string' ? body.scope : undefined,
          },
          tokenEndpoint: session.tokenEndpoint,
          clientId: session.clientId,
          authorizationEndpoint: session.authorizationUrl,
          scopes: session.scopes,
          secretStore: options.secretStore,
          bindingStore: options.bindingStore,
          now,
          loginHint: `已通过平台 Connector Broker 完成「${session.connectorName}」一键授权。`,
        })
        sessions.delete(connectorId)
        completed.push({
          connectorId,
          pluginId: binding.pluginId,
          resourceId: binding.resourceId,
          expiresAt: binding.expiresAt,
        })
      }
      return completed
    },
  }
}

async function brokerFetch(
  fetchImpl: ConnectorOAuthFetch,
  input: string,
  init: RequestInit,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetchImpl(input, init),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('平台连接服务请求超时')),
          BROKER_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function safeJson(
  response: { json: () => Promise<unknown> },
  label: string,
): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => null)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}响应不是 JSON 对象`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`平台连接服务响应缺少 ${label}`)
  }
  return value.trim()
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function requireHttpsUrl(value: string, label: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error(`${label} 必须使用 HTTPS`)
  }
  return url.toString()
}
