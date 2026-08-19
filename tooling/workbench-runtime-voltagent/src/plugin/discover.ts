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
  ConnectorContribution,
  McpContribution,
  PluginContributes,
  PluginManifest,
  QueryContribution,
  QueryParameterDecl,
  SkillsContribution,
} from './manifest.js'
import { parseEnvStringList } from './parse-util.js'
import {
  isAllowedAuthEnvName,
  isModelProviderSecretKey,
} from './security-policy.js'
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
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))
    return undefined
  return v as string[]
}

/**
 * Validate and normalize a raw plugin.json object into PluginManifest.
 * Forces kind=local for filesystem plugins. Rejects in-process tools modules.
 */
export function parsePluginManifestJson(
  raw: unknown,
  sourcePath: string,
):
  | { ok: true; manifest: PluginManifest }
  | { ok: false; reason: string; id: string } {
  const fallbackId = path.basename(path.dirname(sourcePath)) || 'unknown'

  if (!isRecord(raw)) {
    return { ok: false, id: fallbackId, reason: 'plugin.json 根必须是对象' }
  }

  const rawId = asString(raw.id)
  const id = rawId ?? fallbackId
  // Canonical id: no leading/trailing whitespace or control chars
  if (rawId && rawId !== String(raw.id).trim()) {
    return {
      ok: false,
      id,
      reason: 'id 不得含首尾空白',
    }
  }
  if (rawId && /[\s\u0000-\u001f]/.test(rawId)) {
    return {
      ok: false,
      id,
      reason: 'id 不得含空白或控制字符',
    }
  }
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
  if (!rawId) {
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
        '外部 plugin.json 禁止 contributes.tools（不可加载任意 JS）；仅允许 connectors / mcp / cli / skills / auth / queries',
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
    id: rawId,
    name,
    version,
    kind: 'local',
    enabledByDefault,
    contributes,
  }
  return { ok: true, manifest }
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string }

function parseMcpContributions(raw: unknown): ParseResult<McpContribution[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'contributes.mcp 必须是数组' }
  }
  const mcp: McpContribution[] = []
  for (const item of raw) {
    if (!isRecord(item)) {
      return { ok: false, reason: 'mcp 项必须是对象' }
    }
    const serverId = asString(item.serverId)
    if (!serverId) {
      return { ok: false, reason: 'mcp.serverId 必填' }
    }
    const bearerTokenFromEnv = asStringArray(item.bearerTokenFromEnv) ?? []
    for (const name of bearerTokenFromEnv) {
      if (!isAllowedAuthEnvName(name) || isModelProviderSecretKey(name)) {
        return {
          ok: false,
          reason: `mcp.bearerTokenFromEnv 禁止模型密钥：${name}`,
        }
      }
    }
    mcp.push({
      serverId,
      url: asString(item.url),
      urlFromEnv: asStringArray(item.urlFromEnv),
      commandFromEnv: asStringArray(item.commandFromEnv),
      argsFromEnv: asStringArray(item.argsFromEnv),
      bearerTokenFromEnv,
      childEnvKeys: asStringArray(item.childEnvKeys),
      timeoutMs:
        typeof item.timeoutMs === 'number' ? item.timeoutMs : undefined,
      readOnlyToolNames: asStringArray(item.readOnlyToolNames),
      toolNamePrefix: asString(item.toolNamePrefix),
    })
  }
  return { ok: true, value: mcp }
}

function parseSkillsContribution(
  raw: unknown,
): ParseResult<SkillsContribution> {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'contributes.skills 必须是对象' }
  }
  if (raw.installedSource != null) {
    return {
      ok: false,
      reason: 'contributes.skills.installedSource 仅允许受信任内置插件使用',
    }
  }
  return {
    ok: true,
    value: {
      virtualRoot: asString(raw.virtualRoot),
      workspaceDir: asString(raw.workspaceDir),
      skillIds: asStringArray(raw.skillIds),
      bundledRelativeDir: asString(raw.bundledRelativeDir),
      outputDirs: asStringArray(raw.outputDirs),
      seedStrategy:
        raw.seedStrategy === 'missing-only' ? 'missing-only' : undefined,
    },
  }
}

