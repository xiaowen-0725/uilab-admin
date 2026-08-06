/**
 * Domain CLI contribution loader (#21).
 * Fixed binary + allowlisted subcommands → VoltAgent tools via execFile.
 * Never builds a shell string; never invents tools for non-allowlisted names.
 */

import { access, constants } from 'node:fs/promises'
import { execFile as execFileCb } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { createTool, type Tool } from '@voltagent/core'
import { z } from 'zod'
import type {
  CliArgParam,
  CliCommandContribution,
  CliContribution,
} from './manifest.js'
import { firstEnv } from './parse-util.js'
import {
  decideCliCommandNeedsApproval,
  filterChildEnv,
} from './security-policy.js'
import type { ProfileEnv } from './types.js'

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
}

export function cliToolName(cliId: string, commandName: string): string {
  return `cli.${cliId}.${commandName}`
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
  commandPath: string
  cmd: CliCommandContribution
  cwd: string | undefined
  childEnv: Record<string, string> | undefined
  runner: CliRunner
  /** Local/discovered plugins cannot self-certify free tools */
  forceApproval?: boolean
}): Tool<any, any> {
  const toolName = cliToolName(input.cliId, input.cmd.name)
  assertSafeArgvTemplate(input.cmd.argv)
  const schema = parametersToZodSchema(input.cmd.parameters)
  const needsApproval = input.forceApproval
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
    execute: async (rawArgs: Record<string, unknown>) => {
      const argv = buildCliArgv(input.cmd.argv, rawArgs ?? {})
      const result = await input.runner(input.commandPath, argv, {
        cwd: input.cwd,
        env: input.childEnv,
        timeoutMs: input.cmd.timeoutMs,
      })
      return {
        cliId: input.cliId,
        command: input.cmd.name,
        argv,
        exitCode: result.exitCode,
        stdout: truncateOutput(result.stdout, 50_000),
        stderr: truncateOutput(result.stderr, 20_000),
      }
    },
  }) as Tool<any, any>
}

/**
 * Load CLI contributions for enabled plugins. Isolates per-cli failures.
 */
export async function loadCliContributions(
  items: Array<{ pluginId: string; contrib: CliContribution }>,
  options: LoadCliOptions = {},
): Promise<CliLoadAggregate> {
  const env = options.env ?? process.env
  const runner = options.runner ?? defaultCliRunner
  const trusted = options.trustedPluginIds
  const tools: Tool<any, any>[] = []
  const toolNames: string[] = []
  const statuses: CliLoadStatus[] = []

  for (const { pluginId, contrib } of items) {
    const forceApproval = trusted ? !trusted.has(pluginId) : false
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

    const childEnv = filterChildEnv(env, contrib.childEnvKeys ?? [], {
      includeBaseKeys: true,
    })
    const cwd = resolveCliCwd(contrib, options.workspaceRoot)
    // Only commit tools after all commands validate (no partial mount on failure)
    const pendingTools: Tool<any, any>[] = []
    const names: string[] = []

    try {
      const seen = new Set<string>()
      for (const cmd of contrib.commands) {
        if (!cmd.name?.trim() || !cmd.argv?.length) {
          throw new Error(`无效 CLI 命令声明：${cmd.name}`)
        }
        if (seen.has(cmd.name)) continue
        seen.add(cmd.name)
        const tool = createCliTool({
          cliId: contrib.cliId,
          commandPath: resolved.resolved,
          cmd,
          cwd,
          childEnv,
          runner,
          forceApproval,
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

  return { tools, toolNames, statuses }
}

/** Compact log line: feishu=ready(2),gh=missing */
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
