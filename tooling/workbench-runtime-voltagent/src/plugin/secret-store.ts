/**
 * SecretRef resolution (ticket #18).
 *
 * Config stores references only. Values come from env (MVP) or memory (tests).
 * Keychain backend is a stub for later — resolve returns null, set is no-op/throws clear error.
 */

import type {
  AuthBinding,
  AuthStatusResult,
  ProfileEnv,
  SecretRef,
} from './types.js'

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
 * Keychain stub (interface reserved). resolve always null; set throws.
 * Real OS keychain lands in a later ticket without changing SecretRef shape.
 */
export function createKeychainSecretStoreStub(): SecretStore {
  return {
    async resolve(ref) {
      if (ref.backend !== 'keychain') return null
      return null
    },
    async set() {
      throw new Error(
        'Keychain secret store 尚未实现（接口预留）；MVP 请使用 env_ref 或 memory store',
      )
    },
    async clear() {
      // no-op
    },
  }
}

/** Composite: try memory → env → keychain stub in order. */
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
      for (const store of stores) {
        if (store.set) {
          await store.set(ref, value)
          return
        }
      }
      throw new Error('没有可写入的 SecretStore 后端')
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
  statusCommandFromEnv?: string[]
}

/**
 * Resolve auth status for a binding without exposing secret values.
 * enable(plugin) is orthogonal — callers attach pluginEnabled separately.
 */
export async function resolveAuthStatus(
  binding: AuthBinding,
  store: SecretStore,
  /** Optional env overlay; omit so env-backed stores use their configured map */
  env?: ProfileEnv,
  probe?: ResolveAuthStatusProbe,
): Promise<AuthStatusResult> {
  if (binding.kind === 'cli_session') {
    return resolveCliSessionStatus(binding, env, probe)
  }

  if (binding.kind === 'oauth2') {
    return {
      status: 'missing',
      hint: binding.loginHint ?? 'OAuth2 授权尚未实现（架构预留）',
    }
  }

  // env_ref / static_bearer / app_client: require envNames or secretRef
  const names =
    binding.envNames ??
    (binding.secretRef?.backend === 'env'
      ? [binding.secretRef.envName]
      : [])

  if (names.length === 0 && !binding.secretRef) {
    return { status: 'none_required' }
  }

  // static_bearer / env_ref with multiple names: ANY alias is enough
  // app_client: ALL listed env names required
  const requireAll = binding.kind === 'app_client'

  if (names.length > 0) {
    if (requireAll) {
      const missing: string[] = []
      for (const name of names) {
        const ref: SecretRef = { backend: 'env', envName: name }
        const v = await store.resolve(ref, env)
        if (!v) missing.push(name)
      }
      if (missing.length === 0) return { status: 'connected' }
      return {
        status: 'missing',
        hint:
          binding.loginHint ??
          `缺少环境变量：${missing.join(', ')}（请写入侧车 .env，勿提交仓库）`,
      }
    }
    for (const name of names) {
      const ref: SecretRef = { backend: 'env', envName: name }
      const v = await store.resolve(ref, env)
      if (v) return { status: 'connected' }
    }
    if (!binding.secretRef) {
      return {
        status: 'missing',
        hint:
          binding.loginHint ??
          `缺少环境变量：${names.join(' / ')}（请写入侧车 .env，勿提交仓库）`,
      }
    }
  }

  if (binding.secretRef) {
    const v = await store.resolve(binding.secretRef, env)
    if (v) return { status: 'connected' }
    return {
      status: 'missing',
      hint: binding.loginHint ?? formatMissingHint(binding.secretRef),
    }
  }

  return {
    status: 'missing',
    hint:
      binding.loginHint ??
      `缺少环境变量：${names.join(' / ')}（请写入侧车 .env，勿提交仓库）`,
  }
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
    return `Keychain 凭据未配置：${ref.account}`
  }
  return `内存凭据缺失：${ref.key}`
}

/** In-memory binding table for tests / ephemeral host state (no secrets). */
export type AuthBindingStore = {
  list(): AuthBinding[]
  get(pluginId: string, resourceId: string): AuthBinding | undefined
  upsert(binding: AuthBinding): void
  clear(pluginId: string, resourceId?: string): void
}

export function createAuthBindingStore(
  initial: AuthBinding[] = [],
): AuthBindingStore {
  const map = new Map<string, AuthBinding>()
  const keyOf = (p: string, r: string) => `${p}::${r}`
  for (const b of initial) map.set(keyOf(b.pluginId, b.resourceId), b)
  return {
    list: () => [...map.values()],
    get: (pluginId, resourceId) => map.get(keyOf(pluginId, resourceId)),
    upsert: (binding) => {
      map.set(keyOf(binding.pluginId, binding.resourceId), binding)
    },
    clear: (pluginId, resourceId) => {
      if (resourceId) {
        map.delete(keyOf(pluginId, resourceId))
        return
      }
      for (const k of [...map.keys()]) {
        if (k.startsWith(`${pluginId}::`)) map.delete(k)
      }
    },
  }
}
