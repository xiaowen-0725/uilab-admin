/**
 * Credential resolver — resolve AuthBinding into CredentialMaterial + AuthStatus.
 *
 * Carved from secret-store.ts for locality: credential resolution branches
 * (cli_session / oauth2 / env_ref / static_bearer / app_client) depend on
 * secret backends (injected) and keychain account encoders, but not on
 * AuthBindingStore. Depends on ./keychain-account.js for isHostOwnedKeychainAccount.
 */

import { isAllowedAuthEnvName } from './security-policy.js'
import type {
  AuthBinding,
  AuthStatusResult,
  CredentialMaterial,
  ProfileEnv,
  SecretRef,
} from './types.js'
import { isCliSessionConnected } from './cli-session-status.js'
import { isHostOwnedKeychainAccount } from './keychain-account.js'
import type { AuthBindingStore } from './auth-binding-store.js'
import type { SecretStore } from './secret-store.js'

export type ResolveAuthStatusProbe = {
  /** Domain CLI runner used for cli_session statusCommand (injectable in tests) */
  runner?: (
    command: string,
    argv: string[],
    options: {
      cwd?: string
      env?: Record<string, string>
      timeoutMs?: number
    },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  expectExitCode?: number
  /** For oauth2 auto-refresh persistence (#31) */
  bindingStore?: AuthBindingStore
  /** Injectable clock (tests) */
  now?: () => number
  /** Injectable fetch for token refresh (tests / Fake AS) */
  fetchImpl?: (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{
    ok: boolean
    status: number
    text: () => Promise<string>
    json: () => Promise<unknown>
  }>
}

async function resolveOAuth2Material(
  binding: AuthBinding,
  store: SecretStore,
  controlledEnvNames: string[],
  probe?: ResolveAuthStatusProbe,
): Promise<CredentialMaterial> {
  const empty = (
    status: AuthStatusResult['status'],
    hint?: string,
  ): CredentialMaterial => ({
    status,
    hint,
    envValues: {},
    controlledEnvNames,
  })

  const now = probe?.now?.() ?? Date.now()
  const expired =
    binding.expiresAt != null &&
    Number.isFinite(binding.expiresAt) &&
    binding.expiresAt <= now

  if (expired && binding.oauth?.refreshAccount) {
    try {
      const { refreshOAuthBinding } = await import('./oauth.js')
      const access = await refreshOAuthBinding({
        binding,
        secretStore: store,
        bindingStore: probe?.bindingStore,
        fetchImpl: probe?.fetchImpl,
        now: probe?.now,
      })
      if (access) {
        return {
          status: 'connected',
          bearerToken: access,
          envValues: {},
          controlledEnvNames,
        }
      }
    } catch {
      // fall through
    }
    return empty(
      'expired',
      binding.loginHint ?? 'OAuth 凭据已过期且刷新失败，请重新授权',
    )
  }

  if (expired) {
    return empty(
      'expired',
      binding.loginHint ?? 'OAuth 凭据已过期，请重新授权',
    )
  }

  if (binding.secretRef) {
    if (
      binding.secretRef.backend === 'keychain' &&
      !isHostOwnedKeychainAccount(
        binding.pluginId,
        binding.resourceId,
        binding.secretRef.account,
      )
    ) {
      return empty(
        'error',
        `禁止跨插件引用 Keychain account=${binding.secretRef.account}`,
      )
    }
    const v = await store.resolve(binding.secretRef)
    if (v) {
      return {
        status: 'connected',
        bearerToken: v,
        envValues: secretRefEnvValues(binding.secretRef, v),
        controlledEnvNames,
      }
    }
  }

  return empty(
    'missing',
    binding.loginHint ??
      'OAuth2 未登录：plugin:auth login <plugin> --oauth-begin，再 --oauth-complete --code … --state …',
  )
}

/**
 * Resolve injectable credential material for a binding (#28).
 * Single source for status + bearer + controlled child-env values.
 * Never log returned secrets.
 */
export async function resolveCredentialMaterial(
  binding: AuthBinding,
  store: SecretStore,
  /** Optional env overlay; omit so env-backed stores use their configured map */
  env?: ProfileEnv,
  probe?: ResolveAuthStatusProbe,
): Promise<CredentialMaterial> {
  const controlledEnvNames = collectControlledEnvNames(binding)
  const empty = (status: AuthStatusResult['status'], hint?: string): CredentialMaterial => ({
    status,
    hint,
    envValues: {},
    controlledEnvNames,
  })

  // oauth2 handles its own expiry + refresh (#31); other kinds use expiresAt hard-stop
  if (
    binding.kind !== 'oauth2' &&
    binding.expiresAt != null &&
    Number.isFinite(binding.expiresAt) &&
    binding.expiresAt <= Date.now()
  ) {
    return empty(
      'expired',
      binding.loginHint ?? '凭据已过期，请重新授权或更新 SecretRef',
    )
  }

  if (binding.kind === 'cli_session') {
    const session = await resolveCliSessionStatus(binding, env, probe)
    return empty(session.status, session.hint)
  }

  if (binding.kind === 'oauth2') {
    return resolveOAuth2Material(binding, store, controlledEnvNames, probe)
  }

  // env_ref / static_bearer / app_client
  const rawNames =
    binding.envNames ??
    (binding.secretRef?.backend === 'env'
      ? [binding.secretRef.envName]
      : [])
  // P0: never resolve model-provider secrets into auth material
  const names = rawNames.filter((n) => isAllowedAuthEnvName(n))
  const deniedNames = rawNames.filter((n) => !isAllowedAuthEnvName(n))

  if (names.length === 0 && !binding.secretRef) {
    if (deniedNames.length > 0) {
      return empty(
        'error',
        `禁止将模型密钥用于插件 auth：${deniedNames.join(', ')}`,
      )
    }
    return empty('none_required')
  }

  const envValues: Record<string, string> = {}
  let bearerToken: string | undefined

  if (names.length > 0) {
    const requireAll = binding.kind === 'app_client'
    const missing: string[] = []
    for (const name of names) {
      const v = await store.resolve({ backend: 'env', envName: name }, env)
      if (v) {
        envValues[name] = v
        if (!bearerToken) bearerToken = v
      } else {
        missing.push(name)
      }
    }
    const ok = requireAll
      ? missing.length === 0
      : Object.keys(envValues).length > 0
    if (ok) {
      return {
        status: 'connected',
        bearerToken:
          binding.kind === 'static_bearer' || binding.kind === 'env_ref'
            ? bearerToken
            : undefined,
        envValues,
        controlledEnvNames,
      }
    }
    if (!binding.secretRef) {
      return empty(
        'missing',
        binding.loginHint ?? missingEnvNamesHint(missing, requireAll),
      )
    }
  }

  if (binding.secretRef) {
    // secretRef.env must also pass allowlist
    if (
      binding.secretRef.backend === 'env' &&
      !isAllowedAuthEnvName(binding.secretRef.envName)
    ) {
      return empty(
        'error',
        `禁止将模型密钥用于插件 auth：${binding.secretRef.envName}`,
      )
    }
    // Keychain accounts are host-owned and plugin-scoped (adversarial re-review #2)
    if (
      binding.secretRef.backend === 'keychain' &&
      !isHostOwnedKeychainAccount(
        binding.pluginId,
        binding.resourceId,
        binding.secretRef.account,
      )
    ) {
      return empty(
        'error',
        `禁止跨插件引用 Keychain account=${binding.secretRef.account}`,
      )
    }
    const v = await store.resolve(binding.secretRef, env)
    if (v) {
      // Map secret onto declared envNames for child inject
      const mapped: Record<string, string> = { ...envValues }
      if (binding.secretRef.backend === 'env') {
        Object.assign(mapped, secretRefEnvValues(binding.secretRef, v))
      } else if (names.length > 0) {
        // app_client: never fan one Keychain value across client_id + secret
        // (adversarial re-review #3). Only single-field keychain maps.
        if (binding.kind === 'app_client') {
          if (names.length !== 1) {
            return empty(
              'missing',
              binding.loginHint ??
                'app_client 需要每个 envName 独立凭据；禁止用单一 Keychain 值填充全部字段',
            )
          }
          if (isAllowedAuthEnvName(names[0]!)) mapped[names[0]!] = v
        } else {
          // static_bearer / env_ref: one token may alias onto multiple env names
          for (const name of names) {
            if (isAllowedAuthEnvName(name)) mapped[name] = v
          }
        }
      }
      // app_client still requires every declared envName present after mapping
      if (binding.kind === 'app_client') {
        const missing = names.filter((n) => !mapped[n])
        if (missing.length > 0) {
          return empty(
            'missing',
            binding.loginHint ?? missingEnvNamesHint(missing, true),
          )
        }
      }
      return {
        status: 'connected',
        bearerToken:
          binding.kind === 'static_bearer' || binding.kind === 'env_ref'
            ? v
            : undefined,
        envValues: mapped,
        controlledEnvNames,
      }
    }
    return empty(
      'missing',
      binding.loginHint ?? formatMissingHint(binding.secretRef),
    )
  }

  return empty(
    'missing',
    binding.loginHint ?? missingEnvNamesHint(names, false),
  )
}

function collectControlledEnvNames(binding: AuthBinding): string[] {
  const names = new Set<string>()
  for (const n of binding.envNames ?? []) {
    if (isAllowedAuthEnvName(n)) names.add(n)
  }
  if (
    binding.secretRef?.backend === 'env' &&
    isAllowedAuthEnvName(binding.secretRef.envName)
  ) {
    names.add(binding.secretRef.envName)
  }
  return [...names]
}

function secretRefEnvValues(
  ref: SecretRef,
  value: string,
): Record<string, string> {
  if (ref.backend === 'env') return { [ref.envName]: value }
  return {}
}

/**
 * Resolve auth status for a binding without exposing secret values.
 * enable(plugin) is orthogonal — callers attach pluginEnabled separately.
 * Delegates to resolveCredentialMaterial so status ⇔ inject stay aligned (#28).
 */
export async function resolveAuthStatus(
  binding: AuthBinding,
  store: SecretStore,
  /** Optional env overlay; omit so env-backed stores use their configured map */
  env?: ProfileEnv,
  probe?: ResolveAuthStatusProbe,
): Promise<AuthStatusResult> {
  const material = await resolveCredentialMaterial(binding, store, env, probe)
  return { status: material.status, hint: material.hint }
}

function missingEnvNamesHint(names: string[], requireAll: boolean): string {
  const joined = requireAll ? names.join(', ') : names.join(' / ')
  return `缺少环境变量：${joined}（请写入侧车 .env，勿提交仓库）`
}

async function resolveCliSessionStatus(
  binding: AuthBinding,
  env: ProfileEnv | undefined,
  probe?: ResolveAuthStatusProbe,
): Promise<AuthStatusResult> {
  const hint =
    binding.loginHint ??
    '需先完成领域 CLI 登录（cli_session），例如：lark-cli auth login'
  const cmd = binding.statusCommand?.command?.trim()
  if (!cmd) {
    return { status: 'missing', hint }
  }

  // Prefer injected runner; fall back to default closed-env CLI runner
  let runner = probe?.runner
  if (!runner) {
    try {
      const { defaultCliRunner } = await import('./cli-loader.js')
      runner = defaultCliRunner
    } catch {
      return { status: 'missing', hint }
    }
  }

  try {
    const {
      assertSafeArgvTemplate,
      assertSafeCliCommand,
    } = await import('./cli-loader.js')
    const { filterChildEnv } = await import('./security-policy.js')
    // Same guards as domain CLI tools — no arbitrary statusCommand
    assertSafeCliCommand(cmd)
    const argv = binding.statusCommand?.argv ?? []
    if (argv.length > 0) assertSafeArgvTemplate(argv)
    const closed = filterChildEnv(env ?? process.env, [], {
      includeBaseKeys: true,
    })
    const result = await runner(cmd, argv, {
      env: closed,
      timeoutMs: 15_000,
    })
    const expect = probe?.expectExitCode ?? 0
    if (
      isCliSessionConnected(
        result,
        expect,
        binding.statusCommand?.connectedWhen,
      )
    ) {
      return { status: 'connected' }
    }
    return { status: 'missing', hint }
  } catch (err) {
    // Safety rejection → missing (do not execute unsafe probes)
    const msg = err instanceof Error ? err.message : String(err)
    if (/禁止|shell|占位符/.test(msg)) {
      return { status: 'missing', hint: `${hint}（statusCommand 未通过安全校验）` }
    }
    return {
      status: 'error',
      hint: `${hint}（探测失败：${msg}）`,
    }
  }
}

function formatMissingHint(ref: SecretRef): string {
  if (ref.backend === 'env') {
    return `缺少环境变量：${ref.envName}（请写入侧车 .env，勿提交仓库）`
  }
  if (ref.backend === 'keychain') {
    // Distinguish unsupported platform vs empty account (#30)
    const mode = process.env.UILAB_KEYCHAIN_MODE
    if (
      mode !== 'fake' &&
      mode !== 'os' &&
      process.platform !== 'darwin'
    ) {
      return `当前平台不支持 OS Keychain（account=${ref.account}；CI 可用 UILAB_KEYCHAIN_MODE=fake）`
    }
    if (mode === 'unsupported') {
      return `Keychain 后端已禁用（account=${ref.account}）`
    }
    return `Keychain 凭据未配置：${ref.account}`
  }
  return `内存凭据缺失：${ref.key}`
}