/**
 * Domain CLI contribution loader (#21).
 * Fixed binary + allowlisted subcommands → VoltAgent tools via execFile.
 * Never builds a shell string; never invents tools for non-allowlisted names.
 */

import { access, constants } from 'node:fs/promises'
import { execFile as execFileCb } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { createTool, type Tool, type ToolExecuteOptions } from '@voltagent/core'
import { z } from 'zod'
import { gateConnectorToolInvoke } from '../capability/tool-gate.js'
import { readCapabilityTurnContext } from '../capability/turn-context.js'
import type {
  CliArgParam,
  CliCommandContribution,
  CliContribution,
} from './manifest.js'
import type { ConnectorDescriptor } from './connector-descriptor.js'
import { firstEnv } from './parse-util.js'
import {
  decideCliCommandNeedsApproval,
  filterChildEnv,
  isAllowedAuthEnvName,
  isModelProviderSecretKey,
  stripModelProviderSecrets,
} from './security-policy.js'
import type { CredentialMaterial, ProfileEnv } from './types.js'
import {
  createToolIdentityRegistry,
  type RegisteredToolIdentity,
} from './tool-identity.js'

const execFileAsync = promisify(execFileCb)

export type CliLoadStatus = {
  pluginId: string
  cliId: string
  status: 'ready' | 'missing' | 'failed' | 'disabled'
  reason?: string
  command?: string
  toolNames: string[]
}

export type CliRunner = (
  command: string,
  argv: string[],
  options: {
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
  },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>

export type CliLoadAggregate = {
  tools: Tool<any, any>[]
  toolNames: string[]
  toolIdentities: RegisteredToolIdentity[]
  statuses: CliLoadStatus[]
}

export type LoadCliOptions = {
  env?: ProfileEnv
  workspaceRoot?: string
  runner?: CliRunner
  /**
   * Plugin ids that may self-declare readOnly free tools (builtins).
   * Local PLUGIN_PATHS plugins always force needsApproval.
   */
  trustedPluginIds?: ReadonlySet<string>
  /** Provider-projected connectors used by the Task invoke gate. */
  connectorDescriptors?: readonly ConnectorDescriptor[]
}

/**
 * OpenAI/DeepSeek tool names must match `^[a-zA-Z0-9_-]+$` — no dots.
 * Format: `cli_<cliId>_<commandName>` (e.g. cli_acme_records_list).
 */
export function cliToolName(cliId: string, commandName: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `cli_${safe(cliId)}_${safe(commandName)}`
}

/**
 * Expand argv template with structured args only.
 * Supports full-segment `{{name}}` and in-string `{{name}}`.
 */
export function buildCliArgv(
  template: string[],
  args: Record<string, unknown>,
): string[] {
  return template.map((segment) => expandArgvSegment(segment, args))
}

/** Exact argv passthrough for a fixed, trusted Provider binary. Never a shell. */
export function buildCliPassthroughArgv(
  paramName: string,
  args: Record<string, unknown>,
): string[] {
  const value = args[paramName]
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`CLI passthrough 参数必须是非空字符串数组：${paramName}`)
  }
  if (value.length > 128) {
    throw new Error(`CLI passthrough 参数过多：${paramName}`)
  }
  let totalLength = 0
  const argv = value.map((item, index) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error(`CLI passthrough 参数无效：${paramName}[${index}]`)
    }
    if (item.includes('\0')) {
      throw new Error(`CLI passthrough 参数含 NUL：${paramName}[${index}]`)
    }
    if (item.length > 32_768) {
      throw new Error(`CLI passthrough 单参数过长：${paramName}[${index}]`)
    }
    assertNoCredentialBearingArg(item, paramName, index)
    totalLength += item.length
    return item
  })
  if (totalLength > 128 * 1024) {
    throw new Error(`CLI passthrough 参数总长度过大：${paramName}`)
  }
  return argv
}

const CREDENTIAL_FLAG_KEYS = new Set([
  'accesstoken',
  'appsecret',
  'authorization',
  'bearertoken',
  'clientsecret',
  'password',
  'refreshtoken',
  'tenantaccesstoken',
  'useraccesstoken',
])

const CREDENTIAL_ENV_ASSIGNMENT =
  /^[A-Z_][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|AUTHORIZATION|CREDENTIAL|API_KEY)[A-Z0-9_]*=/i

