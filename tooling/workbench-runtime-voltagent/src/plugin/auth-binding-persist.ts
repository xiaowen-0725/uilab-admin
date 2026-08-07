/**
 * Persist non-secret AuthBindings at user level (#29).
 * Default: ~/.uilab/runtime/auth-bindings.json — never under Agent workspace.
 */

import {
  mkdirSync,
  renameSync,
  writeFileSync,
  existsSync,
  realpathSync,
  openSync,
  fsyncSync,
  closeSync,
  unlinkSync,
  constants as fsConstants,
} from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { AuthBinding, ProfileEnv, SecretRef } from './types.js'
import {
  createAuthBindingStore,
  snapshotAuthBindingStore,
  splitRevokedSnapshot,
  type AuthBindingStore,
  type AuthBindingStoreSnapshot,
} from './secret-store.js'

export const AUTH_BINDINGS_FILENAME = 'auth-bindings.json'
export const RUNTIME_CONFIG_DIRNAME = path.join('.uilab', 'runtime')

/** Default user-level config dir: ~/.uilab/runtime (not workspace). */
export function defaultRuntimeConfigDir(
  env: ProfileEnv = process.env,
  homedir: () => string = () => os.homedir(),
): string {
  const override = env.UILAB_RUNTIME_DIR?.trim()
  if (override) return path.resolve(override)
  return path.join(homedir(), RUNTIME_CONFIG_DIRNAME)
}

export function resolveAuthBindingsFilePath(
  rootDir: string,
  filename = AUTH_BINDINGS_FILENAME,
): string {
  return path.join(rootDir, filename)
}

/**
 * Reject runtime config under agent-writable WORKSPACE_ROOT (adversarial P1).
 */
export function assertRuntimeConfigOutsideWorkspace(
  rootDir: string,
  env: ProfileEnv = process.env,
): void {
  const ws = env.WORKSPACE_ROOT?.trim()
  if (!ws) return
  let rootReal: string
  let wsReal: string
  try {
    rootReal = realpathSync(path.resolve(rootDir))
  } catch {
    rootReal = path.resolve(rootDir)
  }
  try {
    wsReal = realpathSync(path.resolve(ws))
  } catch {
    wsReal = path.resolve(ws)
  }
  const rel = path.relative(wsReal, rootReal)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(
      `UILAB_RUNTIME_DIR/auth 配置目录不得位于 WORKSPACE_ROOT 内（agent 可写）：${rootReal}`,
    )
  }
}

export type AuthBindingPersistIo = {
  readFile: (p: string, enc: 'utf8') => Promise<string>
  writeFile: (p: string, data: string, enc: 'utf8') => Promise<void>
  mkdir: (p: string, opts: { recursive: boolean }) => Promise<string | undefined>
}

const defaultIo: AuthBindingPersistIo = {
  readFile: (p, enc) => readFile(p, enc),
  writeFile: (p, data, enc) => writeFile(p, data, enc),
  mkdir: (p, opts) => mkdir(p, opts),
}

/** Strict SecretRef: only known backends + known fields. */
export function parseStrictSecretRef(raw: unknown): SecretRef {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('auth-bindings secretRef 必须是对象')
  }
  const ref = raw as Record<string, unknown>
  const keys = Object.keys(ref)
  const backend = ref.backend
  if (backend === 'env') {
    for (const k of keys) {
      if (k !== 'backend' && k !== 'envName') {
        throw new Error(`auth-bindings secretRef.env 禁止未知字段：${k}`)
      }
    }
    if (typeof ref.envName !== 'string' || !ref.envName) {
      throw new Error('auth-bindings secretRef.env 需要 envName')
    }
    return { backend: 'env', envName: ref.envName }
  }
  if (backend === 'memory') {
    for (const k of keys) {
      if (k !== 'backend' && k !== 'key') {
        throw new Error(`auth-bindings secretRef.memory 禁止未知字段：${k}`)
      }
    }
    if (typeof ref.key !== 'string' || !ref.key) {
      throw new Error('auth-bindings secretRef.memory 需要 key')
    }
    return { backend: 'memory', key: ref.key }
  }
  if (backend === 'keychain') {
    for (const k of keys) {
      if (k !== 'backend' && k !== 'account') {
        throw new Error(`auth-bindings secretRef.keychain 禁止未知字段：${k}`)
      }
    }
    if (typeof ref.account !== 'string' || !ref.account) {
      throw new Error('auth-bindings secretRef.keychain 需要 account')
    }
    return { backend: 'keychain', account: ref.account }
  }
  throw new Error(`auth-bindings secretRef 未知 backend：${String(backend)}`)
}

/**
 * Parse disk JSON. Rejects secret-looking values and unknown SecretRef fields.
 */
