/**
 * Generic MCP contribution resolver + loader (ticket #19).
 * No hard-coded docs/calendar IDs — callers pass resolved servers from manifests.
 */

import { MCPConfiguration, createTool, type Tool } from '@voltagent/core'
import { decideToolNeedsApproval, filterChildEnv } from './security-policy.js'
import type { McpContribution, McpServerConfigShape } from './manifest.js'
import { firstEnv, parseEnvStringList } from './parse-util.js'
import type { ProfileEnv } from './types.js'
import { normalizeToolName } from './security-policy.js'

export type { McpServerConfigShape } from './manifest.js'

export type ResolvedMcpServer = {
  serverId: string
  pluginId: string
  transport: 'http' | 'stdio'
  server: McpServerConfigShape
  readOnlyToolNames: string[]
}

export type McpServerLoadStatus = {
  pluginId: string
  serverId: string
  status: 'disabled' | 'connected' | 'failed'
  reason?: string
  toolNames: string[]
  transport?: 'http' | 'stdio'
}

export type McpHost = {
  getTools: (
    servers: Record<string, McpServerConfigShape>,
  ) => Promise<{ tools: Tool<any, any>[]; disconnect: () => Promise<void> }>
}

export type McpLoadAggregate = {
  tools: Tool<any, any>[]
  toolNames: string[]
  statuses: McpServerLoadStatus[]
  disconnect: () => Promise<void>
}

/**
 * Child env allowlist for a contribution: manifest keys +
 * MCP_<SERVER>_CHILD_ENV_KEYS + MCP_CHILD_ENV_KEYS.
 */
export function resolveMcpChildEnvKeys(
  contrib: McpContribution,
  env: ProfileEnv,
): string[] {
  const serverUpper = contrib.serverId.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return [
    ...(contrib.childEnvKeys ?? []),
    ...(parseEnvStringList(env[`MCP_${serverUpper}_CHILD_ENV_KEYS`]) ?? []),
    ...(parseEnvStringList(env.MCP_CHILD_ENV_KEYS) ?? []),
  ]
}

/** Build connector-scoped child env (model secrets hard-denied). */
export function buildMcpChildEnv(
  contrib: McpContribution,
  env: ProfileEnv,
): Record<string, string> {
  return filterChildEnv(env, resolveMcpChildEnvKeys(contrib, env), {
    includeBaseKeys: true,
  })
}

export function resolveMcpContribution(
  pluginId: string,
  contrib: McpContribution,
  env: ProfileEnv,
): ResolvedMcpServer | null {
  const timeout =
    contrib.timeoutMs ??
    (Number(env.MCP_TIMEOUT_MS ?? 20_000) || 20_000)

  const url = firstEnv(env, contrib.urlFromEnv)
  if (url) {
    const token = firstEnv(env, contrib.bearerTokenFromEnv)
    const requestInit = token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined
    return {
      pluginId,
      serverId: contrib.serverId,
      transport: 'http',
      readOnlyToolNames: contrib.readOnlyToolNames ?? [],
      server: {
        type: 'http',
        url,
        ...(requestInit ? { requestInit } : {}),
        timeout,
      },
    }
  }

  const command = firstEnv(env, contrib.commandFromEnv)
  if (command) {
    const argsKey = contrib.argsFromEnv?.[0]
    const args = argsKey ? parseEnvStringList(env[argsKey]) ?? [] : []
    const childEnv = buildMcpChildEnv(contrib, env)
    return {
      pluginId,
      serverId: contrib.serverId,
      transport: 'stdio',
      readOnlyToolNames: contrib.readOnlyToolNames ?? [],
      server: {
        type: 'stdio',
        command,
        args,
        env: Object.keys(childEnv).length > 0 ? childEnv : undefined,
        timeout,
      },
    }
  }

  return null
}

