/**
 * Operator auth login | logout | status (#32).
 * Shares AuthBindingStore + SecretStore with inject path (#28).
 * Never prints secret values. Not an Agent tool surface.
 */

import {
  createPersistedAuthBindingStore,
  defaultRuntimeConfigDir,
} from './auth-binding-persist.js'
import { resolveAuthResourceStatus } from './auth-status.js'
import type { AuthResourceContribution, PluginManifest } from './manifest.js'
import {
  createPluginRegistryFromEnv,
  type CreatePluginRegistryOptions,
} from './registry.js'
import {
  beginOAuthAuthorization,
  completeOAuthAuthorization,
  createDurableOAuthPendingStore,
  createOAuthPendingStore,
  type FetchLike,
  type OAuthPendingStore,
} from './oauth.js'
import {
  createAuthBindingStore,
  createDefaultSecretStore,
  resolveKeychainCapability,
  type AuthBindingStore,
  type SecretStore,
} from './secret-store.js'
import { isAllowedAuthEnvName } from './security-policy.js'
import type { AuthBinding, ProfileEnv } from './types.js'

function resolvePendingStore(
  options: RunAuthOptions & { pendingStore?: OAuthPendingStore },
): OAuthPendingStore {
  if (options.pendingStore) return options.pendingStore
  // Durable by default so oauth-begin / oauth-complete work across CLI processes
  try {
    return createDurableOAuthPendingStore({
      rootDir: options.runtimeConfigDir ?? defaultRuntimeConfigDir(options.env),
    })
  } catch {
    return createOAuthPendingStore()
  }
}

export type RunAuthOptions = CreatePluginRegistryOptions & {
  env?: ProfileEnv
  workspaceRoot?: string
  pluginPaths?: string[]
  secretStore?: SecretStore
  authBindingStore?: AuthBindingStore
  runtimeConfigDir?: string
}

export type AuthStatusRow = {
  pluginId: string
  resourceId: string
  kind: string
  pluginEnabled: boolean
  status: string
  hint?: string
}

export type AuthStatusReport = {
  rows: AuthStatusRow[]
  text: string
  json: { resources: AuthStatusRow[] }
  ok: boolean
}

export type AuthMutateReport = {
  ok: boolean
  text: string
  json: Record<string, unknown>
}

function toRows(
  statuses: Array<{
    pluginId: string
    resourceId: string
    kind: string
    pluginEnabled: boolean
    status: string
    hint?: string
  }>,
): AuthStatusRow[] {
  return statuses.map((s) => ({
    pluginId: s.pluginId,
    resourceId: s.resourceId,
    kind: s.kind,
    pluginEnabled: s.pluginEnabled,
    status: s.status,
    hint: s.hint,
  }))
}

function formatAuthStatusText(rows: AuthStatusRow[]): string {
  if (rows.length === 0) return '（无 auth 资源）\n'
  const lines = [
    'PLUGIN\tRESOURCE\tKIND\tENABLE\tAUTH\tHINT',
    ...rows.map((r) =>
      [
        r.pluginId,
        r.resourceId,
        r.kind,
        r.pluginEnabled ? 'on' : 'off',
        r.status,
        r.hint ?? '',
      ].join('\t'),
    ),
  ]
  return `${lines.join('\n')}\n`
}

function findAuthResource(
  manifests: PluginManifest[],
  pluginId: string,
  resourceId?: string,
): { manifest: PluginManifest; resource: AuthResourceContribution } | null {
  const manifest = manifests.find((m) => m.id === pluginId)
  if (!manifest) return null
  const resources = manifest.contributes?.auth ?? []
  if (resources.length === 0) return null
  if (resourceId) {
    const resource = resources.find((r) => r.resourceId === resourceId)
    return resource ? { manifest, resource } : null
  }
  const resource =
    resources.find((r) => r.resourceId === 'bearer') ?? resources[0]!
  return { manifest, resource }
}

