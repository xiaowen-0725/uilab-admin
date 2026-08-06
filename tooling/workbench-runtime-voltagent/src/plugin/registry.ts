/**
 * PluginRegistry — discover / enable / isolate-load / aggregate tools (#19).
 */

import type { Tool } from '@voltagent/core'
import { BUILTIN_PLUGINS } from './builtins.js'
import type { PluginManifest } from './manifest.js'
import {
  loadResolvedMcpServers,
  resolveMcpContribution,
  type McpHost,
  type McpServerLoadStatus,
  type ResolvedMcpServer,
} from './mcp-loader.js'
import { parseEnvStringList } from './parse-util.js'
import type { ProfileEnv } from './types.js'

export type PluginLoadStatus = 'loaded' | 'failed' | 'disabled'

export type PluginRuntimeRecord = {
  id: string
  name: string
  version: string
  kind: PluginManifest['kind']
  enabled: boolean
  loadStatus: PluginLoadStatus
  reason?: string
  mcp: McpServerLoadStatus[]
}

export type PluginRegistryLoadResult = {
  plugins: PluginRuntimeRecord[]
  tools: Tool<any, any>[]
  toolNames: string[]
  mcpStatuses: McpServerLoadStatus[]
  disconnect: () => Promise<void>
}

export type PluginRegistry = {
  listManifests(): PluginManifest[]
  /** Enabled plugin ids for this env/config */
  resolveEnabledIds(): string[]
  load(): Promise<PluginRegistryLoadResult>
}

export type CreatePluginRegistryOptions = {
  env?: ProfileEnv
  builtins?: PluginManifest[]
  /** Additional manifests (local discovery later) */
  extra?: PluginManifest[]
  host?: McpHost
  /**
   * Explicit enable list. Default: all enabledByDefault builtins
   * minus PLUGINS_DISABLED, plus PLUGINS_ENABLED overrides.
   */
  enabledIds?: string[]
}

export function createPluginRegistry(
  options: CreatePluginRegistryOptions = {},
): PluginRegistry {
  const env = options.env ?? process.env
  const manifests = [
    ...(options.builtins ?? BUILTIN_PLUGINS),
    ...(options.extra ?? []),
  ]
  const byId = new Map(manifests.map((m) => [m.id, m]))

  function resolveEnabledIds(): string[] {
    if (options.enabledIds) return [...options.enabledIds]
    const disabled = new Set(
      (parseEnvStringList(env.PLUGINS_DISABLED) ?? []).map((s) => s.trim()),
    )
    const forced = parseEnvStringList(env.PLUGINS_ENABLED)
    if (forced && forced.length > 0) {
      return forced.filter((id) => byId.has(id) && !disabled.has(id))
    }
    return manifests
      .filter((m) => m.enabledByDefault !== false && !disabled.has(m.id))
      .map((m) => m.id)
  }

  return {
    listManifests: () => [...manifests],
    resolveEnabledIds,
    async load(): Promise<PluginRegistryLoadResult> {
      const enabled = new Set(resolveEnabledIds())
      const plugins: PluginRuntimeRecord[] = []
      const resolvedServers: ResolvedMcpServer[] = []
      const expected: Array<{ pluginId: string; serverId: string }> = []

      for (const manifest of manifests) {
        const isEnabled = enabled.has(manifest.id)
        if (!isEnabled) {
          plugins.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            kind: manifest.kind,
            enabled: false,
            loadStatus: 'disabled',
            reason: '未启用',
            mcp: [],
          })
          continue
        }

        const mcpContribs = manifest.contributes?.mcp ?? []
        for (const c of mcpContribs) {
          expected.push({ pluginId: manifest.id, serverId: c.serverId })
          try {
            const resolved = resolveMcpContribution(manifest.id, c, env)
            if (resolved) resolvedServers.push(resolved)
          } catch (err) {
            // Resolution errors counted at plugin level below via load
            plugins.push({
              id: manifest.id,
              name: manifest.name,
              version: manifest.version,
              kind: manifest.kind,
              enabled: true,
              loadStatus: 'failed',
              reason:
                err instanceof Error ? err.message : 'MCP 配置解析失败',
              mcp: [],
            })
          }
        }

        // Placeholder; mcp details filled after loadResolvedMcpServers
        if (!plugins.some((p) => p.id === manifest.id)) {
          plugins.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            kind: manifest.kind,
            enabled: true,
            loadStatus: 'loaded',
            mcp: [],
          })
        }
      }

      const mcpAgg = await loadResolvedMcpServers(resolvedServers, {
        env,
        host: options.host,
        expected,
      })

      // Attach mcp statuses to plugin records; mark plugin failed if any mcp failed and none connected
      for (const rec of plugins) {
        if (!rec.enabled) continue
        const mcp = mcpAgg.statuses.filter((s) => s.pluginId === rec.id)
        rec.mcp = mcp
        if (mcp.some((s) => s.status === 'failed') && !mcp.some((s) => s.status === 'connected')) {
          // only failures / disabled
          if (mcp.every((s) => s.status === 'disabled')) {
            rec.loadStatus = 'loaded'
            rec.reason = 'MCP 未配置（disabled）'
          } else if (mcp.some((s) => s.status === 'failed')) {
            rec.loadStatus = 'failed'
            rec.reason = mcp.find((s) => s.status === 'failed')?.reason
          }
        } else {
          rec.loadStatus = 'loaded'
        }
      }

      return {
        plugins,
        tools: mcpAgg.tools,
        toolNames: mcpAgg.toolNames,
        mcpStatuses: mcpAgg.statuses,
        disconnect: mcpAgg.disconnect,
      }
    },
  }
}

/** Compact line for sidecar logs: docs=ok(2),calendar=off */
export function formatRegistryMcpStatusLine(
  statuses: McpServerLoadStatus[],
): string {
  if (statuses.length === 0) return 'mcp=none'
  return statuses
    .map((s) => {
      if (s.status === 'connected') return `${s.serverId}=ok(${s.toolNames.length})`
      if (s.status === 'failed') return `${s.serverId}=fail`
      return `${s.serverId}=off`
    })
    .join(',')
}
