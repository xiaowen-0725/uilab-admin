/**
 * Build the Workbench sidecar Agent for the selected profile.
 * Office → Workspace FS + PluginRegistry (MCP + Skills).
 * Minimal → plain Agent + DIY tools.
 *
 * Honesty: local sidecar only — not a multi-tenant production Runtime.
 */

import {
  Agent,
  NodeFilesystemBackend,
  Workspace,
  type Tool,
  type Toolkit,
  type WorkspaceSandbox,
} from '@voltagent/core'
import type { LanguageModel } from 'ai'
import {
  type MemoryKind,
  resolveOfficeRuntimeDefaults,
} from './office-runtime-defaults.js'
import {
  createPluginRegistryFromEnv,
  defaultCliRunner,
  expandConnectorToolScope,
  formatRegistryCliStatusLine,
  formatRegistryMcpStatusLine,
  listWorkspaceSkillIds,
  type CliLoadStatus,
  type ConnectorDescriptor,
  type CreatePluginRegistryOptions,
  type McpServerLoadStatus,
  type PluginAuthStatus,
  type PluginDiscoveryFailure,
} from './plugin/index.js'
import {
  type AgentProfile,
  resolveWorkspaceRoot,
  toolsForProfile,
} from './profile.js'
import { workbenchTools } from './tools.js'
import { ensureOfficeWorkspace } from './workspace-root.js'
import { filterToolsForTaskSelection } from './capability/tool-gate.js'
import { readCapabilityTurnContext } from './capability/turn-context.js'
import {
  createConnectorCliAuthRuntime,
  createDefaultCliAuthProcessRunner,
  type CliAuthProcessRunner,
  type ConnectorCliAuthStart,
  type ConnectorCliAuthTransition,
} from './capability/connector-cli-auth.js'
import {
  createConnectorOAuthRuntime,
  type ConnectorOAuthFetch,
} from './capability/connector-oauth.js'
import { createOfficeWorkspaceSandbox } from './runtime-shell/office-workspace-sandbox.js'
import { revokeAuthResource } from './plugin/revoke-auth-resource.js'

export type CreateWorkbenchAgentOptions = {
  profile: AgentProfile
  model: LanguageModel
  env?: NodeJS.ProcessEnv
  /** Override workspace root (tests). */
  workspaceRoot?: string
  maxSteps?: number
  /** Inject mock MCP host (tests). */
  mcpHost?: CreatePluginRegistryOptions['host']
  /** Inject domain CLI runner (tests). */
  cliRunner?: CreatePluginRegistryOptions['cliRunner']
  /** Inject the complete Workspace Shell adapter (tests). */
  workspaceSandbox?: WorkspaceSandbox
  /** Injectable platform Connector Broker transport (tests). */
  oauthFetch?: ConnectorOAuthFetch
  /** Injectable long-running CLI auth process adapter (tests). */
  cliAuthProcessRunner?: CliAuthProcessRunner
}

