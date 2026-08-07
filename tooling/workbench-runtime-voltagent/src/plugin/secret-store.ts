/**
 * SecretRef resolution (ticket #18).
 *
 * Config stores references only. Values come from env (MVP) or memory (tests).
 * Keychain backend is a stub for later — resolve returns null, set is no-op/throws clear error.
 */

import { isAllowedAuthEnvName, isModelProviderSecretKey } from './security-policy.js'
import type {
  AuthBinding,
  AuthStatusResult,
  CredentialMaterial,
  ProfileEnv,
  SecretRef,
} from './types.js'
/**
 * Length-prefixed segment so pluginId/resourceId containing `:` cannot collide
 * (e.g. a + b:c vs a:b + c).
 */
export function encodeAuthScopeSegment(value: string): string {
  const s = String(value ?? '')
  return `${s.length}.${s}`
}

/**
 * Host-owned Keychain account for operator-stored plugin secrets.
 * Local plugin.json must never invent arbitrary accounts (cross-plugin theft).
 * Format: uilab:v1:{len.pluginId}:{len.resourceId}:{role}
 */
export function pluginAuthKeychainAccount(
  pluginId: string,
  resourceId: string,
  role: 'env' | 'access' = 'env',
): string {
  return `uilab:v1:${encodeAuthScopeSegment(pluginId)}:${encodeAuthScopeSegment(resourceId)}:${role}`
}

/**
 * OAuth Keychain accounts (same unambiguous encoding).
 * Format: oauth:v1:{len.pluginId}:{len.resourceId}:{access|refresh}
 */
export function oauthKeychainAccount(
  pluginId: string,
  resourceId: string,
  role: 'access' | 'refresh',
): string {
  return `oauth:v1:${encodeAuthScopeSegment(pluginId)}:${encodeAuthScopeSegment(resourceId)}:${role}`
}

/**
 * True when account is exactly the host-owned account for this plugin resource.
 * Exact match only — no prefix checks (prevents encoding collisions).
 */
export function isHostOwnedKeychainAccount(
  pluginId: string,
  resourceId: string,
  account: string,
): boolean {
  if (!account || !pluginId || !resourceId) return false
  return (
    account === pluginAuthKeychainAccount(pluginId, resourceId, 'env') ||
    account === pluginAuthKeychainAccount(pluginId, resourceId, 'access') ||
    account === oauthKeychainAccount(pluginId, resourceId, 'access') ||
    account === oauthKeychainAccount(pluginId, resourceId, 'refresh')
  )
}

export type SecretStore = {
  /** Resolve secret value; never logs the value. */
  resolve(ref: SecretRef, env?: ProfileEnv): Promise<string | null>
  /** Optional write — memory/tests; keychain stub may reject. */
  set?(ref: SecretRef, value: string): Promise<void>
  clear?(ref: SecretRef): Promise<void>
}

/** In-memory store for tests and ephemeral runtime overrides. */
export function createMemorySecretStore(
  initial?: Iterable<readonly [string, string]>,
): SecretStore {
  const map = new Map<string, string>(initial)
  return {
    async resolve(ref) {
      if (ref.backend !== 'memory') return null
      return map.get(ref.key) ?? null
    },
    async set(ref, value) {
      if (ref.backend !== 'memory') {
        throw new Error('memory store only accepts backend=memory refs')
      }
      map.set(ref.key, value)
    },
    async clear(ref) {
      if (ref.backend === 'memory') map.delete(ref.key)
    },
  }
}

/**
 * Env-backed store: SecretRef.envName → process/env map value.
 * Does not persist; operator owns dotenv / shell env.
 */
export function createEnvSecretStore(
  defaultEnv: ProfileEnv = process.env,
): SecretStore {
  return {
    async resolve(ref, env = defaultEnv) {
      if (ref.backend !== 'env') return null
      const v = env[ref.envName]
      return typeof v === 'string' && v.length > 0 ? v : null
    },
    // Env store is read-only from app code — operators set .env themselves.
  }
}

