/**
 * Local plugin.json discovery (#23).
 * Declarative JSON only — never loads arbitrary external JS.
 */

import { access, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  AuthResourceContribution,
  CliArgParam,
  CliCommandContribution,
  CliContribution,
  McpContribution,
  PluginContributes,
  PluginManifest,
  SkillsContribution,
} from './manifest.js'
import { parseEnvStringList } from './parse-util.js'
import type { ProfileEnv } from './types.js'

export type PluginDiscoveryFailure = {
  /** Best-effort id from JSON or path basename */
  id: string
  sourcePath: string
  reason: string
}

export type PluginDiscoveryResult = {
  manifests: PluginManifest[]
  failures: PluginDiscoveryFailure[]
  /** Absolute paths that were scanned */
  scannedPaths: string[]
}

const CREDENTIAL_KINDS = new Set([
  'env_ref',
  'static_bearer',
  'oauth2',
  'cli_session',
  'app_client',
])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return undefined
  return v as string[]
}

/**
 * Validate and normalize a raw plugin.json object into PluginManifest.
 * Forces kind=local for filesystem plugins. Rejects in-process tools modules.
 */
export function parsePluginManifestJson(
  raw: unknown,
  sourcePath: string,
): { ok: true; manifest: PluginManifest } | { ok: false; reason: string; id: string } {
  const fallbackId = path.basename(path.dirname(sourcePath)) || 'unknown'

  if (!isRecord(raw)) {
    return { ok: false, id: fallbackId, reason: 'plugin.json 根必须是对象' }
  }

  const id = asString(raw.id) ?? fallbackId
  const schemaVersion = raw.schemaVersion
  if (schemaVersion !== 1) {
    return {
      ok: false,
      id,
      reason: `不支持的 schemaVersion：${String(schemaVersion)}（需要 1）`,
    }
  }

  const name = asString(raw.name)
  const version = asString(raw.version)
  if (!asString(raw.id)) {
    return { ok: false, id, reason: '缺少 id' }
  }
  if (!name) return { ok: false, id, reason: '缺少 name' }
  if (!version) return { ok: false, id, reason: '缺少 version' }

  // External JSON plugins cannot load arbitrary JS tools (MVP hard rule).
  if (isRecord(raw.contributes) && raw.contributes.tools != null) {
    return {
      ok: false,
      id,
      reason:
        '外部 plugin.json 禁止 contributes.tools（不可加载任意 JS）；仅允许 mcp / cli / skills / auth',
    }
  }

  let contributes: PluginContributes | undefined
  if (raw.contributes != null) {
    const c = parseContributes(raw.contributes, id)
    if (!c.ok) return { ok: false, id, reason: c.reason }
    contributes = c.contributes
  }

  const enabledByDefault =
    typeof raw.enabledByDefault === 'boolean' ? raw.enabledByDefault : false

  const manifest: PluginManifest = {
    schemaVersion: 1,
    id: raw.id as string,
    name,
    version,
    kind: 'local',
    enabledByDefault,
    contributes,
  }
  return { ok: true, manifest }
}

