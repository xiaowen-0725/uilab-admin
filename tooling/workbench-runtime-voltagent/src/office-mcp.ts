/**
 * Office Profile O4 — optional MCP connectors (docs knowledge + calendar).
 *
 * - Env-configured only; no MCP SDK in the browser Renderer
 * - Missing config / connect failure → honest degrade (local FS still works)
 * - Side-effect tools get needsApproval for HITL
 *
 * Spec: docs/plans/voltagent-office-profile-spec.md (O4)
 */

import { MCPConfiguration, createTool, type Tool } from '@voltagent/core'
import type { ProfileEnv } from './profile.js'

export type McpConnectorId = 'docs' | 'calendar'

/**
 * Subset of VoltAgent MCP server config we support (type not re-exported from core).
 */
export type OfficeMcpServerConfig =
  | {
      type: 'http'
      url: string
      requestInit?: RequestInit
      timeout?: number
    }
  | {
      type: 'stdio'
      command: string
      args?: string[]
      cwd?: string
      env?: Record<string, string>
      timeout?: number
    }

export type McpConnectorStatus = {
  id: McpConnectorId
  /** disabled = no env; connected = tools loaded; failed = configured but error */
  status: 'disabled' | 'connected' | 'failed'
  reason?: string
  toolNames: string[]
  transport?: 'http' | 'stdio'
}

export type OfficeMcpLoadResult = {
  tools: Tool<any, any>[]
  toolNames: string[]
  statuses: McpConnectorStatus[]
  /** Call on process shutdown when stdio MCP was used. */
  disconnect: () => Promise<void>
}

export type ResolvedMcpServer = {
  id: McpConnectorId
  server: OfficeMcpServerConfig
  transport: 'http' | 'stdio'
}

type McpHost = {
  getTools: (
    servers: Record<string, OfficeMcpServerConfig>,
  ) => Promise<{ tools: Tool<any, any>[]; disconnect: () => Promise<void> }>
}

/**
 * Fail-closed MCP approval (adversarial P1).
 *
 * Default: **every** MCP tool needs HITL approval.
 * Free only via **exact** names in `MCP_READ_ONLY_TOOL_NAMES` (env).
 * Built-in free list is **empty** — no guessed pure-read names.
 */
export function normalizeMcpToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[-\s]+/g, '_')
}

/** Empty by default — operators opt in free tools explicitly. */
export const DEFAULT_MCP_READ_ONLY_ALLOWLIST: ReadonlySet<string> = new Set()

export function resolveMcpReadOnlyAllowlist(
  env: ProfileEnv = process.env,
): Set<string> {
  const set = new Set(DEFAULT_MCP_READ_ONLY_ALLOWLIST)
  for (const raw of parseArgs(env.MCP_READ_ONLY_TOOL_NAMES) ?? []) {
    const n = normalizeMcpToolName(raw)
    if (n) set.add(n)
  }
  return set
}

export function isReadOnlyMcpToolName(
  name: string,
  allowlist: ReadonlySet<string> = DEFAULT_MCP_READ_ONLY_ALLOWLIST,
): boolean {
  return allowlist.has(normalizeMcpToolName(name))
}

/** True when tool must request HITL (default yes). */
export function isSideEffectMcpToolName(
  name: string,
  allowlist: ReadonlySet<string> = DEFAULT_MCP_READ_ONLY_ALLOWLIST,
): boolean {
  return !isReadOnlyMcpToolName(name, allowlist)
}

/**
 * Ensure non-allowlisted tools require approval on **real** Tool instances.
 * Prefer in-place assign when writable; otherwise re-wrap with createTool.
 */
export function applyMcpNeedsApproval(
  tools: Tool<any, any>[],
  allowlist: ReadonlySet<string> = DEFAULT_MCP_READ_ONLY_ALLOWLIST,
): Tool<any, any>[] {
  return tools.map((tool) => {
    if (isReadOnlyMcpToolName(tool.name, allowlist)) return tool
    return forceToolNeedsApproval(tool)
  })
}

export function forceToolNeedsApproval(tool: Tool<any, any>): Tool<any, any> {
  const current = (tool as { needsApproval?: unknown }).needsApproval
  if (current === true) return tool

  // Fast path: mutable own property (VoltAgent createTool tools are writable).
  try {
    const desc = Object.getOwnPropertyDescriptor(tool, 'needsApproval')
    if (!desc || desc.writable) {
      ;(tool as { needsApproval?: boolean }).needsApproval = true
      if ((tool as { needsApproval?: unknown }).needsApproval === true) {
        return tool
      }
    }
  } catch {
    // fall through to wrap
  }

  // Slow path: re-wrap so HITL cannot be dropped if the original object is frozen
  // or needsApproval is a non-writable getter.
  const anyTool = tool as Tool<any, any> & {
    parameters?: unknown
    execute?: (...args: any[]) => any
    description?: string
  }
  if (typeof anyTool.execute !== 'function' || anyTool.parameters == null) {
    // Last resort: keep mutation attempt; better than silent free.
    try {
      ;(tool as { needsApproval?: boolean }).needsApproval = true
    } catch {
      // ignore
    }
    return tool
  }

  return createTool({
    name: tool.name,
    description: anyTool.description ?? tool.name,
    parameters: anyTool.parameters as any,
    needsApproval: true,
    execute: (...args: any[]) => anyTool.execute!(...args),
  }) as Tool<any, any>
}