export function parseAuthBindingSnapshot(raw: string): AuthBindingStoreSnapshot {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('auth-bindings.json 不是合法 JSON')
  }
  if (!data || typeof data !== 'object') {
    throw new Error('auth-bindings.json 根对象无效')
  }
  const obj = data as Record<string, unknown>
  if (obj.schemaVersion !== 1) {
    throw new Error(`不支持的 auth-bindings schemaVersion：${String(obj.schemaVersion)}`)
  }
  const bindingsRaw = Array.isArray(obj.bindings) ? obj.bindings : []
  const revokedRaw = Array.isArray(obj.revoked) ? obj.revoked : []
  const bindings: AuthBinding[] = []
  for (const item of bindingsRaw) {
    const b = parseBindingItem(item)
    if (b) bindings.push(b)
  }
  const revoked = revokedRaw
    .filter((x): x is string => typeof x === 'string' && (x.includes('::') || x.startsWith('!')))
  return { schemaVersion: 1, bindings, revoked }
}

function parseBindingItem(item: unknown): AuthBinding | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  if (typeof o.pluginId !== 'string' || typeof o.resourceId !== 'string') {
    return null
  }
  if (typeof o.kind !== 'string') return null
  const allowedTop = new Set([
    'pluginId',
    'resourceId',
    'kind',
    'envNames',
    'secretRef',
    'loginHint',
    'expiresAt',
    'oauth',
    'statusCommand',
  ])
  for (const key of Object.keys(o)) {
    if (!allowedTop.has(key)) {
      throw new Error(`auth-bindings binding 禁止未知字段：${key}`)
    }
    if (/token|secret|password|pat/i.test(key) && key !== 'secretRef') {
      throw new Error(
        `auth-bindings 禁止存储疑似密文字段：${key}（仅允许 SecretRef 指针）`,
      )
    }
  }

  let secretRef: SecretRef | undefined
  if (o.secretRef != null) {
    secretRef = parseStrictSecretRef(o.secretRef)
  }

  let oauth: AuthBinding['oauth']
  if (o.oauth != null) {
    if (typeof o.oauth !== 'object' || Array.isArray(o.oauth)) {
      throw new Error('auth-bindings oauth 必须是对象')
    }
    const m = o.oauth as Record<string, unknown>
    const allowedOauth = new Set([
      'tokenEndpoint',
      'clientId',
      'refreshAccount',
      'authorizationEndpoint',
      'redirectUri',
      'scopes',
    ])
    for (const k of Object.keys(m)) {
      if (!allowedOauth.has(k)) {
        throw new Error(`auth-bindings oauth 禁止未知字段：${k}`)
      }
    }
    if (
      typeof m.tokenEndpoint !== 'string' ||
      typeof m.clientId !== 'string' ||
      typeof m.refreshAccount !== 'string'
    ) {
      throw new Error('auth-bindings oauth 缺少 tokenEndpoint/clientId/refreshAccount')
    }
    oauth = {
      tokenEndpoint: m.tokenEndpoint,
      clientId: m.clientId,
      refreshAccount: m.refreshAccount,
      authorizationEndpoint:
        typeof m.authorizationEndpoint === 'string'
          ? m.authorizationEndpoint
          : undefined,
      redirectUri:
        typeof m.redirectUri === 'string' ? m.redirectUri : undefined,
      scopes: Array.isArray(m.scopes)
        ? m.scopes.filter((x): x is string => typeof x === 'string')
        : undefined,
    }
  }

  return {
    pluginId: o.pluginId,
    resourceId: o.resourceId,
    kind: o.kind as AuthBinding['kind'],
    envNames: Array.isArray(o.envNames)
      ? o.envNames.filter((x): x is string => typeof x === 'string')
      : undefined,
    secretRef,
    loginHint: typeof o.loginHint === 'string' ? o.loginHint : undefined,
    expiresAt: typeof o.expiresAt === 'number' ? o.expiresAt : undefined,
    oauth,
    statusCommand:
      o.statusCommand && typeof o.statusCommand === 'object'
        ? {
            command: String(
              (o.statusCommand as { command?: string }).command ?? '',
            ),
            argv: Array.isArray((o.statusCommand as { argv?: unknown }).argv)
              ? ((o.statusCommand as { argv: unknown[] }).argv.filter(
                  (x) => typeof x === 'string',
                ) as string[])
              : undefined,
          }
        : undefined,
  }
}

export async function loadAuthBindingSnapshot(
  filePath: string,
  io: AuthBindingPersistIo = defaultIo,
): Promise<AuthBindingStoreSnapshot | null> {
  try {
    const raw = await io.readFile(filePath, 'utf8')
    return parseAuthBindingSnapshot(raw)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'ENOENT') return null
    if (err instanceof Error && err.message.includes('auth-bindings')) {
      throw err
    }
    return null
  }
}

