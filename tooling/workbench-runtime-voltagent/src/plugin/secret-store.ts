/**
 * Secret store backends + keychain account encoders.
 *
 * After splitting auth-binding-store.ts (revoke state) and credential-resolver.ts
 * (credential resolution) out, this file owns only: SecretStore interface, the
 * memory/env/keychain/composite factories, and the keychain account encoders.
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

// --- Façade re-exports (symbols moved to dedicated modules) ---
// Kept here so existing direct importers of ./secret-store.js are unaffected.
// The barrel (index.ts) re-exports from the dedicated modules directly.

// auth-binding-store.ts — in-memory binding table + revoke state machine
export {
  createAuthBindingStore,
  splitRevokedSnapshot,
  snapshotAuthBindingStore,
  type AuthBindingStore,
  type AuthBindingStoreSnapshot,
  type CreateAuthBindingStoreOptions,
} from './auth-binding-store.js'

// credential-resolver.ts — credential resolution + auth status
export {
  resolveCredentialMaterial,
  resolveAuthStatus,
  type ResolveAuthStatusProbe,
} from './credential-resolver.js'