function parseArgs(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined
  // Prefer JSON array; fall back to comma-separated.
  const t = raw.trim()
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as unknown
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed
      }
    } catch {
      // fall through
    }
  }
  return t.split(',').map((s) => s.trim()).filter(Boolean)
}

function bearerHeaders(env: ProfileEnv, prefix: string): RequestInit | undefined {
  const token =
    env[`${prefix}_BEARER_TOKEN`]?.trim() ||
    env[`${prefix}_TOKEN`]?.trim() ||
    env.MCP_BEARER_TOKEN?.trim()
  if (!token) return undefined
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
}

/**
 * Resolve a single connector from env.
 * URL → http transport; COMMAND → stdio. Empty → disabled.
 */
export function resolveMcpConnector(
  id: McpConnectorId,
  env: ProfileEnv = process.env,
): ResolvedMcpServer | null {
  const upper = id === 'docs' ? 'DOCS' : 'CALENDAR'
  const url =
    env[`MCP_${upper}_URL`]?.trim() ||
    env[`FEISHU_${upper}_MCP_URL`]?.trim() ||
    (id === 'docs'
      ? env.FEISHU_DOCS_MCP_URL?.trim()
      : env.FEISHU_CALENDAR_MCP_URL?.trim())

  if (url) {
    const requestInit = bearerHeaders(env, `MCP_${upper}`)
    return {
      id,
      transport: 'http',
      server: {
        type: 'http',
        url,
        ...(requestInit ? { requestInit } : {}),
        timeout: Number(env.MCP_TIMEOUT_MS ?? 20_000) || 20_000,
      },
    }
  }

  const command =
    env[`MCP_${upper}_COMMAND`]?.trim() ||
    env[`FEISHU_${upper}_MCP_COMMAND`]?.trim()
  if (command) {
    const args = parseArgs(env[`MCP_${upper}_ARGS`]) ?? []
    return {
      id,
      transport: 'stdio',
      server: {
        type: 'stdio',
        command,
        args,
        env: filterProcessEnvForChild(env, id),
        timeout: Number(env.MCP_TIMEOUT_MS ?? 20_000) || 20_000,
      },
    }
  }

  return null
}

/** Non-secret runtime essentials always allowed for stdio children. */
const MCP_CHILD_BASE_ENV_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
] as const

/**
 * Connector-scoped secret defaults (Codex P1: no cross-connector leak).
 * docs must not inherit calendar-only Google credentials and vice versa
 * unless the operator explicitly opts in via MCP_*_CHILD_ENV_KEYS.
 */
const MCP_CONNECTOR_DEFAULT_SECRET_KEYS: Record<McpConnectorId, readonly string[]> =
  {
    docs: [
      'FEISHU_APP_ID',
      'FEISHU_APP_SECRET',
      'LARK_APP_ID',
      'LARK_APP_SECRET',
      'FEISHU_DOCS_APP_ID',
      'FEISHU_DOCS_APP_SECRET',
    ],
    calendar: [
      'FEISHU_APP_ID',
      'FEISHU_APP_SECRET',
      'LARK_APP_ID',
      'LARK_APP_SECRET',
      'FEISHU_CALENDAR_APP_ID',
      'FEISHU_CALENDAR_APP_SECRET',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'GOOGLE_CALENDAR_ID',
    ],
  }

/**
 * True for LLM / model-provider secrets that must never reach stdio MCP children,
 * even when listed in MCP_*_CHILD_ENV_KEYS.
 */
export function isModelProviderSecretKey(key: string): boolean {
  const k = key.trim().toUpperCase()
  if (!k) return false
  // Connector app credentials (Feishu/Lark) are not LLM keys.
  if (/^(FEISHU|LARK)_/.test(k)) return false
  // Calendar path credential — connector-scoped, not an LLM API key string.
  if (k === 'GOOGLE_APPLICATION_CREDENTIALS' || k === 'GOOGLE_CALENDAR_ID') {
    return false
  }
  if (/_API_KEY$|_APIKEY$/.test(k)) return true
  if (
    /(OPENAI|ANTHROPIC|DEEPSEEK|GEMINI|GROQ|MISTRAL|COHERE|TOGETHER|FIREWORKS|XAI|VOLTAGENT|AZURE_OPENAI|GOOGLE_AI|VERTEX|CLAUDE)/.test(
      k,
    ) &&
    /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/.test(k)
  ) {
    return true
  }
  return false
}