function parseConnectorContributions(
  raw: unknown,
): ParseResult<ConnectorContribution[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'contributes.connectors 必须是数组' }
  }
  const connectors: ConnectorContribution[] = []
  for (const item of raw) {
    if (!isRecord(item)) {
      return { ok: false, reason: 'connector 项必须是对象' }
    }
    const id = asString(item.id)
    const name = asString(item.name)
    const description = asString(item.description)
    const authResourceId = asString(item.authResourceId)
    const authKind = asString(item.authKind)
    const primaryChannel = asString(item.primaryChannel)
    const availability = asString(item.availability)
    const toolScope = asStringArray(item.toolScope)
    const commandScopes =
      item.commandScopes == null ? [] : asStringArray(item.commandScopes)
    if (!id || !name || !description || !authResourceId) {
      return {
        ok: false,
        reason: 'connector 需要 id / name / description / authResourceId',
      }
    }
    if (!authKind || !CREDENTIAL_KINDS.has(authKind)) {
      return { ok: false, reason: `connector ${id} authKind 无效` }
    }
    if (
      primaryChannel !== 'domain_cli' &&
      primaryChannel !== 'mcp' &&
      primaryChannel !== 'hybrid' &&
      primaryChannel !== 'none'
    ) {
      return { ok: false, reason: `connector ${id} primaryChannel 无效` }
    }
    if (
      availability !== 'sidecar' &&
      availability !== 'fake-catalog-only' &&
      availability !== 'missing-binary'
    ) {
      return { ok: false, reason: `connector ${id} availability 无效` }
    }
    if (!toolScope) {
      return { ok: false, reason: `connector ${id} toolScope 必须是字符串数组` }
    }
    if (!commandScopes) {
      return {
        ok: false,
        reason: `connector ${id} commandScopes 必须是字符串数组`,
      }
    }
    if (!Array.isArray(item.capabilities)) {
      return { ok: false, reason: `connector ${id} capabilities 必须是数组` }
    }
    const capabilities: ConnectorContribution['capabilities'] = []
    for (const rawCapability of item.capabilities) {
      if (!isRecord(rawCapability)) {
        return { ok: false, reason: `connector ${id} capability 必须是对象` }
      }
      const capabilityId = asString(rawCapability.id)
      const capabilityName = asString(rawCapability.name)
      const channel = asString(rawCapability.channel)
      const toolNames = asStringArray(rawCapability.toolNames)
      if (
        !capabilityId ||
        !capabilityName ||
        (channel !== 'domain_cli' && channel !== 'mcp' && channel !== 'none') ||
        !toolNames ||
        typeof rawCapability.available !== 'boolean'
      ) {
        return { ok: false, reason: `connector ${id} capability 字段无效` }
      }
      capabilities.push({
        id: capabilityId,
        name: capabilityName,
        description: asString(rawCapability.description),
        channel,
        toolNames,
        available: rawCapability.available,
      })
    }

    let channelAuth: ConnectorContribution['channelAuth']
    if (item.channelAuth != null) {
      if (!Array.isArray(item.channelAuth)) {
        return { ok: false, reason: `connector ${id} channelAuth 必须是数组` }
      }
      channelAuth = []
      for (const rawAuth of item.channelAuth) {
        if (!isRecord(rawAuth)) {
          return { ok: false, reason: `connector ${id} channelAuth 项无效` }
        }
        const channel = asString(rawAuth.channel)
        const rowAuthKind = asString(rawAuth.authKind)
        const label = asString(rawAuth.label)
        if (
          (channel !== 'domain_cli' && channel !== 'mcp') ||
          !rowAuthKind ||
          !CREDENTIAL_KINDS.has(rowAuthKind) ||
          !label
        ) {
          return { ok: false, reason: `connector ${id} channelAuth 字段无效` }
        }
        channelAuth.push({
          channel,
          authKind: rowAuthKind as ConnectorContribution['authKind'],
          resourceId: asString(rawAuth.resourceId),
          label,
        })
      }
    }

    connectors.push({
      id,
      name,
      description,
      authResourceId,
      authKind: authKind as ConnectorContribution['authKind'],
      primaryChannel,
      capabilities,
      commandScopes,
      toolScope,
      availability,
      channelAuth,
      packageHint: asString(item.packageHint),
      loginHint: asString(item.loginHint),
    })
  }
  return { ok: true, value: connectors }
}