async function openAuthContext(options: RunAuthOptions): Promise<{
  env: ProfileEnv
  secretStore: SecretStore
  bindingStore: AuthBindingStore
  manifests: PluginManifest[]
  disconnect: () => Promise<void>
  persistEnabled: boolean
}> {
  const env = options.env ?? process.env
  const secretStore = options.secretStore ?? createDefaultSecretStore(env)
  // Honor same persistence policy as createPluginRegistryFromEnv (adversarial P1)
  const persistEnabled =
    options.persistAuthBindings !== false && env.UILAB_PERSIST_AUTH !== '0'

  let bindingStore = options.authBindingStore
  if (!bindingStore) {
    if (persistEnabled) {
      bindingStore = await createPersistedAuthBindingStore({
        env,
        rootDir: options.runtimeConfigDir,
        skipWorkspaceGuard: options.runtimeConfigDir != null,
      })
    } else {
      bindingStore = createAuthBindingStore()
    }
  }

  const registry = await createPluginRegistryFromEnv({
    ...options,
    env,
    secretStore,
    authBindingStore: bindingStore,
    persistAuthBindings: false, // we already own bindingStore
  })
  const loaded = await registry.load({
    workspaceRoot: options.workspaceRoot,
  })

  return {
    env,
    secretStore,
    bindingStore,
    manifests: registry.listManifests(),
    disconnect: loaded.disconnect,
    persistEnabled,
  }
}

/**
 * Status for all auth resources (or filter by pluginId).
 */
export async function runAuthStatus(
  options: RunAuthOptions & { pluginId?: string } = {},
): Promise<AuthStatusReport & { disconnect: () => Promise<void> }> {
  const env = options.env ?? process.env
  const registry = await createPluginRegistryFromEnv({
    ...options,
    env,
  })
  const loaded = await registry.load({
    workspaceRoot: options.workspaceRoot,
  })
  let statuses = loaded.authStatuses
  if (options.pluginId) {
    statuses = statuses.filter((s) => s.pluginId === options.pluginId)
  }
  const rows = toRows(statuses)
  const ok = rows.every(
    (r) =>
      r.status === 'connected' ||
      r.status === 'none_required' ||
      !r.pluginEnabled,
  )
  return {
    rows,
    text: formatAuthStatusText(rows),
    json: { resources: rows },
    ok,
    disconnect: loaded.disconnect,
  }
}

/**
 * Login: bind credentials from env into Keychain (preferred) or env_ref binding.
 * OAuth2: --oauth-begin then --oauth-complete (#31).
 * Never accepts raw secret on argv — use --from-env NAME only (except oauth code).
 */
