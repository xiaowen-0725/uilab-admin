/**
 * PluginRegistry — discover / enable / isolate-load / aggregate tools + skills + CLI (#19–#21).
 */

import type { Tool } from '@voltagent/core'
import { BUILTIN_PLUGINS } from './builtins.js'
import {
  loadCliContributions,
  type CliLoadStatus,
  type CliRunner,
} from './cli-loader.js'
import type {
  CliContribution,
  PluginManifest,
  SkillsContribution,
} from './manifest.js'
import {
  loadResolvedMcpServers,
  resolveMcpContribution,
  type McpHost,
  type McpServerLoadStatus,
  type ResolvedMcpServer,
} from './mcp-loader.js'
import { parseEnvStringList } from './parse-util.js'
import {
  loadSkillsContributions,
  type SkillsSeedResult,
} from './skills-loader.js'
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
  skills?: SkillsSeedResult
  cli: CliLoadStatus[]
}

export type PluginRegistryLoadResult = {
  plugins: PluginRuntimeRecord[]
  tools: Tool<any, any>[]
  toolNames: string[]
  mcpStatuses: McpServerLoadStatus[]
  cliStatuses: CliLoadStatus[]
  /** Virtual skill roots for Workspace.skills.rootPaths */
  skillRoots: string[]
  skillsResults: SkillsSeedResult[]
  disconnect: () => Promise<void>
}

export type PluginRegistryLoadOptions = {
  /** When set, seed skills contributions into this workspace (missing-only). */
  workspaceRoot?: string
  packageRoot?: string
  bundledSkillsDir?: string
}

export type PluginRegistry = {
  listManifests(): PluginManifest[]
  /** Enabled plugin ids for this env/config */
  resolveEnabledIds(): string[]
  load(options?: PluginRegistryLoadOptions): Promise<PluginRegistryLoadResult>
}

export type CreatePluginRegistryOptions = {
  env?: ProfileEnv
  builtins?: PluginManifest[]
  /** Additional manifests (local discovery later) */
  extra?: PluginManifest[]
  host?: McpHost
  /** Inject domain CLI runner (tests / fake binary). */
  cliRunner?: CliRunner
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
    async load(
      loadOptions: PluginRegistryLoadOptions = {},
    ): Promise<PluginRegistryLoadResult> {
      const enabled = new Set(resolveEnabledIds())
      const plugins: PluginRuntimeRecord[] = []
      const resolvedServers: ResolvedMcpServer[] = []
      const expected: Array<{ pluginId: string; serverId: string }> = []
      const skillsItems: Array<{ pluginId: string; contrib: SkillsContribution }> =
        []
      const cliItems: Array<{ pluginId: string; contrib: CliContribution }> = []

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
            cli: [],
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
              cli: [],
            })
          }
        }

        if (manifest.contributes?.skills) {
          skillsItems.push({
            pluginId: manifest.id,
            contrib: manifest.contributes.skills,
          })
        }

        for (const c of manifest.contributes?.cli ?? []) {
          cliItems.push({ pluginId: manifest.id, contrib: c })
        }

        if (!plugins.some((p) => p.id === manifest.id)) {
          plugins.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            kind: manifest.kind,
            enabled: true,
            loadStatus: 'loaded',
            mcp: [],
            cli: [],
          })
        }
      }

      const mcpAgg = await loadResolvedMcpServers(resolvedServers, {
        env,
        host: options.host,
        expected,
      })

      const skillsAgg = await loadSkillsContributions(skillsItems, {
        workspaceRoot: loadOptions.workspaceRoot,
        packageRoot: loadOptions.packageRoot,
        bundledSkillsDir: loadOptions.bundledSkillsDir,
      })

      const cliAgg = await loadCliContributions(cliItems, {
        env,
        workspaceRoot: loadOptions.workspaceRoot,
        runner: options.cliRunner,
      })

      for (const rec of plugins) {
        if (!rec.enabled) continue
        const mcp = mcpAgg.statuses.filter((s) => s.pluginId === rec.id)
        rec.mcp = mcp
        const skills = skillsAgg.results.find((s) => s.pluginId === rec.id)
        if (skills) rec.skills = skills
        const cli = cliAgg.statuses.filter((s) => s.pluginId === rec.id)
        rec.cli = cli

        const mcpFailedOnly =
          mcp.length > 0 &&
          mcp.some((s) => s.status === 'failed') &&
          !mcp.some((s) => s.status === 'connected') &&
          !mcp.every((s) => s.status === 'disabled')
        const skillsFailed = skills?.status === 'failed'
        // missing binary is observable but not fatal to other plugins
        const cliHardFailed = cli.some((s) => s.status === 'failed')

        if (mcpFailedOnly || skillsFailed || cliHardFailed) {
          rec.loadStatus = 'failed'
          rec.reason =
            skillsFailed && skills?.reason
              ? skills.reason
              : cli.find((s) => s.status === 'failed')?.reason ??
                mcp.find((s) => s.status === 'failed')?.reason
        } else if (mcp.every((s) => s.status === 'disabled') && mcp.length > 0) {
          rec.loadStatus = 'loaded'
          rec.reason = rec.reason ?? 'MCP 未配置（disabled）'
        } else {
          rec.loadStatus = 'loaded'
        }
      }

      return {
        plugins,
        tools: [...mcpAgg.tools, ...cliAgg.tools],
        toolNames: [...mcpAgg.toolNames, ...cliAgg.toolNames],
        mcpStatuses: mcpAgg.statuses,
        cliStatuses: cliAgg.statuses,
        skillRoots: skillsAgg.virtualRoots,
        skillsResults: skillsAgg.results,
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