/**
 * Build env for a stdio MCP child.
 * - Base: PATH/HOME/…
 * - Connector defaults (docs vs calendar secrets separated)
 * - Explicit: `MCP_DOCS_CHILD_ENV_KEYS` / `MCP_CALENDAR_CHILD_ENV_KEYS`
 * - Shared extras: `MCP_CHILD_ENV_KEYS`
 *
 * Model provider secrets are hard-denied even if explicitly listed.
 */
export function filterProcessEnvForChild(
  env: ProfileEnv,
  connectorId: McpConnectorId,
): Record<string, string> | undefined {
  const allow = new Set<string>([
    ...MCP_CHILD_BASE_ENV_KEYS,
    ...MCP_CONNECTOR_DEFAULT_SECRET_KEYS[connectorId],
  ])

  const upper = connectorId === 'docs' ? 'DOCS' : 'CALENDAR'
  for (const key of parseArgs(env[`MCP_${upper}_CHILD_ENV_KEYS`]) ?? []) {
    allow.add(key)
  }
  for (const key of parseArgs(env.MCP_CHILD_ENV_KEYS) ?? []) {
    allow.add(key)
  }

  const out: Record<string, string> = {}
  for (const key of allow) {
    if (isModelProviderSecretKey(key)) continue
    const v = env[key]
    if (typeof v === 'string' && v.length > 0) out[key] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function resolveAllMcpConnectors(
  env: ProfileEnv = process.env,
): ResolvedMcpServer[] {
  const out: ResolvedMcpServer[] = []
  for (const id of ['docs', 'calendar'] as const) {
    const resolved = resolveMcpConnector(id, env)
    if (resolved) out.push(resolved)
  }
  return out
}

async function defaultMcpHost(
  servers: Record<string, OfficeMcpServerConfig>,
): Promise<{ tools: Tool<any, any>[]; disconnect: () => Promise<void> }> {
  const mcp = new MCPConfiguration({
    // core types are wider; our subset is compatible at runtime
    servers: servers as any,
  })
  try {
    const tools = (await mcp.getTools()) as Tool<any, any>[]
    return {
      tools,
      disconnect: async () => {
        try {
          await mcp.disconnect()
        } catch {
          // best-effort
        }
      },
    }
  } catch (err) {
    try {
      await mcp.disconnect()
    } catch {
      // ignore
    }
    throw err
  }
}

/**
 * Load configured MCP tools. Never throws for missing config or connect failure.
 */
export async function loadOfficeMcpTools(
  env: ProfileEnv = process.env,
  options?: { host?: McpHost },
): Promise<OfficeMcpLoadResult> {
  const host = options?.host ?? { getTools: defaultMcpHost }
  const resolved = resolveAllMcpConnectors(env)
  const statuses: McpConnectorStatus[] = []
  const disconnectors: Array<() => Promise<void>> = []
  const allTools: Tool<any, any>[] = []
  const allNames: string[] = []

  for (const id of ['docs', 'calendar'] as const) {
    const conf = resolved.find((r) => r.id === id)
    if (!conf) {
      statuses.push({
        id,
        status: 'disabled',
        reason: '未配置 MCP_*_URL 或 MCP_*_COMMAND',
        toolNames: [],
      })
      continue
    }

    try {
      const { tools, disconnect } = await host.getTools({
        [id]: conf.server,
      })
      // Real SDK may return [] without throwing on soft failure — treat as failed.
      if (tools.length === 0) {
        try {
          await disconnect()
        } catch {
          // ignore
        }
        statuses.push({
          id,
          status: 'failed',
          reason: `MCP ${id} 已配置但未返回任何工具（连接可能失败或服务为空）`,
          toolNames: [],
          transport: conf.transport,
        })
        continue
      }
      const allowlist = resolveMcpReadOnlyAllowlist(env)
      const approved = applyMcpNeedsApproval(tools, allowlist)
      const names = approved.map((t) => t.name)
      allTools.push(...approved)
      allNames.push(...names)
      disconnectors.push(disconnect)
      statuses.push({
        id,
        status: 'connected',
        toolNames: names,
        transport: conf.transport,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? 'unknown error')
      statuses.push({
        id,
        status: 'failed',
        reason: `MCP ${id} 连接失败：${message}`,
        toolNames: [],
        transport: conf.transport,
      })
    }
  }

  return {
    tools: allTools,
    toolNames: allNames,
    statuses,
    disconnect: async () => {
      for (const d of disconnectors) {
        await d()
      }
    },
  }
}

/** Compact one-line status for sidecar logs. */
export function formatMcpStatusLine(statuses: McpConnectorStatus[]): string {
  return statuses
    .map((s) => {
      if (s.status === 'connected') {
        return `${s.id}=ok(${s.toolNames.length})`
      }
      if (s.status === 'failed') {
        return `${s.id}=fail`
      }
      return `${s.id}=off`
    })
    .join(',')
}