function parseContributes(
  raw: unknown,
  pluginId: string,
):
  | { ok: true; contributes: PluginContributes }
  | { ok: false; reason: string } {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'contributes 必须是对象' }
  }

  const contributes: PluginContributes = {}

  if (raw.mcp != null) {
    if (!Array.isArray(raw.mcp)) {
      return { ok: false, reason: 'contributes.mcp 必须是数组' }
    }
    const mcp: McpContribution[] = []
    for (const item of raw.mcp) {
      if (!isRecord(item)) {
        return { ok: false, reason: 'mcp 项必须是对象' }
      }
      const serverId = asString(item.serverId)
      if (!serverId) {
        return { ok: false, reason: 'mcp.serverId 必填' }
      }
      mcp.push({
        serverId,
        urlFromEnv: asStringArray(item.urlFromEnv),
        commandFromEnv: asStringArray(item.commandFromEnv),
        argsFromEnv: asStringArray(item.argsFromEnv),
        bearerTokenFromEnv: asStringArray(item.bearerTokenFromEnv),
        childEnvKeys: asStringArray(item.childEnvKeys),
        timeoutMs:
          typeof item.timeoutMs === 'number' ? item.timeoutMs : undefined,
        readOnlyToolNames: asStringArray(item.readOnlyToolNames),
      })
    }
    contributes.mcp = mcp
  }

  if (raw.skills != null) {
    if (!isRecord(raw.skills)) {
      return { ok: false, reason: 'contributes.skills 必须是对象' }
    }
    const skills: SkillsContribution = {
      virtualRoot: asString(raw.skills.virtualRoot),
      workspaceDir: asString(raw.skills.workspaceDir),
      skillIds: asStringArray(raw.skills.skillIds),
      bundledRelativeDir: asString(raw.skills.bundledRelativeDir),
      outputDirs: asStringArray(raw.skills.outputDirs),
      seedStrategy:
        raw.skills.seedStrategy === 'missing-only' ? 'missing-only' : undefined,
    }
    contributes.skills = skills
  }

  if (raw.cli != null) {
    if (!Array.isArray(raw.cli)) {
      return { ok: false, reason: 'contributes.cli 必须是数组' }
    }
    const cli: CliContribution[] = []
    for (const item of raw.cli) {
      if (!isRecord(item)) {
        return { ok: false, reason: 'cli 项必须是对象' }
      }
      const cliId = asString(item.cliId)
      if (!cliId) return { ok: false, reason: 'cli.cliId 必填' }
      if (!Array.isArray(item.commands)) {
        return { ok: false, reason: `cli ${cliId} 缺少 commands 数组` }
      }
      const commands: CliCommandContribution[] = []
      for (const cmd of item.commands) {
        if (!isRecord(cmd)) {
          return { ok: false, reason: `cli ${cliId} command 必须是对象` }
        }
        const name = asString(cmd.name)
        const argv = asStringArray(cmd.argv)
        if (!name || !argv?.length) {
          return {
            ok: false,
            reason: `cli ${cliId} 命令需要 name 与非空 argv`,
          }
        }
        let parameters: CliArgParam[] | undefined
        if (Array.isArray(cmd.parameters)) {
          parameters = []
          for (const p of cmd.parameters) {
            if (!isRecord(p)) continue
            const pname = asString(p.name)
            if (!pname) continue
            const ptype: CliArgParam['type'] =
              p.type === 'number' || p.type === 'boolean' ? p.type : 'string'
            parameters.push({
              name: pname,
              type: ptype,
              description: asString(p.description),
              required:
                typeof p.required === 'boolean' ? p.required : undefined,
            })
          }
        }
        commands.push({
          name,
          argv,
          description: asString(cmd.description),
          needsApproval:
            typeof cmd.needsApproval === 'boolean'
              ? cmd.needsApproval
              : undefined,
          readOnly: typeof cmd.readOnly === 'boolean' ? cmd.readOnly : undefined,
          timeoutMs: typeof cmd.timeoutMs === 'number' ? cmd.timeoutMs : undefined,
          parameters,
        })
      }
      cli.push({
        cliId,
        command: asString(item.command),
        commandFromEnv: asStringArray(item.commandFromEnv),
        packageHint: asString(item.packageHint),
        childEnvKeys: asStringArray(item.childEnvKeys),
        defaultCwd:
          item.defaultCwd === 'workspace' ||
          item.defaultCwd === 'plugin' ||
          typeof item.defaultCwd === 'string'
            ? (item.defaultCwd as CliContribution['defaultCwd'])
            : undefined,
        commands,
      })
    }
    contributes.cli = cli
  }

  if (raw.auth != null) {
    if (!Array.isArray(raw.auth)) {
      return { ok: false, reason: 'contributes.auth 必须是数组' }
    }
    const auth: AuthResourceContribution[] = []
    for (const item of raw.auth) {
      if (!isRecord(item)) {
        return { ok: false, reason: 'auth 项必须是对象' }
      }
      const resourceId = asString(item.resourceId)
      const kind = asString(item.kind)
      if (!resourceId || !kind || !CREDENTIAL_KINDS.has(kind)) {
        return {
          ok: false,
          reason: `auth 需要 resourceId 与合法 kind（插件 ${pluginId}）`,
        }
      }
      let secretRef: AuthResourceContribution['secretRef']
      if (item.secretRef != null) {
        if (!isRecord(item.secretRef)) {
          return { ok: false, reason: 'auth.secretRef 必须是对象' }
        }
        const backend = asString(item.secretRef.backend)
        if (backend === 'env' && asString(item.secretRef.envName)) {
          secretRef = {
            backend: 'env',
            envName: item.secretRef.envName as string,
          }
        } else if (backend === 'memory' && asString(item.secretRef.key)) {
          secretRef = { backend: 'memory', key: item.secretRef.key as string }
        } else if (backend === 'keychain' && asString(item.secretRef.account)) {
          secretRef = {
            backend: 'keychain',
            account: item.secretRef.account as string,
          }
        } else {
          return { ok: false, reason: 'auth.secretRef 格式无效' }
        }
      }
      auth.push({
        resourceId,
        kind: kind as AuthResourceContribution['kind'],
        envNames: asStringArray(item.envNames),
        secretRef,
        loginHint: asString(item.loginHint),
        statusCommand: isRecord(item.statusCommand)
          ? {
              command: asString(item.statusCommand.command),
              commandFromEnv: asStringArray(item.statusCommand.commandFromEnv),
              argv: asStringArray(item.statusCommand.argv),
              expectExitCode:
                typeof item.statusCommand.expectExitCode === 'number'
                  ? item.statusCommand.expectExitCode
                  : undefined,
            }
          : undefined,
      })
    }
    contributes.auth = auth
  }

  return { ok: true, contributes }
}