function parseCliCommand(
  cmd: unknown,
  cliId: string,
): ParseResult<CliCommandContribution> {
  if (!isRecord(cmd)) {
    return { ok: false, reason: `cli ${cliId} command 必须是对象` }
  }
  const name = asString(cmd.name)
  const argv = asStringArray(cmd.argv)
  if (cmd.passthroughArgvParam != null) {
    return {
      ok: false,
      reason: `cli ${cliId} argv passthrough 仅允许仓库内受信 builtin Provider`,
    }
  }
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
        required: typeof p.required === 'boolean' ? p.required : undefined,
      })
    }
  }
  return {
    ok: true,
    value: {
      name,
      argv,
      description: asString(cmd.description),
      needsApproval:
        typeof cmd.needsApproval === 'boolean' ? cmd.needsApproval : undefined,
      readOnly: typeof cmd.readOnly === 'boolean' ? cmd.readOnly : undefined,
      timeoutMs: typeof cmd.timeoutMs === 'number' ? cmd.timeoutMs : undefined,
      parameters,
    },
  }
}

function parseCliContributions(raw: unknown): ParseResult<CliContribution[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'contributes.cli 必须是数组' }
  }
  const cli: CliContribution[] = []
  for (const item of raw) {
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
      const parsed = parseCliCommand(cmd, cliId)
      if (!parsed.ok) return parsed
      commands.push(parsed.value)
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
  return { ok: true, value: cli }
}

function parseSecretRef(
  raw: unknown,
): ParseResult<AuthResourceContribution['secretRef']> {
  if (raw == null) return { ok: true, value: undefined }
  if (!isRecord(raw)) {
    return { ok: false, reason: 'auth.secretRef 必须是对象' }
  }
  const backend = asString(raw.backend)
  if (backend === 'env' && asString(raw.envName)) {
    return {
      ok: true,
      value: { backend: 'env', envName: raw.envName as string },
    }
  }
  if (backend === 'memory' && asString(raw.key)) {
    return { ok: true, value: { backend: 'memory', key: raw.key as string } }
  }
  if (backend === 'keychain' && asString(raw.account)) {
    // Local plugin.json must not declare Keychain accounts — those are
    // host-owned (`uilab:` / `oauth:`) and written only by operator auth.
    // Accepting arbitrary accounts enables cross-plugin credential theft.
    return {
      ok: false,
      reason:
        'auth.secretRef.backend=keychain 禁止出现在 plugin.json（Keychain 仅由 operator auth 写入）',
    }
  }
  return { ok: false, reason: 'auth.secretRef 格式无效' }
}

function parseAuthContributions(
  raw: unknown,
  pluginId: string,
): ParseResult<AuthResourceContribution[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'contributes.auth 必须是数组' }
  }
  const auth: AuthResourceContribution[] = []
  for (const item of raw) {
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
    const secretRef = parseSecretRef(item.secretRef)
    if (!secretRef.ok) return secretRef
    if (item.cliSession != null) {
      return {
        ok: false,
        reason: 'auth.cliSession 仅允许仓库内受信 builtin Provider 使用',
      }
    }
    let oauth: AuthResourceContribution['oauth']
    if (item.oauth != null) {
      if (!isRecord(item.oauth) || kind !== 'oauth2') {
        return {
          ok: false,
          reason: `auth.oauth 仅允许 kind=oauth2（插件 ${pluginId}）`,
        }
      }
      const strategy = asString(item.oauth.strategy)
      if (strategy === 'managed_broker') {
        return {
          ok: false,
          reason:
            'auth.oauth.strategy=managed_broker 仅允许平台受信 builtin 使用',
        }
      }
      if (strategy != null && strategy !== 'host_credentials') {
        return {
          ok: false,
          reason: `auth.oauth.strategy 无效：${strategy}`,
        }
      }
      const mcpServerId = asString(item.oauth.mcpServerId)
      const clientIdFromEnv = asStringArray(item.oauth.clientIdFromEnv)
      const clientSecretFromEnv = asStringArray(item.oauth.clientSecretFromEnv)
      if (
        !mcpServerId ||
        !clientIdFromEnv?.length ||
        !clientSecretFromEnv?.length
      ) {
        return {
          ok: false,
          reason:
            'auth.oauth 需要 mcpServerId / clientIdFromEnv / clientSecretFromEnv',
        }
      }
      for (const name of [...clientIdFromEnv, ...clientSecretFromEnv]) {
        if (!isAllowedAuthEnvName(name)) {
          return {
            ok: false,
            reason: `auth.oauth 禁止模型密钥环境变量：${name}`,
          }
        }
      }
      oauth = {
        strategy: 'host_credentials',
        mcpServerId,
        clientIdFromEnv,
        clientSecretFromEnv,
        redirectUriFromEnv: asStringArray(item.oauth.redirectUriFromEnv),
        scopes: asStringArray(item.oauth.scopes),
      }
    }
    auth.push({
      resourceId,
      kind: kind as AuthResourceContribution['kind'],
      envNames: asStringArray(item.envNames),
      secretRef: secretRef.value,
      loginHint: asString(item.loginHint),
      oauth,
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
  return { ok: true, value: auth }
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

  if (raw.connectors != null) {
    const connectors = parseConnectorContributions(raw.connectors)
    if (!connectors.ok) return connectors
    contributes.connectors = connectors.value
  }

  if (raw.mcp != null) {
    const mcp = parseMcpContributions(raw.mcp)
    if (!mcp.ok) return mcp
    contributes.mcp = mcp.value
  }

  if (raw.skills != null) {
    const skills = parseSkillsContribution(raw.skills)
    if (!skills.ok) return skills
    contributes.skills = skills.value
  }

  if (raw.cli != null) {
    const cli = parseCliContributions(raw.cli)
    if (!cli.ok) return cli
    contributes.cli = cli.value
  }

  if (raw.auth != null) {
    const auth = parseAuthContributions(raw.auth, pluginId)
    if (!auth.ok) return auth
    contributes.auth = auth.value
  }

  if (raw.queries != null) {
    const queries = parseQueryContributions(raw.queries)
    if (!queries.ok) return queries
    contributes.queries = queries.value
  }

  return { ok: true, contributes }
}

const QUERY_SCALAR_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'string_array',
])

