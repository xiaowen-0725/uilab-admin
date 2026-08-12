/**
 * PluginRegistry — discover / enable / isolate-load / aggregate (#19–#23).
 */

import type { Tool } from '@voltagent/core'
import {
  formatAuthDoctorLine,
  formatAuthStatusSummary,
  pickAuthResourceForCli,
  pickAuthResourceForMcp,
  resolveAuthResourceMaterial,
  resolvePluginAuthStatuses,
  type PluginAuthStatus,
  type ResolvePluginAuthOptions,
} from './auth-status.js'
import { BUILTIN_PLUGINS } from './builtins.js'
import { DEMO_EXAMPLE_PACKAGE } from './demo-package.js'
import {
  projectConnectorDescriptors,
  type ConnectorDescriptor,
} from './connector-descriptor.js'
import {
  discoverLocalPlugins,
  type PluginDiscoveryFailure,
} from './discover.js'
import type { FakeCatalogEntry, BuiltinPluginPackage } from './plugin-package.js'
import {
  loadCliContributions,
  type CliLoadStatus,
  type CliRunner,
} from './cli-loader.js'
import type {
  AuthResourceContribution,
  CliContribution,
  PluginManifest,
  SkillsContribution,
} from './manifest.js'
import { createPersistedAuthBindingStore } from './auth-binding-persist.js'
import {
  createAuthBindingStore,
  createDefaultSecretStore,
  type AuthBindingStore,
  type SecretStore,
} from './secret-store.js'
import {
  loadResolvedMcpServers,
  resolveMcpContribution,
  type McpHost,
  type McpLoadAggregate,
  type McpServerLoadStatus,
  type ResolvedMcpServer,
} from './mcp-loader.js'
import type { CredentialMaterial } from './types.js'
import type { RegisteredToolIdentity } from './tool-identity.js'
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
  auth: PluginAuthStatus[]
}

export type PluginRegistryLoadResult = {
  plugins: PluginRuntimeRecord[]
  /** Product Connector catalog projected from Provider-owned manifests. */
  connectorDescriptors: ConnectorDescriptor[]
  tools: Tool<any, any>[]
  toolNames: string[]
  /** Reversible model-visible name → Provider identity records. */
  toolIdentities: RegisteredToolIdentity[]
  mcpStatuses: McpServerLoadStatus[]
  cliStatuses: CliLoadStatus[]
  authStatuses: PluginAuthStatus[]
  /** Compact doctor line (no secrets) */
  authDoctorLine: string
  authStatusLine: string
  /** Local plugin.json discovery failures (isolated; builtins still load) */
  discoveryFailures: PluginDiscoveryFailure[]
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
  listConnectorDescriptors(): ConnectorDescriptor[]
  /** Deterministic Fake catalog entries from registered packages (#49). */
  listFakeCatalog(): FakeCatalogEntry[]
  /** Enabled plugin ids for this env/config */
  resolveEnabledIds(): string[]
  /** Re-probe auth resources without reconnecting MCP or rebuilding tools. */
  refreshAuthStatuses(): Promise<PluginAuthStatus[]>
  /** Connect one enabled MCP plugin after managed OAuth authorization. */
  loadMcpPlugin(pluginId: string): Promise<McpLoadAggregate>
  /** Node-side auth infrastructure; never expose through HTTP/Renderer. */
  getAuthRuntimeStores(): {
    secretStore: SecretStore
    bindingStore?: AuthBindingStore
  }
  load(options?: PluginRegistryLoadOptions): Promise<PluginRegistryLoadResult>
}

export type CreatePluginRegistryOptions = {
  env?: ProfileEnv
  builtins?: PluginManifest[]
  /** Builtin packages bundling manifests + brand + Fake catalog (#49). */
  packages?: BuiltinPluginPackage[]
  /** Additional manifests (from PLUGIN_PATHS discovery or tests) */
  extra?: PluginManifest[]
  /** Isolated discovery failures (invalid plugin.json, conflicts, missing paths) */
  discoveryFailures?: PluginDiscoveryFailure[]
  host?: McpHost
  /** Inject domain CLI runner (tests / fake binary). */
  cliRunner?: CliRunner
  secretStore?: SecretStore
  authBindingStore?: AuthBindingStore
  /**
   * Explicit enable list. Default: all enabledByDefault builtins
   * minus PLUGINS_DISABLED, plus PLUGINS_ENABLED overrides.
   */
  enabledIds?: string[]
  /**
   * User-level runtime config dir for persisted AuthBindings (#29).
   * Default: $UILAB_RUNTIME_DIR or ~/.uilab/runtime.
   */
  runtimeConfigDir?: string
  /**
   * When true (default for createPluginRegistryFromEnv), load/save AuthBindings.
   * Tests may set false or inject authBindingStore / runtimeConfigDir temp.
   */
  persistAuthBindings?: boolean
}

