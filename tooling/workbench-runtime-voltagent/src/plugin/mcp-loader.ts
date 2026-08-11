/**
 * Generic MCP contribution resolver + loader (ticket #19).
 * No hard-coded docs/calendar IDs — callers pass resolved servers from manifests.
 */

import {
  MCPConfiguration,
  createTool,
  type Tool,
  type ToolExecuteOptions,
} from '@voltagent/core'
import { gateConnectorToolInvoke } from '../capability/tool-gate.js'
import { readCapabilityTurnContext } from '../capability/turn-context.js'
import type { ConnectorDescriptor } from './connector-descriptor.js'
import {
  decideToolNeedsApproval,
  filterChildEnv,
  isAllowedAuthEnvName,
  isModelProviderSecretKey,
  stripModelProviderSecrets,
} from './security-policy.js'
import type { McpContribution, McpServerConfigShape } from './manifest.js'
import { firstEnv, parseEnvStringList } from './parse-util.js'
import type { CredentialMaterial, ProfileEnv } from './types.js'
import { normalizeToolName } from './security-policy.js'
import {
  createToolIdentityRegistry,
  type RegisteredToolIdentity,
} from './tool-identity.js'

/** Options for MCP resolve/inject path (#28). */
export type McpResolveAuthOptions = {
  /**
   * When true, bearer + controlled secret env keys come only from authMaterial.
   * Env leftovers are not injected when status !== connected.
   */
  authEnforced?: boolean
  authMaterial?: CredentialMaterial
}

export type { McpServerConfigShape } from './manifest.js'

export type ResolvedMcpServer = {
  serverId: string
  pluginId: string
  transport: 'http' | 'stdio'
  server: McpServerConfigShape
  readOnlyToolNames: string[]
  /** Provider-owned stable namespace for model-visible tool names. */
  toolNamePrefix?: string
  /** Live re-resolve before each tool execute (revoke-aware gate) */
  resolveAuthMaterial?: () => Promise<CredentialMaterial | undefined>
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
  toolIdentities: RegisteredToolIdentity[]
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
  auth?: McpResolveAuthOptions,
): Record<string, string> {
  const keys = resolveMcpChildEnvKeys(contrib, env)
  const filtered = filterChildEnv(env, keys, {
    includeBaseKeys: true,
  })
  if (!auth?.authEnforced) return filtered

  const material = auth.authMaterial
  const controlled = new Set([
    ...(material?.controlledEnvNames ?? []),
    ...(contrib.bearerTokenFromEnv ?? []),
  ])

  // Strip controlled secrets when not connected; overlay material values when connected
  for (const name of controlled) {
    delete filtered[name]
  }
  if (material?.status === 'connected') {
    for (const [k, v] of Object.entries(material.envValues)) {
      // Never re-inject model provider secrets after filterChildEnv (P0)
      if (isModelProviderSecretKey(k) || !isAllowedAuthEnvName(k)) continue
      if (keys.includes(k) || controlled.has(k)) {
        filtered[k] = v
      }
    }
  }
  return stripModelProviderSecrets(filtered)
}

/**
 * Resolve bearer for HTTP MCP: auth-enforced path uses material only (#28).
 */
export function resolveMcpBearerToken(
  contrib: McpContribution,
  env: ProfileEnv,
  auth?: McpResolveAuthOptions,
): string | undefined {
  if (auth?.authEnforced) {
    if (auth.authMaterial?.status !== 'connected') return undefined
    const token = auth.authMaterial.bearerToken
    // Defense: never inject empty bearer
    return token && token.length > 0 ? token : undefined
  }
  // Even without authEnforced, never use model-provider env as MCP bearer
  // (local plugin can omit contributes.auth and name OPENAI_API_KEY).
  const names = (contrib.bearerTokenFromEnv ?? []).filter(
    (n) => isAllowedAuthEnvName(n) && !isModelProviderSecretKey(n),
  )
  if (names.length === 0) return undefined
  return firstEnv(env, names)
}

