/**
 * Office Profile O4 — optional MCP connectors (docs knowledge + calendar).
 *
 * - Env-configured only; no MCP SDK in the browser Renderer
 * - Missing config / connect failure → honest degrade (local FS still works)
 * - Side-effect tools get needsApproval for HITL
 *
 * Spec: docs/plans/voltagent-office-profile-spec.md (O4)
 */

import { MCPConfiguration, type Tool } from '@voltagent/core'
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
 * Fail-closed side-effect policy for MCP tools (O4 / Codex P0).
 *
 * Only **explicit read-only** name patterns run without approval.
 * Everything else (write/create/publish/add/upsert/unknown) needs HITL.
 */
export function isReadOnlyMcpToolName(name: string): boolean {
  const n = name.toLowerCase()
  // Compound mutators that embed a read token (get_or_create, list_and_delete, …)
  if (
    /(create|write|update|delete|remove|edit|patch|append|publish|upsert|insert|schedule|send|post|put|modify|cancel)/.test(
      n,
    )
  ) {
    return false
  }
  return /(^|[_-])(read|list|get|search|query|fetch|find|show|lookup|describe|stat|count)([_-]|$)/.test(
    n,
  )
}

/** @deprecated use !isReadOnlyMcpToolName — kept for call sites / tests */
export function isSideEffectMcpToolName(name: string): boolean {
  return !isReadOnlyMcpToolName(name)
}

/** Attach needsApproval to every non-read-only MCP tool (mutates tool objects). */
export function applyMcpNeedsApproval(
  tools: Tool<any, any>[],
): Tool<any, any>[] {
  for (const tool of tools) {
    if (!isReadOnlyMcpToolName(tool.name)) {
      // VoltAgent Tool exposes needsApproval on the instance.
      ;(tool as { needsApproval?: boolean }).needsApproval = true
    }
  }
  return tools
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
 * Build env for a stdio MCP child.
 * - Base: PATH/HOME/…
 * - Connector defaults (docs vs calendar secrets separated)
 * - Explicit: `MCP_DOCS_CHILD_ENV_KEYS` / `MCP_CALENDAR_CHILD_ENV_KEYS`
 * - Shared non-secret extras only: `MCP_CHILD_ENV_KEYS` (never model API keys by default)
 *
 * Never auto-forwards DEEPSEEK_API_KEY / OPENAI_API_KEY.
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
  // Shared extras — operator-controlled; still never force API keys.
  for (const key of parseArgs(env.MCP_CHILD_ENV_KEYS) ?? []) {
    allow.add(key)
  }

  // Hard deny model provider secrets even if listed by mistake.
  const deny = new Set([
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'VOLTAGENT_API_KEY',
    'ANTHROPIC_API_KEY',
  ])

  const out: Record<string, string> = {}
  for (const key of allow) {
    if (deny.has(key)) continue
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
      const approved = applyMcpNeedsApproval(tools)
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