/** Deduplicate by id — first wins (builtins before local). */
function mergeManifests(
  builtins: PluginManifest[],
  extra: PluginManifest[],
): PluginManifest[] {
  const byId = new Map<string, PluginManifest>()
  for (const m of builtins) {
    if (!byId.has(m.id)) byId.set(m.id, m)
  }
  for (const m of extra) {
    if (!byId.has(m.id)) byId.set(m.id, m)
  }
  return [...byId.values()]
}

export function createPluginRegistry(
  options: CreatePluginRegistryOptions = {},
): PluginRegistry {
  const env = options.env ?? process.env
  // Expand package manifests into the builtin set before merging.
  const packages = options.packages ?? []
  const packageManifests = packages.flatMap((pkg) => pkg.manifests)
  const fakeCatalog: FakeCatalogEntry[] = packages.flatMap(
    (pkg) => pkg.fakeCatalog ?? [],
  )
  const manifests = mergeManifests(
    [...(options.builtins ?? BUILTIN_PLUGINS), ...packageManifests],
    options.extra ?? [],
  )
  const byId = new Map(manifests.map((m) => [m.id, m]))
  const discoveryFailures = options.discoveryFailures ?? []
  const connectorDescriptors = projectConnectorDescriptors(manifests)

  function resolveEnabledIds(): string[] {
    if (options.enabledIds) return [...options.enabledIds]
    const disabled = new Set(
      (parseEnvStringList(env.PLUGINS_DISABLED) ?? []).map((s) => s.trim()),
    )
    // Additive: defaults (enabledByDefault) ∪ PLUGINS_ENABLED − PLUGINS_DISABLED
    const base = manifests
      .filter((m) => m.enabledByDefault !== false)
      .map((m) => m.id)
    const forced = (parseEnvStringList(env.PLUGINS_ENABLED) ?? []).map((s) =>
      s.trim(),
    )
    const ids = new Set<string>([...base, ...forced])
    return [...ids].filter((id) => byId.has(id) && !disabled.has(id))
  }

  const authOpts: ResolvePluginAuthOptions = {
    env,
    store: options.secretStore,
    bindingStore: options.authBindingStore,
    runner: options.cliRunner,
  }

  function buildAuthItems() {
    const enabled = new Set(resolveEnabledIds())
    return manifests.map((manifest) => ({
      pluginId: manifest.id,
      enabled: enabled.has(manifest.id),
      resources: manifest.contributes?.auth ?? [],
    }))
  }

  async function loadMcpPlugin(pluginId: string): Promise<McpLoadAggregate> {
    const manifest = byId.get(pluginId)
    if (!manifest || !resolveEnabledIds().includes(pluginId)) {
      throw new Error(`MCP plugin 未启用：${pluginId}`)
    }
    const resources = manifest.contributes?.auth ?? []
    const authEnforced = resources.length > 0
    const resolved: ResolvedMcpServer[] = []
    const expected: Array<{ pluginId: string; serverId: string }> = []
    for (const contribution of manifest.contributes?.mcp ?? []) {
      expected.push({ pluginId, serverId: contribution.serverId })
      const resource = authEnforced
        ? pickAuthResourceForMcp(resources, contribution.serverId)
        : undefined
      const material = resource
        ? await resolveAuthResourceMaterial(pluginId, resource, true, authOpts)
        : undefined
      if (authEnforced && material?.status !== 'connected') continue
      const server = resolveMcpContribution(pluginId, contribution, env, {
        authEnforced,
        authMaterial: material,
      })
      if (!server) continue
      if (resource) {
        server.resolveAuthMaterial = () =>
          resolveAuthResourceMaterial(pluginId, resource, true, authOpts)
      }
      resolved.push(server)
    }
    return loadResolvedMcpServers(resolved, {
      env,
      host: options.host,
      expected,
      connectorDescriptors,
    })
  }

  return {
    listManifests: () => [...manifests],
    listConnectorDescriptors: () => [...connectorDescriptors],
    listFakeCatalog: () => [...fakeCatalog],
    resolveEnabledIds,
    refreshAuthStatuses: () =>
      resolvePluginAuthStatuses(buildAuthItems(), authOpts),
    loadMcpPlugin,
    getAuthRuntimeStores: () => ({
      secretStore: authOpts.store ?? createDefaultSecretStore(env),
      bindingStore: authOpts.bindingStore,
    }),
    async load(
      loadOptions: PluginRegistryLoadOptions = {},
    ): Promise<PluginRegistryLoadResult> {
      const enabled = new Set(resolveEnabledIds())
      const plugins: PluginRuntimeRecord[] = []
      const resolvedServers: ResolvedMcpServer[] = []
      const expected: Array<{ pluginId: string; serverId: string }> = []
      const skillsItems: Array<{
        pluginId: string
        contrib: SkillsContribution
        trustedInstalledSource?: boolean
      }> = []
      const cliItems: Array<{
        pluginId: string
        contrib: CliContribution
        authMaterial?: CredentialMaterial
        authEnforced?: boolean
        resolveAuthMaterial?: () => Promise<CredentialMaterial | undefined>
      }> = []
      const authItems: Array<{
        pluginId: string
        enabled: boolean
        resources: AuthResourceContribution[]
      }> = []

      for (const manifest of manifests) {
        const isEnabled = enabled.has(manifest.id)
        const authResources = manifest.contributes?.auth ?? []
        authItems.push({
          pluginId: manifest.id,
          enabled: isEnabled,
          resources: authResources,
        })

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
            auth: [],
          })
          continue
        }

        const authEnforced = authResources.length > 0

        const mcpContribs = manifest.contributes?.mcp ?? []
        for (const c of mcpContribs) {
          expected.push({ pluginId: manifest.id, serverId: c.serverId })
          try {
            let material: CredentialMaterial | undefined
            const resource = authEnforced
              ? pickAuthResourceForMcp(authResources, c.serverId)
              : undefined
            if (resource) {
              material = await resolveAuthResourceMaterial(
                manifest.id,
                resource,
                true,
                authOpts,
              )
            } else if (authEnforced) {
              // Match CLI fail-closed: no matched auth resource → always missing
              material = {
                status: 'missing',
                envValues: {},
                controlledEnvNames: [],
                hint: '未匹配 auth 资源；auth-enforced MCP 不可用',
              }
            }
            if (resource?.kind === 'oauth2' && material?.status !== 'connected') {
              continue
            }
            const resolved = resolveMcpContribution(manifest.id, c, env, {
              authEnforced,
              authMaterial: material,
            })
            if (resolved) {
              if (resource) {
                resolved.resolveAuthMaterial = () =>
                  resolveAuthResourceMaterial(
                    manifest.id,
                    resource,
                    true,
                    authOpts,
                  )
              } else if (authEnforced) {
                resolved.resolveAuthMaterial = async () => ({
                  status: 'missing' as const,
                  envValues: {},
                  controlledEnvNames: [],
                  hint: '未匹配 auth 资源；auth-enforced MCP 不可用',
                })
              }
              resolvedServers.push(resolved)
            }
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
              auth: [],
            })
          }
        }

        if (manifest.contributes?.skills) {
          skillsItems.push({
            pluginId: manifest.id,
            contrib: manifest.contributes.skills,
            trustedInstalledSource: manifest.kind === 'builtin',
          })
        }

        for (const c of manifest.contributes?.cli ?? []) {
          let material: CredentialMaterial | undefined
          let resolveAuthMaterial:
            | (() => Promise<CredentialMaterial | undefined>)
            | undefined
          if (authEnforced) {
            const resource = pickAuthResourceForCli(authResources, c.cliId)
            if (resource) {
              material = await resolveAuthResourceMaterial(
                manifest.id,
                resource,
                true,
                authOpts,
              )
              // Live re-resolve on each CLI tool invoke so revoke/logout
              // is effective without restarting the sidecar process.
              resolveAuthMaterial = () =>
                resolveAuthResourceMaterial(
                  manifest.id,
                  resource,
                  true,
                  authOpts,
                )
            } else {
              // No matching auth resource for this CLI — still gate execute
              // (never fail-open with process env after plugin-wide logout).
              resolveAuthMaterial = async () => ({
                status: 'missing' as const,
                envValues: {},
                controlledEnvNames: [],
                hint: '未匹配 auth 资源；领域 CLI 在 auth-enforced 插件上不可用',
              })
              material = await resolveAuthMaterial()
            }
          }
          cliItems.push({
            pluginId: manifest.id,
            contrib: c,
            authEnforced,
            authMaterial: material,
            resolveAuthMaterial,
          })
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
            auth: [],
          })
        }
      }

      const mcpAgg = await loadResolvedMcpServers(resolvedServers, {
        env,
        host: options.host,
        expected,
        connectorDescriptors,
      })

      const skillsAgg = await loadSkillsContributions(skillsItems, {
        workspaceRoot: loadOptions.workspaceRoot,
        packageRoot: loadOptions.packageRoot,
        bundledSkillsDir: loadOptions.bundledSkillsDir,
        env,
      })

      // Only builtin plugins may self-declare free CLI tools; local PLUGIN_PATHS force approval
      const trustedPluginIds = new Set(
        manifests.filter((m) => m.kind === 'builtin').map((m) => m.id),
      )
      const cliAgg = await loadCliContributions(cliItems, {
        env,
        workspaceRoot: loadOptions.workspaceRoot,
        runner: options.cliRunner,
        trustedPluginIds,
        connectorDescriptors,
      })

      const authStatuses = await resolvePluginAuthStatuses(authItems, authOpts)

      for (const rec of plugins) {
        rec.auth = authStatuses.filter((a) => a.pluginId === rec.id)
        if (!rec.enabled) continue
        const mcp = mcpAgg.statuses.filter((s) => s.pluginId === rec.id)
        rec.mcp = mcp
        const skills = skillsAgg.results.find((s) => s.pluginId === rec.id)
        if (skills) rec.skills = skills
        const cli = cliAgg.statuses.filter((s) => s.pluginId === rec.id)
        rec.cli = cli

        // Any failed MCP/CLI contribution marks plugin failed (not hidden by siblings)
        const mcpAnyFailed = mcp.some((s) => s.status === 'failed')
        const skillsFailed = skills?.status === 'failed'
        const cliHardFailed = cli.some((s) => s.status === 'failed')

        if (mcpAnyFailed || skillsFailed || cliHardFailed) {
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

      // Surface discovery failures as synthetic failed plugin rows (not in enable set)
      for (const f of discoveryFailures) {
        if (plugins.some((p) => p.id === f.id)) continue
        plugins.push({
          id: f.id,
          name: f.id,
          version: '0.0.0',
          kind: 'local',
          enabled: false,
          loadStatus: 'failed',
          reason: `${f.reason}（${f.sourcePath}）`,
          mcp: [],
          cli: [],
          auth: [],
        })
      }

      return {
        plugins,
        connectorDescriptors: [...connectorDescriptors],
        tools: [...mcpAgg.tools, ...cliAgg.tools],
        toolNames: [...mcpAgg.toolNames, ...cliAgg.toolNames],
        toolIdentities: [
          ...mcpAgg.toolIdentities,
          ...cliAgg.toolIdentities,
        ],
        mcpStatuses: mcpAgg.statuses,
        cliStatuses: cliAgg.statuses,
        authStatuses,
        authDoctorLine: formatAuthDoctorLine(authStatuses),
        authStatusLine: formatAuthStatusSummary(authStatuses),
        discoveryFailures: [...discoveryFailures],
        skillRoots: skillsAgg.virtualRoots,
        skillsResults: skillsAgg.results,
        disconnect: mcpAgg.disconnect,
      }
    },
  }
}