export async function loadPluginJsonFile(
  filePath: string,
): Promise<
  | { ok: true; manifest: PluginManifest; sourcePath: string }
  | { ok: false; failure: PluginDiscoveryFailure }
> {
  const sourcePath = path.resolve(filePath)
  try {
    const text = await readFile(sourcePath, 'utf8')
    let raw: unknown
    try {
      raw = JSON.parse(text) as unknown
    } catch (err) {
      return {
        ok: false,
        failure: {
          id: path.basename(path.dirname(sourcePath)),
          sourcePath,
          reason: `JSON 解析失败：${err instanceof Error ? err.message : String(err)}`,
        },
      }
    }
    const parsed = parsePluginManifestJson(raw, sourcePath)
    if (!parsed.ok) {
      return {
        ok: false,
        failure: {
          id: parsed.id,
          sourcePath,
          reason: parsed.reason,
        },
      }
    }
    return { ok: true, manifest: parsed.manifest, sourcePath }
  } catch (err) {
    return {
      ok: false,
      failure: {
        id: path.basename(path.dirname(sourcePath)),
        sourcePath,
        reason: `读取失败：${err instanceof Error ? err.message : String(err)}`,
      },
    }
  }
}

/**
 * Resolve PLUGIN_PATHS (or explicit paths) into absolute directory/file list.
 */
export function resolvePluginSearchPaths(
  env: ProfileEnv = process.env,
  explicit?: string[],
): string[] {
  const fromEnv = parseEnvStringList(env.PLUGIN_PATHS) ?? []
  const raw = explicit?.length ? explicit : fromEnv
  return raw
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p))
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Discover plugin.json under each search path.
 * - File path ending with plugin.json → load that file
 * - Directory containing plugin.json → load it
 * - Directory with subdirs → each subdir's plugin.json
 */
export async function discoverLocalPlugins(options?: {
  env?: ProfileEnv
  paths?: string[]
  /** Existing ids (builtins) — duplicate local id becomes failure */
  reservedIds?: ReadonlySet<string>
}): Promise<PluginDiscoveryResult> {
  const env = options?.env ?? process.env
  const searchPaths = resolvePluginSearchPaths(env, options?.paths)
  const reserved = options?.reservedIds ?? new Set<string>()
  const manifests: PluginManifest[] = []
  const failures: PluginDiscoveryFailure[] = []
  const scannedPaths: string[] = []
  const seenIds = new Set<string>(reserved)

  for (const search of searchPaths) {
    scannedPaths.push(search)
    if (!(await pathExists(search))) {
      failures.push({
        id: path.basename(search),
        sourcePath: search,
        reason: '路径不存在',
      })
      continue
    }

    const st = await stat(search)
    const candidateFiles: string[] = []

    if (st.isFile()) {
      if (path.basename(search) === 'plugin.json') {
        candidateFiles.push(search)
      } else {
        failures.push({
          id: path.basename(search),
          sourcePath: search,
          reason: 'PLUGIN_PATHS 文件必须是 plugin.json',
        })
        continue
      }
    } else if (st.isDirectory()) {
      const direct = path.join(search, 'plugin.json')
      if (await pathExists(direct)) {
        candidateFiles.push(direct)
      } else {
        const entries = await readdir(search, { withFileTypes: true })
        for (const ent of entries) {
          if (!ent.isDirectory()) continue
          const nested = path.join(search, ent.name, 'plugin.json')
          if (await pathExists(nested)) candidateFiles.push(nested)
        }
        if (candidateFiles.length === 0) {
          failures.push({
            id: path.basename(search),
            sourcePath: search,
            reason: '目录下未找到 plugin.json',
          })
        }
      }
    }

    for (const file of candidateFiles) {
      const loaded = await loadPluginJsonFile(file)
      if (!loaded.ok) {
        failures.push(loaded.failure)
        continue
      }
      if (seenIds.has(loaded.manifest.id)) {
        failures.push({
          id: loaded.manifest.id,
          sourcePath: loaded.sourcePath,
          reason: `插件 id 冲突：${loaded.manifest.id} 已存在（builtin 优先）`,
        })
        continue
      }
      seenIds.add(loaded.manifest.id)
      manifests.push(loaded.manifest)
    }
  }

  return { manifests, failures, scannedPaths }
}