export function resolveMcpContribution(
  pluginId: string,
  contrib: McpContribution,
  env: ProfileEnv,
  auth?: McpResolveAuthOptions,
): ResolvedMcpServer | null {
  const timeout =
    contrib.timeoutMs ??
    (Number(env.MCP_TIMEOUT_MS ?? 20_000) || 20_000)

  const url = firstEnv(env, contrib.urlFromEnv) ?? contrib.url?.trim()
  if (url) {
    const token = resolveMcpBearerToken(contrib, env, auth)
    const requestInit = token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined
    return {
      pluginId,
      serverId: contrib.serverId,
      transport: 'http',
      readOnlyToolNames: contrib.readOnlyToolNames ?? [],
      toolNamePrefix: contrib.toolNamePrefix,
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
    const childEnv = buildMcpChildEnv(contrib, env, auth)
    return {
      pluginId,
      serverId: contrib.serverId,
      transport: 'stdio',
      readOnlyToolNames: contrib.readOnlyToolNames ?? [],
      toolNamePrefix: contrib.toolNamePrefix,
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

/**
 * Gate MCP tool execute on live auth status so revoke/logout blocks further
 * calls even when HTTP Authorization was snapshotted at load (adversarial).
 * Prefer in-place execute wrap so needsApproval functions / hooks stay intact.
 */
export function wrapMcpToolsWithLiveAuthGate(
  tools: Tool<any, any>[],
  resolveMaterial: () => Promise<CredentialMaterial | undefined>,
): Tool<any, any>[] {
  return tools.map((tool) => {
    const anyTool = tool as Tool<any, any> & {
      parameters?: unknown
      execute?: (...args: any[]) => any
      description?: string
      needsApproval?: unknown
      hooks?: unknown
      outputSchema?: unknown
      providerOptions?: unknown
      tags?: unknown
    }
    if (typeof anyTool.execute !== 'function') {
      return tool
    }
    const original = anyTool.execute.bind(tool)
    const gated = async (...args: any[]) => {
      const material = await resolveMaterial()
      if (!material || material.status !== 'connected') {
        return {
          ok: false,
          error: 'auth_revoked',
          hint:
            material?.hint ??
            '授权已撤销或未连接；请 auth login 后重启 sidecar（MCP 会话）',
        }
      }
      return original(...args)
    }

    // Prefer mutating execute in place — preserves dynamic needsApproval / hooks
    try {
      const desc = Object.getOwnPropertyDescriptor(tool, 'execute')
      if (!desc || desc.writable || desc.set) {
        ;(anyTool as { execute: typeof gated }).execute = gated
        return tool
      }
    } catch {
      // fall through to reconstruct
    }

    if (anyTool.parameters == null) return tool
    return createTool({
      name: tool.name,
      description: anyTool.description ?? tool.name,
      parameters: anyTool.parameters as any,
      // Preserve boolean OR function approval policy (do not collapse to === true)
      needsApproval: anyTool.needsApproval as any,
      ...(anyTool.hooks != null ? { hooks: anyTool.hooks as any } : {}),
      execute: gated,
    }) as Tool<any, any>
  })
}

/** Gate public MCP tools with the immutable connector selection for this Turn. */
export function wrapMcpToolsWithTaskSelectionGate(
  tools: Tool<any, any>[],
  descriptors: readonly ConnectorDescriptor[],
): Tool<any, any>[] {
  return tools.map((tool) => {
    const connector = descriptors.find((descriptor) =>
      descriptor.toolScope.some((scope) =>
        scope.endsWith('.') || scope.endsWith('_')
          ? tool.name.startsWith(scope)
          : tool.name === scope,
      ),
    )
    if (!connector) return tool

    const anyTool = tool as Tool<any, any> & {
      parameters?: unknown
      execute?: (...args: any[]) => any
      description?: string
      needsApproval?: unknown
      hooks?: unknown
    }
    if (typeof anyTool.execute !== 'function') return tool
    const original = anyTool.execute.bind(tool)
    const gated = async (
      rawArgs: unknown,
      executeOptions?: ToolExecuteOptions,
    ) => {
      const turnContext = readCapabilityTurnContext(executeOptions)
      const decision = gateConnectorToolInvoke(tool.name, {
        taskId: turnContext.taskId,
        selectedConnectorIds: turnContext.selectedConnectorIds,
        descriptors,
        authLookup: () => ({
          pluginGloballyEnabled: true,
          authStatus: 'connected',
        }),
      })
      if (!decision.allowed) {
        return {
          ok: false,
          error: decision.reason,
          hint: decision.hint,
        }
      }
      return original(rawArgs, executeOptions)
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(tool, 'execute')
      if (!desc || desc.writable || desc.set) {
        ;(anyTool as { execute: typeof gated }).execute = gated
        return tool
      }
    } catch {
      // fall through to reconstruct
    }

    if (anyTool.parameters == null) return tool
    return createTool({
      name: tool.name,
      description: anyTool.description ?? tool.name,
      parameters: anyTool.parameters as any,
      needsApproval: anyTool.needsApproval as any,
      ...(anyTool.hooks != null ? { hooks: anyTool.hooks as any } : {}),
      execute: gated,
    }) as Tool<any, any>
  })
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

/** Expose a reversible model name without changing Provider call behavior. */
function exposeMcpToolWithPublicName(
  tool: Tool<any, any>,
  publicName: string,
): Tool<any, any> {
  if (tool.name === publicName) return tool
  const source = tool as Tool<any, any> & {
    parameters?: unknown
    execute?: (...args: any[]) => any
    description?: string
    needsApproval?: unknown
    hooks?: unknown
  }
  if (source.parameters == null || typeof source.execute !== 'function') {
    throw new Error(`MCP 工具 ${tool.name} 无法安全映射公开名 ${publicName}`)
  }
  const execute = source.execute.bind(tool)
  return createTool({
    name: publicName,
    description: source.description ?? tool.name,
    parameters: source.parameters as any,
    needsApproval: source.needsApproval as any,
    ...(source.hooks != null ? { hooks: source.hooks as any } : {}),
    execute: (...args: any[]) => execute(...args),
  }) as Tool<any, any>
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
    /** Provider-projected connectors used by the per-Turn execution gate. */
    connectorDescriptors?: readonly ConnectorDescriptor[]
  },
): Promise<McpLoadAggregate> {
  const host = options?.host ?? { getTools: defaultMcpHost }
  const env = options?.env ?? process.env
  const disconnectors: Array<() => Promise<void>> = []
  const allTools: Tool<any, any>[] = []
  const allNames: string[] = []
  const identityRegistry = createToolIdentityRegistry()
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
      const gated =
        conf.resolveAuthMaterial != null
          ? wrapMcpToolsWithLiveAuthGate(approved, conf.resolveAuthMaterial)
          : approved
      const exposed = gated.map((tool) => {
        const identity = identityRegistry.register(
          {
            pluginId: conf.pluginId,
            channel: 'mcp',
            channelId: conf.serverId,
            originalName: tool.name,
          },
          conf.toolNamePrefix
            ? { preferredPublicName: `${conf.toolNamePrefix}${tool.name}` }
            : undefined,
        )
        return exposeMcpToolWithPublicName(tool, identity.publicName)
      })
      const taskGated = wrapMcpToolsWithTaskSelectionGate(
        exposed,
        options?.connectorDescriptors ?? [],
      )
      const names = taskGated.map((tool) => tool.name)
      allTools.push(...taskGated)
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
    toolIdentities: identityRegistry.list(),
    statuses,
    disconnect: async () => {
      for (const d of disconnectors) await d()
    },
  }
}