function snapshotBody(snapshot: AuthBindingStoreSnapshot): string {
  const safe: AuthBindingStoreSnapshot = {
    schemaVersion: 1,
    bindings: snapshot.bindings.map((b) => ({
      pluginId: b.pluginId,
      resourceId: b.resourceId,
      kind: b.kind,
      envNames: b.envNames,
      secretRef: b.secretRef
        ? parseStrictSecretRef(b.secretRef)
        : undefined,
      loginHint: b.loginHint,
      expiresAt: b.expiresAt,
      oauth: b.oauth,
      statusCommand: b.statusCommand,
    })),
    revoked: [...snapshot.revoked],
  }
  const body = `${JSON.stringify(safe, null, 2)}\n`
  if (/\b(ghp_|sk-|Bearer\s+\S+)/i.test(body)) {
    throw new Error('拒绝写入疑似 secret 的 auth-bindings 内容')
  }
  return body
}

/** Atomic write: temp file → fsync → rename (0600). */
export function atomicWriteFileSync(filePath: string, body: string): void {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeFileSync(fd, body, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmp, filePath)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      // ignore
    }
    throw err
  }
}

export async function saveAuthBindingSnapshot(
  filePath: string,
  snapshot: AuthBindingStoreSnapshot,
  io: AuthBindingPersistIo = defaultIo,
): Promise<void> {
  const dir = path.dirname(filePath)
  await io.mkdir(dir, { recursive: true })
  const body = snapshotBody(snapshot)
  // Prefer atomic sync path for real FS; fall back to io for tests
  if (io === defaultIo) {
    atomicWriteFileSync(filePath, body)
  } else {
    await io.writeFile(filePath, body, 'utf8')
  }
}

export type CreatePersistedAuthBindingStoreOptions = {
  /** Defaults to defaultRuntimeConfigDir() */
  rootDir?: string
  filePath?: string
  env?: ProfileEnv
  io?: AuthBindingPersistIo
  /** When false, mutations stay in memory only */
  persist?: boolean
  /** Skip WORKSPACE_ROOT containment check (tests only) */
  skipWorkspaceGuard?: boolean
}

/**
 * AuthBindingStore that flushes non-secret snapshot after upsert/clear (#29).
 * Uses atomic sync write so mutations are durable before return.
 */
export async function createPersistedAuthBindingStore(
  options: CreatePersistedAuthBindingStoreOptions = {},
): Promise<AuthBindingStore & { filePath: string }> {
  const env = options.env ?? process.env
  const rootDir = options.rootDir ?? defaultRuntimeConfigDir(env)
  if (!options.skipWorkspaceGuard) {
    assertRuntimeConfigOutsideWorkspace(rootDir, env)
  }
  const filePath =
    options.filePath ?? resolveAuthBindingsFilePath(rootDir)
  const io = options.io ?? defaultIo
  const persist = options.persist !== false

  let snapshot: AuthBindingStoreSnapshot = {
    schemaVersion: 1,
    bindings: [],
    revoked: [],
  }
  if (persist) {
    const loaded = await loadAuthBindingSnapshot(filePath, io)
    if (loaded) snapshot = loaded
  }

  const { revoked, reauthorized } = splitRevokedSnapshot(snapshot.revoked)
  const inner = createAuthBindingStore(snapshot.bindings, {
    revoked,
    reauthorized,
  })

  function flushSync(): void {
    if (!persist) return
    const snap = snapshotAuthBindingStore(inner)
    const body = snapshotBody(snap)
    if (io === defaultIo) {
      atomicWriteFileSync(filePath, body)
    } else {
      // test io is async-only; fire best-effort via writeFileSync-like path not available
      void io.writeFile(filePath, body, 'utf8')
    }
  }

  return {
    filePath,
    list: () => inner.list(),
    get: (p, r) => inner.get(p, r),
    listRevoked: () => inner.listRevoked(),
    isRevoked: (p, r) => inner.isRevoked(p, r),
    upsert: (binding) => {
      inner.upsert(binding)
      flushSync()
    },
    clear: (pluginId, resourceId) => {
      inner.clear(pluginId, resourceId)
      flushSync()
    },
  }
}

/** Awaitable flush helper for tests / operator after mutations. */
export async function flushAuthBindingStore(
  store: AuthBindingStore,
  filePath: string,
  io: AuthBindingPersistIo = defaultIo,
): Promise<void> {
  await saveAuthBindingSnapshot(filePath, snapshotAuthBindingStore(store), io)
}

// silence unused import when tree-shaken
void fsConstants