export function forceToolNeedsApproval(tool: Tool<any, any>): Tool<any, any> {
  const current = (tool as { needsApproval?: unknown }).needsApproval
  if (current === true) return tool
  try {
    const desc = Object.getOwnPropertyDescriptor(tool, 'needsApproval')
    if (!desc || desc.writable) {
      ;(tool as { needsApproval?: boolean }).needsApproval = true
      if ((tool as { needsApproval?: unknown }).needsApproval === true) {
        return tool
      }
    }
  } catch {
    // wrap
  }
  const anyTool = tool as Tool<any, any> & {
    parameters?: unknown
    execute?: (...args: any[]) => any
    description?: string
  }
  if (typeof anyTool.execute !== 'function' || anyTool.parameters == null) {
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

export function applyMcpNeedsApproval(
  tools: Tool<any, any>[],
  readOnlyAllowlist: ReadonlySet<string>,
): Tool<any, any>[] {
  return tools.map((tool) => {
    const free = !decideToolNeedsApproval({
      toolName: tool.name,
      readOnlyAllowlist,
    })
    if (free) return tool
    return forceToolNeedsApproval(tool)
  })
}

export function mergeReadOnlyAllowlist(
  env: ProfileEnv,
  pluginNames: string[],
): Set<string> {
  const set = new Set<string>()
  for (const n of pluginNames) set.add(normalizeToolName(n))
  for (const raw of parseEnvStringList(env.MCP_READ_ONLY_TOOL_NAMES) ?? []) {
    set.add(normalizeToolName(raw))
  }
  return set
}

export async function defaultMcpHost(
  servers: Record<string, McpServerConfigShape>,
): Promise<{ tools: Tool<any, any>[]; disconnect: () => Promise<void> }> {
  const mcp = new MCPConfiguration({
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
 * Load a list of resolved MCP servers. Isolation per serverId.
 * Never throws for connect failures.
 */
export async function loadResolvedMcpServers(
  resolved: ResolvedMcpServer[],
  options?: {
    env?: ProfileEnv
    host?: McpHost
    /** All contributions for disabled reporting (optional) */
    expected?: Array<{ pluginId: string; serverId: string }>
  },
): Promise<McpLoadAggregate> {
  const host = options?.host ?? { getTools: defaultMcpHost }
  const env = options?.env ?? process.env
  const disconnectors: Array<() => Promise<void>> = []
  const allTools: Tool<any, any>[] = []
  const allNames: string[] = []
  const statuses: McpServerLoadStatus[] = []

  const resolvedIds = new Set(resolved.map((r) => `${r.pluginId}::${r.serverId}`))

  // Default 20s hard deadline so a hung MCP cannot block calendar/skills/CLI forever
  const hostTimeoutMs = Number(env.MCP_TIMEOUT_MS ?? 20_000) || 20_000

  for (const conf of resolved) {
    const allow = mergeReadOnlyAllowlist(env, conf.readOnlyToolNames)
    const confTimeout =
      typeof conf.server.timeout === 'number' && conf.server.timeout > 0
        ? conf.server.timeout
        : hostTimeoutMs
    try {
      const { tools, disconnect } = await Promise.race([
        host.getTools({ [conf.serverId]: conf.server }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `MCP ${conf.serverId} 连接超时（${confTimeout}ms）`,
              ),
            )
          }, confTimeout)
        }),
      ])
      if (tools.length === 0) {
        try {
          await disconnect()
        } catch {
          // ignore
        }
        statuses.push({
          pluginId: conf.pluginId,
          serverId: conf.serverId,
          status: 'failed',
          reason: `MCP ${conf.serverId} 已配置但未返回任何工具（连接可能失败或服务为空）`,
          toolNames: [],
          transport: conf.transport,
        })
        continue
      }
      const approved = applyMcpNeedsApproval(tools, allow)
      const names = approved.map((t) => t.name)
      allTools.push(...approved)
      allNames.push(...names)
      disconnectors.push(disconnect)
      statuses.push({
        pluginId: conf.pluginId,
        serverId: conf.serverId,
        status: 'connected',
        toolNames: names,
        transport: conf.transport,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? 'unknown error')
      // Never embed raw secrets from transport errors into status
      const safe = message
        .replace(
          /\b(ghp_[A-Za-z0-9]+|sk-[A-Za-z0-9._-]+|Bearer\s+\S+)/gi,
          '***',
        )
        .replace(/\btoken\s*=\s*\S+/gi, 'token=***')
      statuses.push({
        pluginId: conf.pluginId,
        serverId: conf.serverId,
        status: 'failed',
        reason: `MCP ${conf.serverId} 连接失败：${safe}`,
        toolNames: [],
        transport: conf.transport,
      })
    }
  }

  // Report disabled for expected servers not resolved
  for (const exp of options?.expected ?? []) {
    const key = `${exp.pluginId}::${exp.serverId}`
    if (resolvedIds.has(key)) continue
    if (statuses.some((s) => s.pluginId === exp.pluginId && s.serverId === exp.serverId)) {
      continue
    }
    statuses.push({
      pluginId: exp.pluginId,
      serverId: exp.serverId,
      status: 'disabled',
      reason: '未配置 MCP URL 或 COMMAND',
      toolNames: [],
    })
  }

  return {
    tools: allTools,
    toolNames: allNames,
    statuses,
    disconnect: async () => {
      for (const d of disconnectors) await d()
    },
  }
}
