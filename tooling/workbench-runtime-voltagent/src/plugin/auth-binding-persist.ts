/**
 * Persist non-secret AuthBindings at user level (#29).
 * Default: ~/.uilab/runtime/auth-bindings.json — never under Agent workspace.
 */

import {
  mkdirSync,
  renameSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
  openSync,
  fsyncSync,
  closeSync,
  unlinkSync,
  statSync,
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

/** Exclusive lock wait budget for concurrent operator processes. */
const AUTH_BIND_LOCK_STALE_MS = 8_000
const AUTH_BIND_LOCK_WAIT_MS = 5_000

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
    // Only missing file means empty store. Any other I/O failure must fail closed
    // so revoked bindings are not silently discarded (adversarial re-review).
    if (code === 'ENOENT') return null
    if (err instanceof Error) throw err
    throw new Error(`读取 auth-bindings 失败：${String(err)}`)
  }
}

/** Sync load for lock-held RMW / mtime refresh (default FS only). */
export function loadAuthBindingSnapshotSync(
  filePath: string,
): AuthBindingStoreSnapshot | null {
  try {
    // Do not pre-check existsSync — EACCES and other lookup failures must
    // fail closed (not look like "missing file" → empty revoke set).
    const raw = readFileSync(filePath, 'utf8')
    return parseAuthBindingSnapshot(raw)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'ENOENT') return null
    if (err instanceof Error) throw err
    throw new Error(`读取 auth-bindings 失败：${String(err)}`)
  }
}

/**
 * Exclusive lock around auth-bindings RMW (adversarial: concurrent login/logout).
 * Uses O_EXCL lock file. Only steals locks older than AUTH_BIND_LOCK_STALE_MS;
 * never unlinks a live (non-stale) lock on wait timeout.
 */
export function withAuthBindingFileLock(
  filePath: string,
  fn: () => void,
): void {
  const lockPath = `${filePath}.lock`
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  const deadline = Date.now() + AUTH_BIND_LOCK_WAIT_MS
  const ownerToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  while (true) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600)
      try {
        writeFileSync(fd, `${ownerToken}\n`, 'utf8')
        fn()
      } finally {
        closeSync(fd)
        // Only unlink if we still own the lock file
        try {
          const body = readFileSync(lockPath, 'utf8')
          if (body.startsWith(ownerToken)) unlinkSync(lockPath)
        } catch {
          // ignore
        }
      }
      return
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code !== 'EEXIST') throw err
      // Observe lock identity (content + mtime) before any reclaim decision.
      let observedBody = ''
      let stale = false
      try {
        observedBody = readFileSync(lockPath, 'utf8')
        const st = statSync(lockPath)
        stale = Date.now() - st.mtimeMs > AUTH_BIND_LOCK_STALE_MS
      } catch {
        // lock disappeared or unreadable — retry acquire
        continue
      }
      if (stale) {
        // Reclaim only if the lock content is still the same instance we observed.
        // Prevents two waiters from both unlinking after one has already acquired.
        try {
          const current = readFileSync(lockPath, 'utf8')
          if (current === observedBody) unlinkSync(lockPath)
        } catch {
          // ignore race
        }
        continue
      }
      if (Date.now() >= deadline) {
        // Never steal a non-stale lock — fail closed so concurrent writers
        // cannot overwrite each other's revoke.
        throw new Error(
          `auth-bindings 文件锁超时（${AUTH_BIND_LOCK_WAIT_MS}ms）：${lockPath}`,
        )
      }
      // brief backoff
      const waitUntil = Date.now() + 15
      while (Date.now() < waitUntil) {
        /* spin */
      }
    }
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
 * - Atomic 0600 write
 * - Exclusive lock + reload-before-mutate (RMW) so concurrent logout/login
 *   cannot drop a revoke (adversarial re-review)
 * - mtime-based reload on read so a running sidecar sees operator mutations
 *   without process restart (CLI re-resolve path)
 */