/**
 * @deprecated Prefer createKeychainSecretStore({ mode: 'unsupported' }) (#30).
 * Kept for call-site compatibility — resolve null; set throws Chinese error.
 */
export function createKeychainSecretStoreStub(): SecretStore {
  return createKeychainSecretStore({ mode: 'unsupported' })
}

/** Keychain backend capability for doctor / status hints (#30). */
export type KeychainCapability = 'available' | 'unsupported' | 'fake'

export type CreateKeychainSecretStoreOptions = {
  /**
   * - auto: macOS → OS Keychain via `security`; else unsupported
   * - fake: in-memory map (CI / tests)
   * - os: force OS backend (fails set/resolve on non-darwin with clear error)
   * - unsupported: always missing + set throws
   */
  mode?: 'auto' | 'fake' | 'os' | 'unsupported'
  /** Keychain service id (macOS generic password service) */
  service?: string
  /** Injectable map for mode=fake */
  initial?: Iterable<readonly [string, string]>
  /** Override platform detection (tests) */
  platform?: NodeJS.Platform
  /**
   * Override security(1) runner (tests).
   * Prefer passing secrets via `stdin` (security -i) so they never appear in argv.
   */
  runSecurity?: (
    args: string[],
    options?: { stdin?: string },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
}

/** Quote a token for `security -i` command language. */
function quoteSecurityInteractiveArg(value: string): string {
  if (/^[A-Za-z0-9._:@+/-]+$/.test(value)) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const DEFAULT_KEYCHAIN_SERVICE = 'uilab.workbench.runtime'

export function resolveKeychainCapability(
  options: Pick<CreateKeychainSecretStoreOptions, 'mode' | 'platform'> = {},
): KeychainCapability {
  const mode = options.mode ?? 'auto'
  if (mode === 'fake') return 'fake'
  if (mode === 'unsupported') return 'unsupported'
  const platform = options.platform ?? process.platform
  if (mode === 'os' || mode === 'auto') {
    return platform === 'darwin' ? 'available' : 'unsupported'
  }
  return 'unsupported'
}

/**
 * Keychain SecretStore (#30): real macOS Keychain, fake map for CI, or unsupported.
 * SecretRef shape unchanged: { backend: 'keychain', account }.
 */
export function createKeychainSecretStore(
  options: CreateKeychainSecretStoreOptions = {},
): SecretStore & { capability: KeychainCapability; service: string } {
  const service = options.service ?? DEFAULT_KEYCHAIN_SERVICE
  const capability = resolveKeychainCapability(options)
  const mode = options.mode ?? 'auto'

  if (capability === 'fake' || mode === 'fake') {
    const map = new Map<string, string>(options.initial)
    return {
      capability: 'fake',
      service,
      async resolve(ref) {
        if (ref.backend !== 'keychain') return null
        return map.get(ref.account) ?? null
      },
      async set(ref, value) {
        if (ref.backend !== 'keychain') {
          throw new Error('keychain store only accepts backend=keychain refs')
        }
        map.set(ref.account, value)
      },
      async clear(ref) {
        if (ref.backend === 'keychain') map.delete(ref.account)
      },
    }
  }

  if (capability === 'unsupported') {
    return {
      capability: 'unsupported',
      service,
      async resolve(ref) {
        if (ref.backend !== 'keychain') return null
        return null
      },
      async set() {
        throw new Error(
          '当前平台不支持 OS Keychain（仅 macOS 生产后端；CI 请用 mode=fake）',
        )
      },
      async clear() {
        // no-op
      },
    }
  }

  // macOS OS Keychain via security(1)
  const run =
    options.runSecurity ??
    (async (args: string[], runOpts?: { stdin?: string }) => {
      const { spawn } = await import('node:child_process')
      return await new Promise<{
        stdout: string
        stderr: string
        exitCode: number
      }>((resolve) => {
        const child = spawn('/usr/bin/security', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
        }, 15_000)
        child.stdout?.setEncoding('utf8')
        child.stderr?.setEncoding('utf8')
        child.stdout?.on('data', (c: string) => {
          stdout += c
        })
        child.stderr?.on('data', (c: string) => {
          stderr += c
        })
        child.on('error', (err) => {
          clearTimeout(timer)
          resolve({
            stdout,
            stderr: err.message,
            exitCode: 1,
          })
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 1,
          })
        })
        if (runOpts?.stdin != null) {
          child.stdin?.end(runOpts.stdin, 'utf8')
        } else {
          child.stdin?.end()
        }
      })
    })

  return {
    capability: 'available',
    service,
    async resolve(ref) {
      if (ref.backend !== 'keychain') return null
      const r = await run([
        'find-generic-password',
        '-a',
        ref.account,
        '-s',
        service,
        '-w',
      ])
      if (r.exitCode !== 0) return null
      const v = r.stdout.trim()
      return v.length > 0 ? v : null
    },
    async set(ref, value) {
      if (ref.backend !== 'keychain') {
        throw new Error('keychain store only accepts backend=keychain refs')
      }
      // Prefer security -i + hex payload so the secret never appears in argv
      // (adversarial: same-user ps/argv inspection).
      const hex = Buffer.from(value, 'utf8').toString('hex')
      const script = [
        'add-generic-password',
        `-a ${quoteSecurityInteractiveArg(ref.account)}`,
        `-s ${quoteSecurityInteractiveArg(service)}`,
        `-X ${hex}`,
        '-U',
      ].join(' ')
      const r = await run(['-i'], { stdin: `${script}\n` })
      if (r.exitCode !== 0) {
        throw new Error(
          `写入 Keychain 失败（account=${ref.account}）：${r.stderr || r.stdout || 'unknown'}`,
        )
      }
    },
    async clear(ref) {
      if (ref.backend !== 'keychain') return
      const r = await run([
        'delete-generic-password',
        '-a',
        ref.account,
        '-s',
        service,
      ])
      if (r.exitCode === 0) return
      // security(1): item not found is success for logout idempotency
      const detail = `${r.stderr} ${r.stdout}`.toLowerCase()
      if (
        /could not be found|not be found|item not found|unable to find|errsecitemnotfound|-25300/.test(
          detail,
        )
      ) {
        return
      }
      throw new Error(
        `删除 Keychain 失败（account=${ref.account}）：${r.stderr || r.stdout || `exit ${r.exitCode}`}`,
      )
    },
  }
}