export async function runAuthLogin(
  options: RunAuthOptions & {
    pluginId: string
    resourceId?: string
    fromEnv?: string
    toKeychain?: boolean
    /** Start PKCE authorization; prints URL */
    oauthBegin?: boolean
    oauthComplete?: boolean
    authorizationEndpoint?: string
    tokenEndpoint?: string
    clientId?: string
    redirectUri?: string
    scopes?: string[]
    code?: string
    state?: string
    pendingStore?: OAuthPendingStore
    fetchImpl?: FetchLike
  },
): Promise<AuthMutateReport & { disconnect: () => Promise<void> }> {
  const pluginId = options.pluginId.trim()
  if (!pluginId) {
    return {
      ok: false,
      text: '用法：auth login <pluginId> --from-env <ENV_NAME>\n',
      json: { ok: false, error: 'missing_plugin' },
      disconnect: async () => {},
    }
  }

  const ctx = await openAuthContext(options)
  try {
    const found = findAuthResource(
      ctx.manifests,
      pluginId,
      options.resourceId,
    )
    if (!found) {
      return {
        ok: false,
        text: `未找到插件 auth 资源：${pluginId}${options.resourceId ? `/${options.resourceId}` : ''}\n`,
        json: { ok: false, error: 'auth_resource_not_found' },
        disconnect: ctx.disconnect,
      }
    }
    const { resource } = found

    if (resource.kind === 'cli_session') {
      return {
        ok: true,
        text: [
          `插件 ${pluginId}/${resource.resourceId} 为 cli_session。`,
          resource.loginHint ??
            '请在终端完成领域 CLI 自有登录（例如 feishu-cli auth login），然后运行：auth status',
          '',
        ].join('\n'),
        json: {
          ok: true,
          kind: 'cli_session',
          loginHint: resource.loginHint,
        },
        disconnect: ctx.disconnect,
      }
    }

    // --- OAuth 2.1 PKCE (#31) ---
    if (options.oauthBegin) {
      const authUrl =
        options.authorizationEndpoint?.trim() ||
        ctx.env.OAUTH_AUTHORIZATION_ENDPOINT?.trim()
      const tokenUrl =
        options.tokenEndpoint?.trim() ||
        ctx.env.OAUTH_TOKEN_ENDPOINT?.trim()
      const clientId =
        options.clientId?.trim() || ctx.env.OAUTH_CLIENT_ID?.trim()
      const redirectUri =
        options.redirectUri?.trim() ||
        ctx.env.OAUTH_REDIRECT_URI?.trim() ||
        'http://127.0.0.1:8765/callback'
      if (!authUrl || !tokenUrl || !clientId) {
        return {
          ok: false,
          text: 'oauth-begin 需要 --auth-url --token-url --client-id（或环境变量 OAUTH_*）\n',
          json: { ok: false, error: 'oauth_begin_missing_params' },
          disconnect: ctx.disconnect,
        }
      }
      const pendingStore = resolvePendingStore(options)
      const started = beginOAuthAuthorization({
        pluginId,
        resourceId: resource.resourceId,
        authorizationEndpoint: authUrl,
        tokenEndpoint: tokenUrl,
        clientId,
        redirectUri,
        scopes: options.scopes,
        pendingStore,
      })
      return {
        ok: true,
        text: [
          'OAuth 授权已开始（PKCE + state）。',
          `pendingId=${started.pendingId}`,
          `state=${started.state}`,
          `authorizationUrl=${started.authorizationUrl}`,
          '在浏览器打开 authorizationUrl，完成后执行：',
          `  auth login ${pluginId} --oauth-complete --code <CODE> --state ${started.state}`,
          '',
        ].join('\n'),
        json: {
          ok: true,
          pendingId: started.pendingId,
          state: started.state,
          authorizationUrl: started.authorizationUrl,
        },
        disconnect: ctx.disconnect,
      }
    }

    if (options.oauthComplete) {
      const code = options.code?.trim()
      const state = options.state?.trim()
      if (!code || !state) {
        return {
          ok: false,
          text: 'oauth-complete 需要 --code 与 --state\n',
          json: { ok: false, error: 'oauth_complete_missing_params' },
          disconnect: ctx.disconnect,
        }
      }
      try {
        const binding = await completeOAuthAuthorization({
          code,
          state,
          pendingStore: resolvePendingStore(options),
          secretStore: ctx.secretStore,
          bindingStore: ctx.bindingStore,
          fetchImpl: options.fetchImpl,
          loginHint: resource.loginHint,
        })
        const status = await resolveAuthResourceStatus(
          pluginId,
          resource,
          true,
          {
            env: ctx.env,
            store: ctx.secretStore,
            bindingStore: ctx.bindingStore,
          },
        )
        return {
          ok: status.status === 'connected',
          text: [
            `OAuth 完成：${pluginId}/${resource.resourceId}`,
            `auth=${status.status}`,
            'access/refresh token 已写入 Keychain；binding 已持久化（无 secret）。',
            '',
          ].join('\n'),
          json: {
            ok: status.status === 'connected',
            pluginId,
            resourceId: resource.resourceId,
            status: status.status,
            expiresAt: binding.expiresAt,
          },
          disconnect: ctx.disconnect,
        }
      } catch (err) {
        return {
          ok: false,
          text: `OAuth 完成失败：${err instanceof Error ? err.message : String(err)}\n`,
          json: { ok: false, error: 'oauth_complete_failed' },
          disconnect: ctx.disconnect,
        }
      }
    }

    if (resource.kind === 'oauth2' && !options.fromEnv?.trim()) {
      return {
        ok: false,
        text: [
          `插件 ${pluginId}/${resource.resourceId} 为 oauth2。`,
          '用法：',
          '  auth login <plugin> --oauth-begin --auth-url <URL> --token-url <URL> --client-id <ID>',
          '  auth login <plugin> --oauth-complete --code <CODE> --state <STATE>',
          '或临时 PAT：auth login <plugin> --from-env <ENV_NAME>',
          '',
        ].join('\n'),
        json: { ok: false, error: 'oauth2_needs_flow' },
        disconnect: ctx.disconnect,
      }
    }

    const fromEnv =
      options.fromEnv?.trim() ||
      resource.envNames?.[0] ||
      (resource.secretRef?.backend === 'env'
        ? resource.secretRef.envName
        : undefined)

    if (!fromEnv) {
      return {
        ok: false,
        text: `请指定 --from-env <ENV_NAME>（例如 MCP_DOCS_BEARER_TOKEN）\n`,
        json: { ok: false, error: 'missing_from_env' },
        disconnect: ctx.disconnect,
      }
    }

    // P0 re-review: never copy model-provider secrets into Keychain / inject path
    // via --from-env OPENAI_API_KEY remapped onto benign envNames.
    if (!isAllowedAuthEnvName(fromEnv)) {
      return {
        ok: false,
        text: `禁止将模型/LLM 密钥用于插件 auth：${fromEnv}\n`,
        json: {
          ok: false,
          error: 'model_secret_denied',
          envName: fromEnv,
        },
        disconnect: ctx.disconnect,
      }
    }

    const declaredEnvNames = [
      ...(resource.envNames ?? []),
      ...(resource.secretRef?.backend === 'env'
        ? [resource.secretRef.envName]
        : []),
    ].filter((n) => typeof n === 'string' && n.length > 0)
    if (
      declaredEnvNames.length > 0 &&
      !declaredEnvNames.includes(fromEnv)
    ) {
      return {
        ok: false,
        text: [
          `--from-env ${fromEnv} 不在资源声明的 envNames 内。`,
          `允许：${declaredEnvNames.join(', ')}`,
          '',
        ].join('\n'),
        json: {
          ok: false,
          error: 'from_env_not_declared',
          envName: fromEnv,
          allowed: declaredEnvNames,
        },
        disconnect: ctx.disconnect,
      }
    }

    const value = ctx.env[fromEnv]
    if (typeof value !== 'string' || value.length === 0) {
      return {
        ok: false,
        text: `环境变量 ${fromEnv} 为空；请先写入侧车 .env 再 login（勿把 secret 写在命令行参数里）\n`,
        json: { ok: false, error: 'env_empty', envName: fromEnv },
        disconnect: ctx.disconnect,
      }
    }

    const cap = resolveKeychainCapability({
      mode:
        ctx.env.UILAB_KEYCHAIN_MODE === 'fake'
          ? 'fake'
          : ctx.env.UILAB_KEYCHAIN_MODE === 'unsupported'
            ? 'unsupported'
            : ctx.env.UILAB_KEYCHAIN_MODE === 'os'
              ? 'os'
              : 'auto',
    })
    const preferKeychain =
      options.toKeychain !== false &&
      (cap === 'available' || cap === 'fake')

    let binding: AuthBinding
    if (preferKeychain) {
      if (!ctx.secretStore.set) {
        return {
          ok: false,
          text: 'SecretStore 不可写，无法写入 Keychain\n',
          json: { ok: false, error: 'store_not_writable' },
          disconnect: ctx.disconnect,
        }
      }
      try {
        await ctx.secretStore.set(
          { backend: 'keychain', account: fromEnv },
          value,
        )
      } catch (err) {
        return {
          ok: false,
          text: `写入 Keychain 失败：${err instanceof Error ? err.message : String(err)}\n`,
          json: { ok: false, error: 'keychain_write_failed' },
          disconnect: ctx.disconnect,
        }
      }
      binding = {
        pluginId,
        resourceId: resource.resourceId,
        kind: resource.kind === 'app_client' ? 'app_client' : 'static_bearer',
        // Preserve envNames so child-env inject can map keychain value onto keys
        envNames: resource.envNames ?? [fromEnv],
        secretRef: { backend: 'keychain', account: fromEnv },
        loginHint: resource.loginHint,
      }
    } else {
      binding = {
        pluginId,
        resourceId: resource.resourceId,
        kind: resource.kind,
        envNames: resource.envNames ?? [fromEnv],
        loginHint: resource.loginHint,
      }
    }

    ctx.bindingStore.upsert(binding)

    const status = await resolveAuthResourceStatus(pluginId, resource, true, {
      env: ctx.env,
      store: ctx.secretStore,
      bindingStore: ctx.bindingStore,
    })

    return {
      ok: status.status === 'connected',
      text: [
        `已登录绑定：${pluginId}/${resource.resourceId}`,
        `存储：${preferKeychain ? `keychain account=${fromEnv}` : `env_ref ${fromEnv}`}`,
        `auth=${status.status}${status.hint ? ` · ${status.hint}` : ''}`,
        preferKeychain
          ? '提示：Keychain 已写入后可从 .env 删除明文 token（请先 auth status 确认 connected）。'
          : '提示：env_ref 仍依赖进程环境变量；推荐 macOS 使用默认 Keychain 路径。',
        '',
      ].join('\n'),
      json: {
        ok: status.status === 'connected',
        pluginId,
        resourceId: resource.resourceId,
        storage: preferKeychain ? 'keychain' : 'env_ref',
        accountOrEnv: fromEnv,
        status: status.status,
      },
      disconnect: ctx.disconnect,
    }
  } catch (err) {
    await ctx.disconnect()
    throw err
  }
}