function parseQueryContributions(raw: unknown): ParseResult<QueryContribution[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'contributes.queries 必须是数组' }
  }
  const queries: QueryContribution[] = []
  const names = new Set<string>()
  for (const item of raw) {
    if (!isRecord(item)) {
      return { ok: false, reason: 'query 项必须是对象' }
    }
    if (item.handler != null || item.module != null || item.execute != null) {
      return {
        ok: false,
        reason: '外部 plugin.json 禁止查询实现字段（handler/module/execute）',
      }
    }
    const name = asString(item.name)
    const title = asString(item.title)
    if (!name) return { ok: false, reason: 'query.name 必填' }
    if (!title) return { ok: false, reason: 'query.title 必填' }
    if (names.has(name)) {
      return { ok: false, reason: `query.name 重复：${name}` }
    }
    names.add(name)
    const parameters = parseQueryParameters(item.parameters)
    if (!parameters.ok) return parameters
    if (item.requiredPermissions != null && !Array.isArray(item.requiredPermissions)) {
      return { ok: false, reason: 'query.requiredPermissions 必须是字符串数组' }
    }
    const requiredPermissions = asStringArray(item.requiredPermissions) ?? []
    if (
      item.referencableByJob != null &&
      typeof item.referencableByJob !== 'boolean'
    ) {
      return { ok: false, reason: 'query.referencableByJob 必须是布尔' }
    }
    queries.push({
      name,
      title,
      parameters: parameters.value,
      requiredPermissions,
      referencableByJob: item.referencableByJob !== false,
    })
  }
  return { ok: true, value: queries }
}

function parseQueryParameters(
  raw: unknown,
): ParseResult<Record<string, QueryParameterDecl>> {
  if (raw == null) return { ok: true, value: {} }
  if (!isRecord(raw)) {
    return { ok: false, reason: 'query.parameters 必须是对象' }
  }
  const parameters: Record<string, QueryParameterDecl> = {}
  for (const [key, decl] of Object.entries(raw)) {
    if (!isRecord(decl)) {
      return { ok: false, reason: `query.parameters.${key} 必须是对象` }
    }
    const type = asString(decl.type)
    if (type === 'resource') {
      const resourceType = asString(decl.resourceType)
      if (!resourceType) {
        return { ok: false, reason: `query.parameters.${key}.resourceType 必填` }
      }
      if (
        decl.requiredPermissions != null &&
        !Array.isArray(decl.requiredPermissions)
      ) {
        return {
          ok: false,
          reason: `query.parameters.${key}.requiredPermissions 必须是字符串数组`,
        }
      }
      const extra = asStringArray(decl.requiredPermissions)
      parameters[key] = extra
        ? { type: 'resource', resourceType, requiredPermissions: extra }
        : { type: 'resource', resourceType }
      continue
    }
    if (type && QUERY_SCALAR_TYPES.has(type)) {
      parameters[key] = {
        type: type as 'string' | 'number' | 'boolean' | 'string_array',
        required: decl.required !== false,
      }
      continue
    }
    return {
      ok: false,
      reason: `不支持的 query 参数类型：${type ?? '(missing)'}`,
    }
  }
  return { ok: true, value: parameters }
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