export type WorkbenchAgentBundle = {
  profile: AgentProfile
  agent: Agent
  workspaceRoot: string
  tools: readonly string[]
  /** Present only for office profile. */
  workspace?: Workspace
  /** O5 resolved long-run defaults (for logs / tests). */
  maxSteps: number
  summarizationEnabled: boolean
  memoryKind: MemoryKind
  /** Plugin MCP statuses (office only; empty for minimal). */
  mcpStatuses: McpServerLoadStatus[]
  mcpStatusLine: string
  cliStatuses: CliLoadStatus[]
  cliStatusLine: string
  authStatuses: PluginAuthStatus[]
  authStatusLine: string
  authDoctorLine: string
  discoveryFailures: PluginDiscoveryFailure[]
  /** Virtual skill roots mounted on Workspace (office). */
  skillRoots: string[]
  /** Enabled and successfully loaded plugin ids (for Capability Snapshot). */
  enabledPluginIds: string[]
  /** Product Connector catalog projected from Provider-owned manifests. */
  connectorDescriptors: ConnectorDescriptor[]
  /** Workspace skill folder ids discoverable after seed (office). */
  discoverableSkillIds: string[]
  /** Live re-probe auth statuses without full reload (best-effort). */
  refreshAuthStatuses: () => Promise<PluginAuthStatus[]>
  /** Product OAuth browser flow; office profile only. */
  beginConnectorOAuth?: (connectorId: string) => Promise<{
    authorizationUrl: string
    expiresIn: number
  }>
  /** Provider-declared CLI Device Flow; no Provider id or argv at this seam. */
  beginConnectorCliSession?: (
    connectorId: string,
    domains?: string[],
  ) => Promise<ConnectorCliAuthStart>
  /** Reconcile every active auth driver and return safe UI transitions. */
  reconcileConnectorAuth?: (
    connectorId?: string,
  ) => Promise<ConnectorCliAuthTransition[]>
  /** Revoke one descriptor-owned auth resource; no Provider-specific branch. */
  revokeConnectorAuth?: (connectorId: string) => Promise<{
    message: string
    needsSidecarRestart: boolean
    /** True when the live MCP transport was disconnected in-process. */
    hotReclaimApplied?: boolean
  }>
  disconnectMcp: () => Promise<void>
}

/**
 * Filesystem tool policies: reads free; write/edit/delete/rmdir need approval.
 */
export function officeFilesystemToolConfig() {
  return {
    filesystem: {
      defaults: { needsApproval: false },
      tools: {
        write_file: { needsApproval: true },
        edit_file: { needsApproval: true, requireReadBeforeWrite: true },
        delete_file: { needsApproval: true, requireReadBeforeWrite: true },
        rmdir: { needsApproval: true },
        mkdir: { needsApproval: true },
      },
    },
    sandbox: {
      defaults: { needsApproval: true },
      tools: {
        execute_command: { needsApproval: true },
      },
    },
  }
}