/** Credentials belong to the CLI session/closed child env, never model argv. */
function assertNoCredentialBearingArg(
  value: string,
  paramName: string,
  index: number,
): void {
  const flagKey = value.startsWith('-')
    ? value
        .split('=', 1)[0]!
        .replace(/^-+/, '')
        .replaceAll('-', '')
        .replaceAll('_', '')
        .toLowerCase()
    : ''
  if (
    CREDENTIAL_FLAG_KEYS.has(flagKey) ||
    CREDENTIAL_ENV_ASSIGNMENT.test(value)
  ) {
    throw new Error(
      `CLI passthrough 禁止敏感凭证参数：${paramName}[${index}]`,
    )
  }
}

function expandArgvSegment(
  segment: string,
  args: Record<string, unknown>,
): string {
  return segment.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in args) || args[key] === undefined || args[key] === null) {
      throw new Error(`缺少 CLI 参数：${key}`)
    }
    const val = String(args[key])
    if (val.includes('\0')) {
      throw new Error(`非法 CLI 参数值：${key}`)
    }
    return val
  })
}

const SHELL_BASENAMES = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'fish',
  'cmd.exe',
  'cmd',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
])

/** Reject free-form shell invocation patterns (defense in depth on static argv). */
export function assertSafeArgvTemplate(template: string[]): void {
  if (template.length === 0) {
    throw new Error('CLI argv 模板不能为空')
  }
  // First segment must be a fixed allowlisted subcommand — not a model-controlled slot
  if (/\{\{/.test(template[0]!)) {
    throw new Error(
      'CLI argv 首段禁止使用占位符（防止模型选择任意子命令）',
    )
  }
  for (const part of template) {
    if (/[|;&$`]/.test(part) && !/\{\{\w+\}\}/.test(part)) {
      if (!/^[\w./:@%=+-]+$/.test(part) && !part.includes('{{')) {
        throw new Error(`CLI argv 模板含非法片段：${part}`)
      }
    }
    const base = path.basename(part)
    if (
      part === '-c' ||
      SHELL_BASENAMES.has(part) ||
      SHELL_BASENAMES.has(base)
    ) {
      throw new Error(`禁止 shell 包装 argv：${part}`)
    }
  }
}

/** Reject shell interpreters as the domain CLI binary. */
export function assertSafeCliCommand(commandPath: string): void {
  const base = path.basename(commandPath).toLowerCase()
  if (SHELL_BASENAMES.has(base)) {
    throw new Error(`禁止将 shell 解释器注册为领域 CLI：${commandPath}`)
  }
}

export function parametersToZodSchema(
  parameters: CliArgParam[] | undefined,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const p of parameters ?? []) {
    let t: z.ZodTypeAny =
      p.type === 'number'
        ? z.number()
        : p.type === 'boolean'
          ? z.boolean()
          : p.type === 'string_array'
            ? z.array(z.string().min(1).max(32_768)).min(1).max(128)
          : z.string()
    if (p.description) t = t.describe(p.description)
    const required = p.required !== false
    shape[p.name] = required ? t : t.optional()
  }
  return z.object(shape)
}

/**
 * Resolve executable path: env override → absolute access → PATH lookup.
 */
export async function resolveCliExecutable(
  contrib: CliContribution,
  env: ProfileEnv,
): Promise<{ command: string; resolved: string } | null> {
  const raw =
    firstEnv(env, contrib.commandFromEnv) ?? contrib.command?.trim() ?? ''
  if (!raw) return null

  if (path.isAbsolute(raw)) {
    try {
      await access(raw, constants.X_OK)
      return { command: raw, resolved: raw }
    } catch {
      return null
    }
  }

  // Bare name: search PATH
  const pathEnv = env.PATH ?? process.env.PATH ?? ''
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, raw)
    try {
      await access(candidate, constants.X_OK)
      return { command: raw, resolved: candidate }
    } catch {
      // continue
    }
  }
  return null
}

export function resolveCliCwd(
  contrib: CliContribution,
  workspaceRoot: string | undefined,
): string | undefined {
  const d = contrib.defaultCwd ?? 'workspace'
  if (d === 'workspace' || d === 'plugin') return workspaceRoot
  // Absolute cwd only allowed when it stays under workspace root
  if (path.isAbsolute(d)) {
    if (!workspaceRoot) return undefined
    const root = path.resolve(workspaceRoot)
    const abs = path.resolve(d)
    const rel = path.relative(root, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined
    return abs
  }
  if (workspaceRoot) return path.resolve(workspaceRoot, d)
  return undefined
}

/**
 * Closed child environment only — never merges process.env.
 * Callers must pass filterChildEnv() output (or empty → base keys only).
 */
export function closedChildEnv(
  env: Record<string, string> | undefined,
): Record<string, string> {
  if (env && Object.keys(env).length > 0) return { ...env }
  // Minimal base runtime for PATH lookup without host secrets
  return filterChildEnv(process.env, [], { includeBaseKeys: true })
}

export async function defaultCliRunner(
  command: string,
  argv: string[],
  options: {
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const childEnv = closedChildEnv(options.env)
    const { stdout, stderr } = await execFileAsync(command, argv, {
      cwd: options.cwd,
      env: childEnv,
      timeout: options.timeoutMs ?? 60_000,
      maxBuffer: 4 * 1024 * 1024,
      // Never use shell
      shell: false,
      encoding: 'utf8',
    })
    return {
      stdout: String(stdout ?? ''),
      stderr: String(stderr ?? ''),
      exitCode: 0,
    }
  } catch (err: unknown) {
    const e = err as {
      code?: string | number
      stdout?: string
      stderr?: string
      message?: string
    }
    const exitCode =
      typeof e.code === 'number'
        ? e.code
        : e.code === 'ENOENT'
          ? 127
          : 1
    return {
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? e.message ?? 'CLI 执行失败'),
      exitCode,
    }
  }
}

function truncateOutput(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text
}

function createCliTool(input: {
  cliId: string
  publicName?: string
  commandPath: string
  cmd: CliCommandContribution
  cwd: string | undefined
  /** Static child env when auth is not live-resolved */
  childEnv: Record<string, string> | undefined
  runner: CliRunner
  /** Local/discovered plugins cannot self-certify free tools */
  forceApproval?: boolean
  /** Explicit trust grant for fixed-binary Provider argv passthrough. */
  allowPassthrough?: boolean
  /**
   * Live auth: re-resolve material each invoke. When status !== connected,
   * refuse to dispatch runner (cli_session may still hold domain credentials
   * via HOME — must not execute after revoke).
   */
  resolveAuthMaterial?: () => Promise<CredentialMaterial | undefined>
  contrib?: CliContribution
  env?: ProfileEnv
  authEnforced?: boolean
  connectorDescriptors?: readonly ConnectorDescriptor[]
}): Tool<any, any> {
  const toolName = input.publicName ?? cliToolName(input.cliId, input.cmd.name)
  const passthroughParam = input.cmd.passthroughArgvParam?.trim()
  if (passthroughParam) {
    if (!input.allowPassthrough) {
      throw new Error('CLI argv passthrough 仅允许受信 builtin Provider')
    }
    if (
      !input.cmd.parameters?.some(
        (param) =>
          param.name === passthroughParam && param.type === 'string_array',
      )
    ) {
      throw new Error(
        `CLI argv passthrough 缺少 string_array 参数：${passthroughParam}`,
      )
    }
  } else {
    assertSafeArgvTemplate(input.cmd.argv)
  }
  const schema = parametersToZodSchema(input.cmd.parameters)
  const needsApproval = passthroughParam
    ? true
    : input.forceApproval
    ? true
    : decideCliCommandNeedsApproval({
        needsApproval: input.cmd.needsApproval,
        readOnly: input.cmd.readOnly,
      })

  return createTool({
    name: toolName,
    description:
      input.cmd.description ??
      `Domain CLI ${input.cliId} · ${input.cmd.name}（allowlisted execFile）`,
    parameters: schema,
    needsApproval,
    execute: async (
      rawArgs: Record<string, unknown>,
      executeOptions?: ToolExecuteOptions,
    ) => {
      const argv = passthroughParam
        ? buildCliPassthroughArgv(passthroughParam, rawArgs ?? {})
        : buildCliArgv(input.cmd.argv, rawArgs ?? {})
      const argvMetadata = passthroughParam
        ? { argvCount: argv.length }
        : { argv }

      // Capability Surface effective gate (taskSelected ∧ connected ∧ enabled).
      // Packaging may load tools; invoke still requires Task 选用 for connector tools.
      const turnContext = readCapabilityTurnContext(executeOptions)
      const gate = gateConnectorToolInvoke(toolName, {
        taskId: turnContext.taskId,
        selectedConnectorIds: turnContext.selectedConnectorIds,
        descriptors: input.connectorDescriptors ?? [],
        authLookup: () => ({
          // If tool is mounted, packaging enabled the plugin for this process.
          pluginGloballyEnabled: true,
          authStatus: 'connected',
        }),
      })
      if (!gate.allowed) {
        return {
          ok: false,
          error: gate.reason,
          cliId: input.cliId,
          command: input.cmd.name,
          ...argvMetadata,
          exitCode: 1,
          stdout: '',
          stderr: truncateOutput(gate.hint, 20_000),
        }
      }

      let env = input.childEnv
      if (input.resolveAuthMaterial && input.contrib) {
        const material = await input.resolveAuthMaterial()
        if (!material || material.status !== 'connected') {
          return {
            ok: false,
            error: 'auth_revoked',
            cliId: input.cliId,
            command: input.cmd.name,
            ...argvMetadata,
            exitCode: 1,
            stdout: '',
            stderr: truncateOutput(
              material?.hint ??
                '授权已撤销或未连接；拒绝执行领域 CLI（请 auth login）',
              20_000,
            ),
          }
        }
        env = buildCliChildEnv(input.contrib, input.env ?? {}, {
          authEnforced: true,
          authMaterial: material,
        })
      }
      const result = await input.runner(input.commandPath, argv, {
        cwd: input.cwd,
        env,
        timeoutMs: input.cmd.timeoutMs,
      })
      return {
        cliId: input.cliId,
        command: input.cmd.name,
        ...argvMetadata,
        exitCode: result.exitCode,
        stdout: truncateOutput(result.stdout, 50_000),
        stderr: truncateOutput(result.stderr, 20_000),
      }
    },
  }) as Tool<any, any>
}

/**
 * Build closed CLI child env; when authEnforced, controlled secrets follow material (#28).
 */
export function buildCliChildEnv(
  contrib: CliContribution,
  env: ProfileEnv,
  auth?: { authEnforced?: boolean; authMaterial?: CredentialMaterial },
): Record<string, string> {
  const keys = contrib.childEnvKeys ?? []
  const filtered = filterChildEnv(env, keys, { includeBaseKeys: true })
  if (!auth?.authEnforced) return filtered

  const material = auth.authMaterial
  const controlled = new Set(material?.controlledEnvNames ?? [])
  for (const name of controlled) {
    delete filtered[name]
  }
  if (material?.status === 'connected') {
    for (const [k, v] of Object.entries(material.envValues)) {
      // Never re-inject model provider secrets after filterChildEnv (P0)
      if (isModelProviderSecretKey(k) || !isAllowedAuthEnvName(k)) continue
      if (keys.includes(k) || controlled.has(k)) filtered[k] = v
    }
  }
  return stripModelProviderSecrets(filtered)
}

/**
 * Load CLI contributions for enabled plugins. Isolates per-cli failures.
 */
export async function loadCliContributions(
  items: Array<{
    pluginId: string
    contrib: CliContribution
    authEnforced?: boolean
    authMaterial?: CredentialMaterial
    /**
     * Live re-resolve material at tool invoke (preferred when authEnforced).
     * When provided, static authMaterial is only used for load-time diagnostics.
     */
    resolveAuthMaterial?: () => Promise<CredentialMaterial | undefined>
  }>,
  options: LoadCliOptions = {},
): Promise<CliLoadAggregate> {
  const env = options.env ?? process.env
  const runner = options.runner ?? defaultCliRunner
  const trusted = options.trustedPluginIds
  const tools: Tool<any, any>[] = []
  const toolNames: string[] = []
  const identityRegistry = createToolIdentityRegistry()
  const statuses: CliLoadStatus[] = []

  for (const {
    pluginId,
    contrib,
    authEnforced,
    authMaterial,
    resolveAuthMaterial,
  } of items) {
    const forceApproval = trusted ? !trusted.has(pluginId) : false
    const allowPassthrough = trusted?.has(pluginId) === true
    if (!contrib.cliId?.trim()) {
      statuses.push({
        pluginId,
        cliId: contrib.cliId || '?',
        status: 'failed',
        reason: 'cliId 为空',
        toolNames: [],
      })
      continue
    }

    if (!contrib.commands?.length) {
      statuses.push({
        pluginId,
        cliId: contrib.cliId,
        status: 'failed',
        reason: '未声明 allowlist commands',
        toolNames: [],
      })
      continue
    }

    const resolved = await resolveCliExecutable(contrib, env)
    if (!resolved) {
      statuses.push({
        pluginId,
        cliId: contrib.cliId,
        status: 'missing',
        reason: `领域 CLI 可执行文件未找到（${contrib.commandFromEnv?.join('|') ?? contrib.command ?? '未配置'}）${contrib.packageHint ? ` · 可安装 ${contrib.packageHint}` : ''}`,
        command: contrib.command,
        toolNames: [],
      })
      continue
    }

    try {
      assertSafeCliCommand(resolved.resolved)
    } catch (err) {
      statuses.push({
        pluginId,
        cliId: contrib.cliId,
        status: 'failed',
        reason: err instanceof Error ? err.message : String(err),
        command: resolved.resolved,
        toolNames: [],
      })
      continue
    }

    // authEnforced tools must always have a live resolver (fail-closed)
    const liveResolve =
      authEnforced
        ? resolveAuthMaterial ??
          (async () => ({
            status: 'missing' as const,
            envValues: {} as Record<string, string>,
            controlledEnvNames: [] as string[],
            hint: 'auth-enforced CLI 缺少 resolveAuthMaterial',
          }))
        : undefined

    const childEnv = buildCliChildEnv(contrib, env, {
      authEnforced,
      authMaterial,
    })
    const cwd = resolveCliCwd(contrib, options.workspaceRoot)
    // Only commit tools after all commands validate (no partial mount on failure)
    const pendingTools: Tool<any, any>[] = []
    const names: string[] = []

    try {
      const seen = new Set<string>()
      for (const cmd of contrib.commands) {
        if (
          !cmd.name?.trim() ||
          (!cmd.passthroughArgvParam?.trim() && !cmd.argv?.length)
        ) {
          throw new Error(`无效 CLI 命令声明：${cmd.name}`)
        }
        if (seen.has(cmd.name)) continue
        seen.add(cmd.name)
        const identity = identityRegistry.register(
          {
            pluginId,
            channel: 'domain_cli',
            channelId: contrib.cliId,
            originalName: cmd.name,
          },
          { preferredPublicName: cliToolName(contrib.cliId, cmd.name) },
        )
        const tool = createCliTool({
          cliId: contrib.cliId,
          publicName: identity.publicName,
          commandPath: resolved.resolved,
          cmd,
          cwd,
          childEnv,
          runner,
          forceApproval,
          allowPassthrough,
          resolveAuthMaterial: liveResolve,
          contrib,
          env,
          authEnforced,
          connectorDescriptors: options.connectorDescriptors,
        })
        pendingTools.push(tool)
        names.push(tool.name)
      }
      tools.push(...pendingTools)
      toolNames.push(...names)
      statuses.push({
        pluginId,
        cliId: contrib.cliId,
        status: 'ready',
        command: resolved.resolved,
        toolNames: names,
      })
    } catch (err) {
      statuses.push({
        pluginId,
        cliId: contrib.cliId,
        status: 'failed',
        reason: err instanceof Error ? err.message : String(err),
        command: resolved.resolved,
        toolNames: [],
      })
    }
  }

  return {
    tools,
    toolNames,
    toolIdentities: identityRegistry.list(),
    statuses,
  }
}

/** Compact log line: acme=ready(2),gh=missing */
export function formatRegistryCliStatusLine(statuses: CliLoadStatus[]): string {
  if (statuses.length === 0) return 'cli=none'
  return statuses
    .map((s) => {
      if (s.status === 'ready') return `${s.cliId}=ready(${s.toolNames.length})`
      if (s.status === 'missing') return `${s.cliId}=missing`
      if (s.status === 'failed') return `${s.cliId}=fail`
      return `${s.cliId}=off`
    })
    .join(',')
}