/**
 * Logout: clear binding(s) (revoke #28) and delete Keychain access+refresh.
 * Without --resource: plugin-wide multi-resource clear (adversarial P1).
 * Live sidecar inject snapshot is load-time — report needsSidecarRestart.
 */
export async function runAuthLogout(
  options: RunAuthOptions & {
    pluginId: string
    resourceId?: string
    clearKeychain?: boolean
  },
): Promise<AuthMutateReport & { disconnect: () => Promise<void> }> {
  const pluginId = options.pluginId.trim()
  if (!pluginId) {
    return {
      ok: false,
      text: '用法：auth logout <pluginId> [--resource <id>]\n',
      json: { ok: false, error: 'missing_plugin' },
      disconnect: async () => {},
    }
  }

  const ctx = await openAuthContext(options)
  try {
    const scoped = options.resourceId?.trim()
    const bindings = scoped
      ? (() => {
          const b = ctx.bindingStore.get(pluginId, scoped)
          return b ? [b] : []
        })()
      : ctx.bindingStore.list().filter((b) => b.pluginId === pluginId)

    const clearedResourceIds = new Set<string>()
    if (scoped) {
      ctx.bindingStore.clear(pluginId, scoped)
      clearedResourceIds.add(scoped)
    } else {
      // Plugin-wide: revoke all bindings + wildcard for undeclared/future resources
      for (const b of bindings) clearedResourceIds.add(b.resourceId)
      ctx.bindingStore.clear(pluginId)
      const manifest = ctx.manifests.find((m) => m.id === pluginId)
      for (const r of manifest?.contributes?.auth ?? []) {
        clearedResourceIds.add(r.resourceId)
      }
    }

    const keychainClearErrors: string[] = []
    if (options.clearKeychain !== false && ctx.secretStore.clear) {
      for (const b of bindings) {
        if (b.secretRef) {
          try {
            await ctx.secretStore.clear(b.secretRef)
          } catch (err) {
            keychainClearErrors.push(
              `access:${b.resourceId}:${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
        if (b.oauth?.refreshAccount) {
          try {
            await ctx.secretStore.clear({
              backend: 'keychain',
              account: b.oauth.refreshAccount,
            })
          } catch (err) {
            keychainClearErrors.push(
              `refresh:${b.resourceId}:${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      }
    }

    const statusParts: string[] = []
    const manifest = ctx.manifests.find((m) => m.id === pluginId)
    const resources = scoped
      ? (manifest?.contributes?.auth ?? []).filter(
          (r) => r.resourceId === scoped,
        )
      : (manifest?.contributes?.auth ?? [])
    for (const resource of resources) {
      const st = await resolveAuthResourceStatus(pluginId, resource, true, {
        env: ctx.env,
        store: ctx.secretStore,
        bindingStore: ctx.bindingStore,
      })
      statusParts.push(
        `${resource.resourceId}=${st.status}${st.hint ? ` · ${st.hint}` : ''}`,
      )
    }
    const statusLine =
      statusParts.length > 0
        ? statusParts.join('; ')
        : 'auth=missing（已撤销）'

    const scopeLabel = scoped
      ? `${pluginId}/${scoped}`
      : `${pluginId}（全部资源）`

    return {
      ok: true,
      text: [
        `已登出：${scopeLabel}`,
        statusLine,
        'process env 中的残留变量不再用于注入（#28 revoke）。',
        '提示：已运行的 sidecar 进程需重启后注入快照才会失效（needsSidecarRestart）。',
        '',
      ].join('\n'),
      json: {
        ok: true,
        pluginId,
        resourceId: scoped ?? null,
        clearedResources: [...clearedResourceIds],
        status: statusLine,
        needsSidecarRestart: true,
        keychainClearErrors:
          keychainClearErrors.length > 0 ? keychainClearErrors : undefined,
      },
      disconnect: ctx.disconnect,
    }
  } catch (err) {
    await ctx.disconnect()
    throw err
  }
}