/**
 * Copy non-empty env secrets into Keychain and return SecretRefs (#30 migration).
 * Does not delete env values (operator removes .env lines after verify).
 */
export async function migrateEnvSecretsToKeychain(
  envNames: string[],
  options: {
    env?: ProfileEnv
    keychain: SecretStore
    /** account prefix, default env name as account */
    accountFor?: (envName: string) => string
  },
): Promise<{
  migrated: Array<{ envName: string; account: string }>
  skipped: Array<{ envName: string; reason: string }>
}> {
  const env = options.env ?? process.env
  const accountFor = options.accountFor ?? ((n: string) => n)
  const migrated: Array<{ envName: string; account: string }> = []
  const skipped: Array<{ envName: string; reason: string }> = []

  if (!options.keychain.set) {
    return {
      migrated: [],
      skipped: envNames.map((envName) => ({
        envName,
        reason: 'Keychain store 不可写',
      })),
    }
  }

  for (const envName of envNames) {
    const v = env[envName]
    if (typeof v !== 'string' || v.length === 0) {
      skipped.push({ envName, reason: 'env 为空' })
      continue
    }
    const account = accountFor(envName)
    try {
      await options.keychain.set({ backend: 'keychain', account }, v)
      migrated.push({ envName, account })
    } catch (err) {
      skipped.push({
        envName,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { migrated, skipped }
}

/** Default composite for sidecar: memory → env → keychain (fake|os by env). */
export function createDefaultSecretStore(
  env: ProfileEnv = process.env,
  options?: {
    keychainMode?: CreateKeychainSecretStoreOptions['mode']
    keychain?: SecretStore
  },
): SecretStore {
  const mode =
    options?.keychainMode ??
    (env.UILAB_KEYCHAIN_MODE === 'fake'
      ? 'fake'
      : env.UILAB_KEYCHAIN_MODE === 'unsupported'
        ? 'unsupported'
        : env.UILAB_KEYCHAIN_MODE === 'os'
          ? 'os'
          : 'auto')
  const keychain =
    options?.keychain ?? createKeychainSecretStore({ mode })
  return createCompositeSecretStore([
    createMemorySecretStore(),
    createEnvSecretStore(env),
    keychain,
  ])
}

/** Composite: try memory → env → keychain in order. */
export function createCompositeSecretStore(stores: SecretStore[]): SecretStore {
  return {
    async resolve(ref, env) {
      for (const store of stores) {
        const v = await store.resolve(ref, env)
        if (v != null && v.length > 0) return v
      }
      return null
    },
    async set(ref, value) {
      // Skip backends that reject foreign SecretRef shapes (e.g. memory vs keychain)
      const errors: string[] = []
      for (const store of stores) {
        if (!store.set) continue
        try {
          await store.set(ref, value)
          return
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err))
        }
      }
      throw new Error(
        errors.length > 0
          ? `没有可写入的 SecretStore 后端：${errors[errors.length - 1]}`
          : '没有可写入的 SecretStore 后端',
      )
    },
    async clear(ref) {
      for (const store of stores) {
        if (store.clear) await store.clear(ref)
      }
    },
  }
}

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
    '需先完成领域 CLI 登录（cli_session），例如：feishu-cli auth login'
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
    if (result.exitCode === expect) {
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

/** In-memory binding table for tests / ephemeral host state (no secrets). */
export type AuthBindingStore = {
  list(): AuthBinding[]
  get(pluginId: string, resourceId: string): AuthBinding | undefined
  upsert(binding: AuthBinding): void
  /**
   * Atomic refresh commit: upsert only if resource is not currently revoked.
   * Returns false when revoked (logout wins over in-flight OAuth refresh).
   * Explicit login should use upsert() which re-authorizes.
   */
  upsertIfNotRevoked(binding: AuthBinding): boolean
  /**
   * Remove override and mark resource revoked (#28).
   * After clear, status/inject ignore process-env leftovers until upsert again.
   */
  clear(pluginId: string, resourceId?: string): void
  /** True after clear until a new upsert for that resource (or plugin-wide clear). */
  isRevoked(pluginId: string, resourceId: string): boolean
  /** Revoke keys for persistence (#29) */
  listRevoked(): string[]
}

export type CreateAuthBindingStoreOptions = {
  /** Restored revoke keys (`pluginId::resourceId` or `pluginId::*`) */
  revoked?: string[]
  /**
   * Resources re-authorized after a plugin-wide revoke (`pluginId::resourceId`).
   * One resource login must not re-enable siblings (adversarial P1).
   */
  reauthorized?: string[]
}

/** Split persisted revoke list into revoked + reauthorized markers (`!plugin::res`). */
export function splitRevokedSnapshot(revokedList: string[]): {
  revoked: string[]
  reauthorized: string[]
} {
  const revoked: string[] = []
  const reauthorized: string[] = []
  for (const k of revokedList) {
    if (k.startsWith('!')) reauthorized.push(k.slice(1))
    else revoked.push(k)
  }
  return { revoked, reauthorized }
}

export function createAuthBindingStore(
  initial: AuthBinding[] = [],
  options: CreateAuthBindingStoreOptions = {},
): AuthBindingStore {
  const map = new Map<string, AuthBinding>()
  /** Keys: `pluginId::resourceId` or `pluginId::*` for plugin-wide revoke */
  const revoked = new Set<string>(options.revoked ?? [])
  /** Explicit re-login after plugin-wide revoke */
  const reauthorized = new Set<string>(options.reauthorized ?? [])
  const keyOf = (p: string, r: string) => `${p}::${r}`
  for (const b of initial) map.set(keyOf(b.pluginId, b.resourceId), b)
  const isRevoked = (pluginId: string, resourceId: string) => {
    const k = keyOf(pluginId, resourceId)
    if (revoked.has(k)) return true
    if (revoked.has(`${pluginId}::*`) && !reauthorized.has(k)) return true
    return false
  }

  return {
    list: () => [...map.values()],
    get: (pluginId, resourceId) => map.get(keyOf(pluginId, resourceId)),
    upsert: (binding) => {
      const k = keyOf(binding.pluginId, binding.resourceId)
      map.set(k, binding)
      // Clear only this resource's revoke; never drop plugin-wide wildcard
      revoked.delete(k)
      reauthorized.add(k)
    },
    upsertIfNotRevoked: (binding) => {
      // Refresh must not clear revoke markers (logout wins concurrent races).
      if (isRevoked(binding.pluginId, binding.resourceId)) return false
      map.set(keyOf(binding.pluginId, binding.resourceId), binding)
      return true
    },
    clear: (pluginId, resourceId) => {
      if (resourceId) {
        const k = keyOf(pluginId, resourceId)
        map.delete(k)
        revoked.add(k)
        reauthorized.delete(k)
        return
      }
      for (const k of [...map.keys()]) {
        if (k.startsWith(`${pluginId}::`)) {
          map.delete(k)
          revoked.add(k)
          reauthorized.delete(k)
        }
      }
      // Wildcard: future/unknown resources stay revoked until each is re-upserted
      revoked.add(`${pluginId}::*`)
    },
    isRevoked,

    listRevoked: () => {
      // Persist wildcard + per-resource + reauth markers as revoked list;
      // reauthorized entries are encoded as `!pluginId::resourceId` for restore.
      const out = [...revoked]
      for (const k of reauthorized) out.push(`!${k}`)
      return out
    },
  }
}

/** Snapshot of non-secret binding state for persistence (#29). */
export type AuthBindingStoreSnapshot = {
  schemaVersion: 1
  bindings: AuthBinding[]
  revoked: string[]
}

/** Export store for disk (never includes secret values). */
export function snapshotAuthBindingStore(
  store: AuthBindingStore,
): AuthBindingStoreSnapshot {
  return {
    schemaVersion: 1,
    bindings: store.list().map(sanitizeBindingForPersist),
    revoked: store.listRevoked(),
  }
}

function sanitizeBindingForPersist(b: AuthBinding): AuthBinding {
  // Drop any accidental secret-shaped fields; only keep non-secret refs
  return {
    pluginId: b.pluginId,
    resourceId: b.resourceId,
    kind: b.kind,
    envNames: b.envNames ? [...b.envNames] : undefined,
    secretRef: b.secretRef ? { ...b.secretRef } : undefined,
    loginHint: b.loginHint,
    expiresAt: b.expiresAt,
    oauth: b.oauth
      ? {
          tokenEndpoint: b.oauth.tokenEndpoint,
          clientId: b.oauth.clientId,
          refreshAccount: b.oauth.refreshAccount,
          authorizationEndpoint: b.oauth.authorizationEndpoint,
          redirectUri: b.oauth.redirectUri,
          scopes: b.oauth.scopes ? [...b.oauth.scopes] : undefined,
        }
      : undefined,
    statusCommand: b.statusCommand
      ? {
          command: b.statusCommand.command,
          argv: b.statusCommand.argv ? [...b.statusCommand.argv] : undefined,
        }
      : undefined,
  }
}