export async function createWorkbenchAgent(
  options: CreateWorkbenchAgentOptions,
): Promise<WorkbenchAgentBundle> {
  const env = options.env ?? process.env
  const profile = options.profile
  const workspaceRoot =
    options.workspaceRoot ?? resolveWorkspaceRoot(env, profile)
  const tools = toolsForProfile(profile)

  if (profile === 'office') {
    await ensureOfficeWorkspace(workspaceRoot)

    const defaults = await resolveOfficeRuntimeDefaults(profile, env, {
      workspaceRoot,
      maxStepsOverride: options.maxSteps,
    })

    // Registry: builtins + PLUGIN_PATHS plugin.json + skills/MCP/CLI/auth.
    const registry = await createPluginRegistryFromEnv({
      env,
      host: options.mcpHost,
      cliRunner: options.cliRunner,
    })
    const authStores = registry.getAuthRuntimeStores()
    const bindingStore = authStores.bindingStore
    if (!bindingStore) {
      throw new Error('Office OAuth Runtime 缺少 AuthBindingStore')
    }
    const manifests = registry.listManifests()
    const connectorOAuth = createConnectorOAuthRuntime({
      env,
      descriptors: registry.listConnectorDescriptors(),
      manifests,
      secretStore: authStores.secretStore,
      bindingStore,
      fetchImpl: options.oauthFetch,
    })
    const plugins = await registry.load({ workspaceRoot })

    // Soft-fail optional skills plugins; only hard-fail when skills.office itself fails.
    const officeSkillsFailed = plugins.skillsResults.find(
      (s) => s.pluginId === 'skills.office' && s.status === 'failed',
    )
    if (officeSkillsFailed) {
      throw new Error(
        officeSkillsFailed.reason ?? '插件 Skills 加载失败：skills.office',
      )
    }

    // No silent remount of /skills when Registry disabled skills contributions
    const skillRoots = plugins.skillRoots
    const skillsEnabled = skillRoots.length > 0
    const honestyTools = [...tools, ...plugins.toolNames]
    const liveMcpStatuses = [...plugins.mcpStatuses]
    // Hot-loaded MCP disconnectors keyed by pluginId so revoke can target only
    // the affected plugin's transports without tearing down unrelated servers.
    const dynamicMcpDisconnectors = new Map<string, Array<() => Promise<void>>>()
    // Capability execution requires both configuration enablement and a
    // successfully loaded contribution (including any Provider Skills sync).
    const enabledPluginIds = plugins.plugins
      .filter((plugin) => plugin.enabled && plugin.loadStatus === 'loaded')
      .map((plugin) => plugin.id)
    const connectorCliAuth = createConnectorCliAuthRuntime({
      env,
      descriptors: plugins.connectorDescriptors,
      manifests,
      enabledPluginIds,
      runner: options.cliRunner ?? defaultCliRunner,
      processRunner:
        options.cliAuthProcessRunner ?? createDefaultCliAuthProcessRunner(),
    })
    let liveAuthStatuses = [...plugins.authStatuses]
    const refreshAuthStatuses = async () => {
      liveAuthStatuses = await registry.refreshAuthStatuses()
      return [...liveAuthStatuses]
    }
    const workspaceSandbox =
      options.workspaceSandbox ??
      (await createOfficeWorkspaceSandbox({
        workspaceRoot,
        env,
        connectors: plugins.connectorDescriptors,
        manifests,
        resolveConnectorAccess: async (connectorId, turnContext) => {
          const descriptor = plugins.connectorDescriptors.find(
            (connector) => connector.id === connectorId,
          )
          if (!descriptor) {
            return {
              pluginEnabled: false,
              connected: false,
              taskSelected: false,
            }
          }
          const statuses = await refreshAuthStatuses()
          const auth = statuses.find(
            (status) =>
              status.pluginId === descriptor.authSummarySource.pluginId &&
              status.resourceId === descriptor.authSummarySource.resourceId,
          )
          return {
            pluginEnabled: descriptor.pluginRefs.some((pluginId) =>
              enabledPluginIds.includes(pluginId),
            ),
            connected: auth?.status === 'connected',
            taskSelected:
              turnContext.taskId !== null &&
              turnContext.selectedConnectorIds.includes(connectorId),
          }
        },
      }))

    const workspace = new Workspace({
      id: 'workbench-office',
      name: 'Workbench Office Workspace',
      operationTimeoutMs: Number(env.WORKSPACE_OPERATION_TIMEOUT_MS ?? 30_000),
      filesystem: {
        backend: new NodeFilesystemBackend({
          rootDir: workspaceRoot,
          virtualMode: true,
          contained: true,
        }),
      },
      sandbox: workspaceSandbox,
      ...(skillsEnabled
        ? {
            skills: {
              rootPaths: skillRoots,
              autoDiscover: true,
            },
          }
        : {}),
      toolConfig: officeFilesystemToolConfig(),
    })

    const mcpInstruction =
      plugins.toolNames.length > 0
        ? [
            'Optional Provider MCP tools may be available under the names listed in tools.',
            'Prefer read-only MCP tools; write/update/delete MCP tools require user approval.',
            'If MCP is unavailable, continue with local Workspace FS and skills only — do not invent cloud content.',
          ].join(' ')
        : 'MCP docs/calendar connectors are not connected in this session; use local Workspace FS and skills only.'

    const skillInstruction = skillsEnabled
      ? [
          'Office skills live under /skills (meeting-notes, weekly-report, research-brief).',
          `Provider-installed Skills may be synchronized under these manifest-declared roots: ${skillRoots.join(', ')}. Search and read the matching package instead of inventing Provider CLI commands.`,
          'When a request matches a skill: workspace_list_skills or workspace_search_skills → workspace_activate_skill → workspace_read_skill → follow SKILL.md → write deliverable under the skill output path.',
          'Deliverable paths: /output/meeting-notes/, /output/weekly-report/, /output/research-brief/.',
        ].join(' ')
      : 'Office skills plugins are not enabled in this session; do not invent skill toolkits.'

    const livePluginTools = [...plugins.tools] as Tool<any, any>[]
    const agent = new Agent({
      id: 'workbench',
      name: 'workbench',
      purpose:
        '本机办公 Agent Runtime（Workspace FS + Skills + 可选 MCP · 非远程生产集群）',
      instructions: [
        'You are the local Office Agent Runtime for UI Lab Agent Workbench.',
        'Respond in Chinese unless the user writes in another language.',
        'Use Workspace filesystem tools (ls, read_file, write_file, edit_file, …) inside the authorized root.',
        skillInstruction,
        mcpInstruction,
        'A generic Workspace Shell is available as execute_command. Every invocation requires Host approval; prefer command plus an exact args array and never put credentials in command, args, or model-supplied env.',
        'For a Provider CLI request, first discover and read the matching installed Skill and its required references, then invoke the manifest-scoped native executable with execute_command. There are no Provider-specific Runtime wrapper tools.',
        'A Provider executable is available only when its plugin is enabled, its declared auth resource is connected, and the active Task selected that Connector.',
        'All file paths must be virtual workspace paths starting with / (e.g. /notes/a.md, /output/meeting-notes/notes.md).',
        'Never use host absolute paths (/Users/..., /home/..., drive letters). Never paste operator host paths into tools.',
        'Prefer planning briefly, then read before write. Writes and deletes require user approval.',
        'Do not claim to be a remote multi-tenant production cluster — this is a local office sidecar.',
      ].join(' '),
      model: options.model,
      workspace,
      workspaceToolkits: {
        filesystem: {},
        sandbox: {},
        search: false,
        ...(skillsEnabled ? { skills: {} } : { skills: false as const }),
      },
      ...(skillsEnabled
        ? {
            workspaceSkillsPrompt: {
              includeAvailable: true,
              includeActivated: true,
              maxAvailable: 10,
              maxActivated: 5,
            },
          }
        : {}),
      tools: ({ context }) => {
        const turnContext = readCapabilityTurnContext({ context })
        return filterToolsForTaskSelection(
          livePluginTools,
          plugins.connectorDescriptors,
          turnContext.selectedConnectorIds,
        )
      },
      maxSteps: defaults.maxSteps,
      summarization: defaults.summarization,
      memory: defaults.memory,
    })

    const beginConnectorOAuth = (connectorId: string) =>
      connectorOAuth.begin(connectorId)

    const pendingOAuthHotLoads = new Map<
      string,
      { connectorId: string; pluginId: string }
    >()
    const hotLoadOAuthConnector = async (completed: {
      connectorId: string
      pluginId: string
    }) => {
      const descriptor = plugins.connectorDescriptors.find(
        (row) => row.id === completed.connectorId,
      )
      if (!descriptor) {
        throw new Error('平台 OAuth 完成后找不到 Connector descriptor')
      }
      const hot = await registry.loadMcpPlugin(completed.pluginId)
      const previousNames = expandConnectorToolScope(descriptor, honestyTools)
      const previousNameSet = new Set(previousNames)
      const retainedTools = livePluginTools.filter(
        (tool) => !previousNameSet.has(tool.name),
      )
      livePluginTools.splice(0, livePluginTools.length, ...retainedTools)
      livePluginTools.push(...hot.tools)
      const previousSet = new Set(previousNames)
      const nextNames = honestyTools.filter((name) => !previousSet.has(name))
      nextNames.push(...hot.toolNames)
      honestyTools.splice(0, honestyTools.length, ...new Set(nextNames))
      const statusIndexes: number[] = []
      for (let i = 0; i < liveMcpStatuses.length; i++) {
        if (liveMcpStatuses[i]?.pluginId === completed.pluginId) {
          statusIndexes.push(i)
        }
      }
      for (let i = statusIndexes.length - 1; i >= 0; i--) {
        liveMcpStatuses.splice(statusIndexes[i]!, 1)
      }
      liveMcpStatuses.push(...hot.statuses)
      // Disconnect any previous transport for this plugin before recording the
      // new one, so re-authorization (token refresh / re-login) does not leave
      // a zombie wire session carrying stale credentials. Guard each disconnect
      // so a failing old transport never prevents the new disconnector (and its
      // fresh credentials) from being registered.
      const previousDisconnectors =
        dynamicMcpDisconnectors.get(completed.pluginId) ?? []
      for (const disconnect of previousDisconnectors) {
        try {
          await disconnect()
        } catch (cause) {
          console.warn(
            `[workbench] stale MCP disconnect failed during re-auth for ${completed.pluginId}:`,
            cause instanceof Error ? cause.message : cause,
          )
        }
      }
      dynamicMcpDisconnectors.set(completed.pluginId, [hot.disconnect])
      if (!hot.statuses.some((row) => row.status === 'connected')) {
        throw new Error(`「${descriptor.name}」已授权，但 MCP 工具热加载失败`)
      }
    }
    const reconcileConnectorAuth = async (connectorId?: string) => {
      const newlyAuthorized = await connectorOAuth.reconcile()
      for (const completed of newlyAuthorized) {
        pendingOAuthHotLoads.set(completed.pluginId, completed)
      }
      for (const [pluginId, completed] of pendingOAuthHotLoads) {
        await hotLoadOAuthConnector(completed)
        pendingOAuthHotLoads.delete(pluginId)
      }
      const cliTransitions = await connectorCliAuth.reconcile(connectorId)
      liveAuthStatuses = await refreshAuthStatuses()
      return cliTransitions
    }
    const revokeConnectorAuth = async (connectorId: string) => {
      const descriptor = plugins.connectorDescriptors.find(
        (candidate) => candidate.id === connectorId,
      )
      if (!descriptor) throw new Error(`未找到连接器：${connectorId}`)

      const pluginId = descriptor.authSummarySource.pluginId
      const resourceId = descriptor.authSummarySource.resourceId
      const resource = manifests
        .find((manifest) => manifest.id === pluginId)
        ?.contributes?.auth?.find(
          (candidate) => candidate.resourceId === resourceId,
        )
      if (!resource) {
        throw new Error(`连接器未声明可撤销的账号资源：${connectorId}`)
      }

      const result = await revokeAuthResource({
        pluginId,
        resource,
        bindingStore,
        secretStore: authStores.secretStore,
      })
      // Hot-reclaim the live MCP transport for the affected plugin so subsequent
      // tool dispatch cannot reuse pre-logout wire credentials (HTTP bearer /
      // stdio child env). If the transport was never hot-loaded (e.g. plugin
      // loaded at boot and not via OAuth hot-load), the boot-time disconnector
      // in plugins.disconnect still owns it and needsSidecarRestart stays true.
      let hotReclaimApplied = false
      try {
        const reclaim = await disconnectMcpPlugin(pluginId, descriptor)
        hotReclaimApplied = reclaim.disconnected
      } catch (cause) {
        // Stay honest: if live disconnect failed, fall back to restart advice.
        console.warn(
          `[workbench] live MCP disconnect failed for ${pluginId}:`,
          cause instanceof Error ? cause.message : cause,
        )
      }
      return {
        message: `已撤销「${descriptor.name}」账号连接`,
        needsSidecarRestart: hotReclaimApplied ? false : result.needsSidecarRestart,
        hotReclaimApplied,
      }
    }

    /**
     * Disconnect the live MCP transport(s) hot-loaded for one plugin and drop
     * their tools/statuses so post-revoke dispatch cannot reuse stale wire
     * credentials. Returns disconnected:false when no live transport exists.
     */
    const disconnectMcpPlugin = async (
      pluginId: string,
      descriptor: ConnectorDescriptor,
    ): Promise<{ disconnected: boolean }> => {
      const disconnectors = dynamicMcpDisconnectors.get(pluginId)
      if (!disconnectors || disconnectors.length === 0) {
        return { disconnected: false }
      }
      for (const disconnect of disconnectors) {
        await disconnect()
      }
      dynamicMcpDisconnectors.delete(pluginId)

      // Remove this connector's tools from the live tool registry.
      const staleNames = new Set(
        expandConnectorToolScope(descriptor, honestyTools),
      )
      if (staleNames.size > 0) {
        const retained = livePluginTools.filter(
          (tool) => !staleNames.has(tool.name),
        )
        livePluginTools.splice(0, livePluginTools.length, ...retained)
        const retainedHonesty = honestyTools.filter(
          (name) => !staleNames.has(name),
        )
        honestyTools.splice(0, honestyTools.length, ...retainedHonesty)
      }

      // Drop MCP status rows owned by this plugin.
      for (let i = liveMcpStatuses.length - 1; i >= 0; i--) {
        if (liveMcpStatuses[i]?.pluginId === pluginId) {
          liveMcpStatuses.splice(i, 1)
        }
      }
      return { disconnected: true }
    }

    let discoverableSkillIds: string[] = []
    try {
      const discovered = await Promise.all(
        plugins.skillsResults
          .filter((result) => result.status === 'seeded')
          .map((result) =>
            listWorkspaceSkillIds(workspaceRoot, result.workspaceDir),
          ),
      )
      discoverableSkillIds = [...new Set(discovered.flat())].sort()
    } catch {
      discoverableSkillIds = []
    }

    return {
      profile,
      agent,
      workspaceRoot,
      tools: honestyTools,
      workspace,
      maxSteps: defaults.maxSteps,
      summarizationEnabled: defaults.summarization !== false,
      memoryKind: defaults.memoryKind,
      mcpStatuses: liveMcpStatuses,
      mcpStatusLine: formatRegistryMcpStatusLine(liveMcpStatuses),
      cliStatuses: plugins.cliStatuses,
      cliStatusLine: formatRegistryCliStatusLine(plugins.cliStatuses),
      authStatuses: plugins.authStatuses,
      authStatusLine: plugins.authStatusLine,
      authDoctorLine: plugins.authDoctorLine,
      discoveryFailures: plugins.discoveryFailures,
      skillRoots,
      enabledPluginIds,
      connectorDescriptors: [...plugins.connectorDescriptors],
      discoverableSkillIds,
      refreshAuthStatuses,
      beginConnectorOAuth,
      beginConnectorCliSession: (connectorId, domains) =>
        connectorCliAuth.begin(connectorId, domains),
      reconcileConnectorAuth,
      revokeConnectorAuth,
      disconnectMcp: async () => {
        await connectorCliAuth.dispose()
        for (const disconnectors of dynamicMcpDisconnectors.values()) {
          for (const disconnect of disconnectors) await disconnect()
        }
        await plugins.disconnect()
      },
    }
  }

  // minimal — DIY tools
  const defaults = await resolveOfficeRuntimeDefaults(profile, env, {
    workspaceRoot,
    maxStepsOverride: options.maxSteps,
  })
  const agent = new Agent({
    id: 'workbench',
    name: 'workbench',
    purpose: '本机最小 Agent Runtime（DIY 工具 · 非远程生产集群）',
    instructions: [
      'You are the local Agent Runtime for UI Lab Agent Workbench.',
      'Respond in Chinese unless the user writes in another language.',
      'You may use read_file, write_file (requires approval), and run_command tools when helpful.',
      'Prefer concise answers. Stay within the workspace tools for file access.',
      'This is a local demo sidecar, not a remote production cluster.',
    ].join(' '),
    model: options.model,
    tools: workbenchTools as (Tool<any, any> | Toolkit)[],
    maxSteps: defaults.maxSteps,
  })

  return {
    profile,
    agent,
    workspaceRoot,
    tools,
    maxSteps: defaults.maxSteps,
    summarizationEnabled: false,
    memoryKind: defaults.memoryKind,
    mcpStatuses: [],
    mcpStatusLine: 'mcp=none',
    cliStatuses: [],
    cliStatusLine: 'cli=none',
    authStatuses: [],
    authStatusLine: 'auth=none',
    authDoctorLine: 'auth=none',
    discoveryFailures: [],
    skillRoots: [],
    enabledPluginIds: [],
    connectorDescriptors: [],
    discoverableSkillIds: [],
    refreshAuthStatuses: async () => [],
    disconnectMcp: async () => {},
  }
}
