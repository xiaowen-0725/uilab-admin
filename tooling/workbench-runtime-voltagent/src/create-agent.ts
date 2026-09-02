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
  formatRegistryCliStatusLine,
  formatRegistryMcpStatusLine,
  listWorkspaceSkillIds,
  type CliLoadStatus,
  type CreatePluginRegistryOptions,
  type McpServerLoadStatus,
  type PluginDiscoveryFailure,
} from './plugin/index.js'
import {
  type AgentProfile,
  resolveWorkspaceRoot,
  toolsForProfile,
} from './profile.js'
import { askUserQuestionTool } from './ask-user-question-tool.js'
import { assembleTurnTools } from './tools/board-agent-contract.js'
import { buildWorkbenchSystemPrompt } from './system-prompt.js'
import {
  getSharedBoardRuntime,
  productIdentityFromEnv,
} from './tools/board-runtime.js'
import { getSharedInteractiveArtifactRuntime } from './tools/interactive-artifact-runtime.js'
import { workbenchTools } from './tools.js'
import { updatePlanTool } from './update-plan-tool.js'
import { ensureOfficeWorkspace } from './workspace-root.js'
import { readCapabilityTurnContext } from './capability/turn-context.js'
import type { CliAuthProcessRunner } from './capability/connector-cli-auth.js'
import type { ConnectorOAuthFetch } from './capability/connector-oauth.js'
import {
  createEmptyOfficeConnectorRuntime,
  createOfficeConnectorRuntime,
  type OfficeConnectorRuntime,
} from './capability/office-connector-runtime.js'
import { createOfficeWorkspaceSandbox } from './runtime-shell/office-workspace-sandbox.js'
import type { ConnectorCommandAccess } from './runtime-shell/connector-aware-sandbox.js'

const planToolkit: Toolkit = { name: 'update_plan', tools: [updatePlanTool] }
const askToolkit: Toolkit = {
  name: 'ask_user_question',
  tools: [askUserQuestionTool],
}

function boardToolkit(env?: NodeJS.ProcessEnv): Toolkit {
  return {
    name: 'board',
    tools: getSharedBoardRuntime({ env }).toolList,
  }
}

function interactiveToolkit(env?: NodeJS.ProcessEnv): Toolkit {
  return {
    name: 'interactive-artifact',
    tools: getSharedInteractiveArtifactRuntime({ env }).toolList,
  }
}

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
  /** Boot-time tool names retained for operator logs and minimal-profile compatibility. */
  tools: readonly string[]
  connectorRuntime: OfficeConnectorRuntime
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
  authStatusLine: string
  authDoctorLine: string
  discoveryFailures: PluginDiscoveryFailure[]
  /** Virtual skill roots mounted on Workspace (office). */
  skillRoots: string[]
  /** Workspace skill folder ids discoverable after seed (office). */
  discoverableSkillIds: string[]
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
    const manifests = registry.listManifests()
    const plugins = await registry.load({ workspaceRoot })
    const boardRuntime = getSharedBoardRuntime({ env })
    const identity = productIdentityFromEnv(env)
    boardRuntime.attachQueries({
      catalog: registry.listQueryCatalog(),
      handlers: registry.listQueryHandlers(),
      identity,
    })
    boardRuntime.attachPresets({
      boards: registry.listPresetBoards(),
      identity,
    })

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
    const connectorRuntime = createOfficeConnectorRuntime({
      env,
      registry,
      plugins,
      manifests,
      baseToolNames: tools,
      oauthFetch: options.oauthFetch,
      cliRunner: options.cliRunner,
      cliAuthProcessRunner: options.cliAuthProcessRunner,
    })
    const workspaceSandbox =
      options.workspaceSandbox ??
      (await createOfficeWorkspaceSandbox({
        workspaceRoot,
        env,
        connectors: plugins.connectorDescriptors,
        manifests,
        resolveConnectorAccess: async (
          connectorId,
          turnContext,
        ): Promise<ConnectorCommandAccess> => {
          const result = await connectorRuntime.execute({
            kind: 'check-command-access',
            connectorId,
            turnContext,
          })
          if (result.kind !== 'command-access-checked') {
            return { allowed: false as const, reason: 'runtime_result_mismatch' }
          }
          return result.access
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
          'Office skills live under /skills (meeting-notes, weekly-report, research-brief, board-widget).',
          `Provider-installed Skills may be synchronized under these manifest-declared roots: ${skillRoots.join(', ')}. Search and read the matching package instead of inventing Provider CLI commands.`,
          'When a request matches a skill: workspace_list_skills or workspace_search_skills → workspace_activate_skill → workspace_read_skill → follow SKILL.md → write deliverable under the skill output path.',
          'Deliverable paths: /output/meeting-notes/, /output/weekly-report/, /output/research-brief/.',
        ].join(' ')
      : 'Office skills plugins are not enabled in this session; do not invent skill toolkits.'

    const agent = new Agent({
      id: 'workbench',
      name: 'workbench',
      purpose:
        '本机办公 Agent Runtime（Workspace FS + Skills + 可选 MCP · 非远程生产集群）',
      instructions: buildWorkbenchSystemPrompt({
        profile,
        workspaceRoot,
        env,
        skillInstruction,
        mcpInstruction,
      }),
      model: options.model,
      toolkits: [planToolkit, askToolkit, interactiveToolkit(env)],
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
        return assembleTurnTools({
          connectorTools: connectorRuntime.toolsFor(turnContext),
          resolveBoardTools: () => boardToolkit(env).tools,
          selectedFeatureIds: turnContext.selectedFeatureIds,
        }) as Tool<any, any>[]
      },
      maxSteps: defaults.maxSteps,
      summarization: defaults.summarization,
      memory: defaults.memory,
    })

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
      connectorRuntime,
      tools: honestyTools,
      workspace,
      maxSteps: defaults.maxSteps,
      summarizationEnabled: defaults.summarization !== false,
      memoryKind: defaults.memoryKind,
      mcpStatuses: plugins.mcpStatuses,
      mcpStatusLine: formatRegistryMcpStatusLine(plugins.mcpStatuses),
      cliStatuses: plugins.cliStatuses,
      cliStatusLine: formatRegistryCliStatusLine(plugins.cliStatuses),
      authStatusLine: plugins.authStatusLine,
      authDoctorLine: plugins.authDoctorLine,
      discoveryFailures: plugins.discoveryFailures,
      skillRoots,
      discoverableSkillIds,
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
    instructions: buildWorkbenchSystemPrompt({
      profile,
      workspaceRoot,
      env,
    }),
    model: options.model,
    toolkits: [planToolkit, interactiveToolkit(env)],
    tools: ({ context }) => {
      const turnContext = readCapabilityTurnContext({ context })
      return assembleTurnTools({
        connectorTools: workbenchTools as Tool<any, any>[],
        resolveBoardTools: () => boardToolkit(env).tools,
        selectedFeatureIds: turnContext.selectedFeatureIds,
      }) as Tool<any, any>[]
    },
    maxSteps: defaults.maxSteps,
  })

  return {
    profile,
    agent,
    workspaceRoot,
    connectorRuntime: createEmptyOfficeConnectorRuntime(tools),
    tools,
    maxSteps: defaults.maxSteps,
    summarizationEnabled: false,
    memoryKind: defaults.memoryKind,
    mcpStatuses: [],
    mcpStatusLine: 'mcp=none',
    cliStatuses: [],
    cliStatusLine: 'cli=none',
    authStatusLine: 'auth=none',
    authDoctorLine: 'auth=none',
    discoveryFailures: [],
    skillRoots: [],
    discoverableSkillIds: [],
  }
}
