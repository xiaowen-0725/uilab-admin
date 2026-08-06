/**
 * Office MCP compatibility façade (legacy imports).
 * Implementation lives in plugin/ Registry + builtins (ticket #19).
 */

import type { Tool } from '@voltagent/core'
import { BUILTIN_PLUGINS } from './plugin/builtins.js'
import {
  applyMcpNeedsApproval as applyMcpNeedsApprovalCore,
  buildMcpChildEnv,
  forceToolNeedsApproval,
  mergeReadOnlyAllowlist,
  resolveMcpContribution,
  type McpHost,
  type McpServerConfigShape,
} from './plugin/mcp-loader.js'
import {
  createPluginRegistry,
  formatRegistryMcpStatusLine,
} from './plugin/registry.js'
import { decideToolNeedsApproval } from './plugin/security-policy.js'
import { normalizeToolName } from './plugin/security-policy.js'
import type { ProfileEnv } from './profile.js'

export { isModelProviderSecretKey } from './plugin/security-policy.js'
export { forceToolNeedsApproval }

/** @deprecated use serverId strings from plugins; kept for tests */
export type McpConnectorId = 'docs' | 'calendar'

export type OfficeMcpServerConfig = McpServerConfigShape

export type McpConnectorStatus = {
  id: string
  status: 'disabled' | 'connected' | 'failed'
  reason?: string
  toolNames: string[]
  transport?: 'http' | 'stdio'
}

export type OfficeMcpLoadResult = {
  tools: Tool<any, any>[]
  toolNames: string[]
  statuses: McpConnectorStatus[]
  disconnect: () => Promise<void>
}

export type ResolvedMcpServer = {
  id: string
  server: OfficeMcpServerConfig
  transport: 'http' | 'stdio'
}

export type { McpHost }

export function normalizeMcpToolName(name: string): string {
  return normalizeToolName(name)
}

export const DEFAULT_MCP_READ_ONLY_ALLOWLIST: ReadonlySet<string> = new Set()

export function resolveMcpReadOnlyAllowlist(
  env: ProfileEnv = process.env,
): Set<string> {
  return mergeReadOnlyAllowlist(env, [])
}

export function isReadOnlyMcpToolName(
  name: string,
  allowlist: ReadonlySet<string> = DEFAULT_MCP_READ_ONLY_ALLOWLIST,
): boolean {
  return !decideToolNeedsApproval({
    toolName: name,
    readOnlyAllowlist: allowlist,
  })
}

export function isSideEffectMcpToolName(
  name: string,
  allowlist: ReadonlySet<string> = DEFAULT_MCP_READ_ONLY_ALLOWLIST,
): boolean {
  return decideToolNeedsApproval({
    toolName: name,
    readOnlyAllowlist: allowlist,
  })
}

export function applyMcpNeedsApproval(
  tools: Tool<any, any>[],
  allowlist: ReadonlySet<string> = DEFAULT_MCP_READ_ONLY_ALLOWLIST,
): Tool<any, any>[] {
  return applyMcpNeedsApprovalCore(tools, allowlist)
}

/**
 * Resolve a single connector from env via builtin plugin manifests.
 */
export function resolveMcpConnector(
  id: McpConnectorId,
  env: ProfileEnv = process.env,
): ResolvedMcpServer | null {
  const plugin = BUILTIN_PLUGINS.find((p) =>
    p.contributes?.mcp?.some((m) => m.serverId === id),
  )
  const contrib = plugin?.contributes?.mcp?.find((m) => m.serverId === id)
  if (!plugin || !contrib) return null
  const resolved = resolveMcpContribution(plugin.id, contrib, env)
  if (!resolved) return null
  return {
    id: resolved.serverId,
    transport: resolved.transport,
    server: resolved.server,
  }
}

/**
 * Connector-scoped child env from builtin manifest + MCP_*_CHILD_ENV_KEYS.
 * Works without URL/COMMAND (for unit tests and pre-connect inspection).
 * @deprecated prefer buildMcpChildEnv via plugin contribution
 */
export function filterProcessEnvForChild(
  env: ProfileEnv,
  connectorId: McpConnectorId,
): Record<string, string> | undefined {
  const plugin = BUILTIN_PLUGINS.find((p) =>
    p.contributes?.mcp?.some((m) => m.serverId === connectorId),
  )
  const contrib = plugin?.contributes?.mcp?.find((m) => m.serverId === connectorId)
  if (!contrib) return undefined
  return buildMcpChildEnv(contrib, env)
}

export function resolveAllMcpConnectors(
  env: ProfileEnv = process.env,
): ResolvedMcpServer[] {
  const out: ResolvedMcpServer[] = []
  for (const id of ['docs', 'calendar'] as const) {
    const r = resolveMcpConnector(id, env)
    if (r) out.push(r)
  }
  return out
}

/**
 * Load office MCP tools via PluginRegistry (builtins).
 */
export async function loadOfficeMcpTools(
  env: ProfileEnv = process.env,
  options?: { host?: McpHost },
): Promise<OfficeMcpLoadResult> {
  const registry = createPluginRegistry({
    env,
    builtins: BUILTIN_PLUGINS,
    host: options?.host,
  })
  const result = await registry.load()
  const statuses: McpConnectorStatus[] = result.mcpStatuses.map((s) => ({
    id: s.serverId,
    status: s.status,
    reason: s.reason,
    toolNames: s.toolNames,
    transport: s.transport,
  }))
  // Ensure docs/calendar appear even if somehow missing from expected
  for (const id of ['docs', 'calendar'] as const) {
    if (!statuses.some((s) => s.id === id)) {
      statuses.push({
        id,
        status: 'disabled',
        reason: '未配置 MCP_*_URL 或 MCP_*_COMMAND',
        toolNames: [],
      })
    }
  }
  return {
    tools: result.tools,
    toolNames: result.toolNames,
    statuses,
    disconnect: result.disconnect,
  }
}

export function formatMcpStatusLine(statuses: McpConnectorStatus[]): string {
  return formatRegistryMcpStatusLine(
    statuses.map((s) => ({
      pluginId: s.id,
      serverId: s.id,
      status: s.status,
      reason: s.reason,
      toolNames: s.toolNames,
      transport: s.transport,
    })),
  )
}