export async function createPersistedAuthBindingStore(
  options: CreatePersistedAuthBindingStoreOptions = {},
): Promise<AuthBindingStore & { filePath: string; reloadFromDisk: () => void }> {
  const env = options.env ?? process.env
  const rootDir = options.rootDir ?? defaultRuntimeConfigDir(env)
  if (!options.skipWorkspaceGuard) {
    assertRuntimeConfigOutsideWorkspace(rootDir, env)
  }
  const filePath =
    options.filePath ?? resolveAuthBindingsFilePath(rootDir)
  const io = options.io ?? defaultIo
  const persist = options.persist !== false
  const useRealFs = io === defaultIo && persist

  let snapshot: AuthBindingStoreSnapshot = {
    schemaVersion: 1,
    bindings: [],
    revoked: [],
  }
  if (persist) {
    const loaded = await loadAuthBindingSnapshot(filePath, io)
    if (loaded) snapshot = loaded
  }

  let lastMtimeMs = 0
  try {
    if (useRealFs && existsSync(filePath)) {
      lastMtimeMs = statSync(filePath).mtimeMs
    }
  } catch {
    lastMtimeMs = 0
  }

  let { revoked, reauthorized } = splitRevokedSnapshot(snapshot.revoked)
  let inner = createAuthBindingStore(snapshot.bindings, {
    revoked,
    reauthorized,
  })

  function applySnapshot(snap: AuthBindingStoreSnapshot): void {
    const split = splitRevokedSnapshot(snap.revoked)
    revoked = split.revoked
    reauthorized = split.reauthorized
    inner = createAuthBindingStore(snap.bindings, {
      revoked: split.revoked,
      reauthorized: split.reauthorized,
    })
  }

  function rehydrateFromDisk(): void {
    if (!useRealFs) return
    const loaded = loadAuthBindingSnapshotSync(filePath)
    if (loaded) {
      applySnapshot(loaded)
    } else {
      applySnapshot({ schemaVersion: 1, bindings: [], revoked: [] })
    }
    try {
      lastMtimeMs = existsSync(filePath) ? statSync(filePath).mtimeMs : 0
    } catch {
      lastMtimeMs = 0
    }
  }

  function refreshIfStale(): void {
    if (!useRealFs) return
    try {
      if (!existsSync(filePath)) {
        if (lastMtimeMs !== 0) rehydrateFromDisk()
        return
      }
      const m = statSync(filePath).mtimeMs
      if (m !== lastMtimeMs) rehydrateFromDisk()
    } catch {
      // fail closed: attempt rehydrate; errors propagate from load
      rehydrateFromDisk()
    }
  }

  function flushInner(): void {
    if (!persist) return
    const snap = snapshotAuthBindingStore(inner)
    const body = snapshotBody(snap)
    if (useRealFs) {
      atomicWriteFileSync(filePath, body)
      try {
        lastMtimeMs = statSync(filePath).mtimeMs
      } catch {
        // ignore
      }
    } else {
      void io.writeFile(filePath, body, 'utf8')
    }
  }

  function mutate(mutator: () => void): void {
    if (!useRealFs) {
      mutator()
      flushInner()
      return
    }
    withAuthBindingFileLock(filePath, () => {
      // RMW: reload under lock so we never clobber a concurrent revoke
      rehydrateFromDisk()
      mutator()
      flushInner()
    })
  }

  return {
    filePath,
    reloadFromDisk: rehydrateFromDisk,
    list: () => {
      refreshIfStale()
      return inner.list()
    },
    get: (p, r) => {
      refreshIfStale()
      return inner.get(p, r)
    },
    listRevoked: () => {
      refreshIfStale()
      return inner.listRevoked()
    },
    isRevoked: (p, r) => {
      refreshIfStale()
      return inner.isRevoked(p, r)
    },
    upsert: (binding) => {
      mutate(() => {
        inner.upsert(binding)
      })
    },
    upsertIfNotRevoked: (binding) => {
      let committed = false
      mutate(() => {
        // Under lock after rehydrate: logout concurrent with refresh cannot lose
        committed = inner.upsertIfNotRevoked(binding)
      })
      return committed
    },
    clear: (pluginId, resourceId) => {
      mutate(() => {
        inner.clear(pluginId, resourceId)
      })
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