/**
 * Build registry with PLUGIN_PATHS local discovery (declarative plugin.json only).
 * Also wires default SecretStore (env+keychain) and persisted AuthBindings (#29/#30).
 */
export async function createPluginRegistryFromEnv(
  options: CreatePluginRegistryOptions & {
    /** Override search paths (else env.PLUGIN_PATHS) */
    pluginPaths?: string[]
  } = {},
): Promise<PluginRegistry> {
  const env = options.env ?? process.env
  const builtins = options.builtins ?? BUILTIN_PLUGINS
  const packages = options.packages ?? [DEMO_EXAMPLE_PACKAGE]
  const reservedIds = new Set(builtins.map((m) => m.id))
  for (const pkg of packages) {
    for (const m of pkg.manifests) reservedIds.add(m.id)
  }
  for (const m of options.extra ?? []) reservedIds.add(m.id)

  const discovery = await discoverLocalPlugins({
    env,
    paths: options.pluginPaths,
    reservedIds,
  })

  let authBindingStore = options.authBindingStore
  const persist =
    options.persistAuthBindings !== false &&
    env.UILAB_PERSIST_AUTH !== '0'
  if (!authBindingStore && persist) {
    authBindingStore = await createPersistedAuthBindingStore({
      env,
      rootDir: options.runtimeConfigDir,
    })
  }
  if (!authBindingStore) {
    authBindingStore = createAuthBindingStore()
  }

  const secretStore =
    options.secretStore ?? createDefaultSecretStore(env)

  return createPluginRegistry({
    ...options,
    env,
    builtins,
    packages,
    secretStore,
    authBindingStore,
    extra: [...(options.extra ?? []), ...discovery.manifests],
    discoveryFailures: [
      ...(options.discoveryFailures ?? []),
      ...discovery.failures,
    ],
  })
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
