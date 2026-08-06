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
} from '@voltagent/core'
import type { LanguageModel } from 'ai'
import {
  type MemoryKind,
  resolveOfficeRuntimeDefaults,
} from './office-runtime-defaults.js'
import {
  createPluginRegistry,
  formatRegistryCliStatusLine,
  formatRegistryMcpStatusLine,
  type CliLoadStatus,
  type CreatePluginRegistryOptions,
  type McpServerLoadStatus,
  type PluginAuthStatus,
} from './plugin/index.js'
import {
  type AgentProfile,
  resolveWorkspaceRoot,
  toolsForProfile,
} from './profile.js'
import { workbenchTools } from './tools.js'
import { ensureOfficeWorkspace } from './workspace-root.js'

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
  /** Virtual skill roots mounted on Workspace (office). */
  skillRoots: string[]
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

    // Single PluginRegistry load: skills + MCP + domain CLI.
    const registry = createPluginRegistry({
      env,
      host: options.mcpHost,
      cliRunner: options.cliRunner,
    })
    const plugins = await registry.load({ workspaceRoot })

    // Skills seed is required for office; path/symlink failures must not soft-pass.
    for (const skill of plugins.skillsResults) {
      if (skill.status === 'failed') {
        throw new Error(
          skill.reason ?? `插件 Skills 加载失败：${skill.pluginId}`,
        )
      }
    }

    const skillRoots =
      plugins.skillRoots.length > 0 ? plugins.skillRoots : ['/skills']
    const honestyTools = [...tools, ...plugins.toolNames]

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
      skills: {
        rootPaths: skillRoots,
        autoDiscover: true,
      },
      toolConfig: officeFilesystemToolConfig(),
    })

    const mcpInstruction =
      plugins.toolNames.length > 0
        ? [
            'Optional MCP tools may be available for docs/knowledge and calendar (names as listed in tools).',
            'Prefer read-only MCP tools; write/update/delete MCP tools require user approval.',
            'If MCP is unavailable, continue with local Workspace FS and skills only — do not invent cloud content.',
          ].join(' ')
        : 'MCP docs/calendar connectors are not connected in this session; use local Workspace FS and skills only.'

    const agent = new Agent({
      id: 'workbench',
      name: 'workbench',
      purpose:
        '本机办公 Agent Runtime（Workspace FS + Skills + 可选 MCP · 非远程生产集群）',
      instructions: [
        'You are the local Office Agent Runtime for UI Lab Agent Workbench.',
        'Respond in Chinese unless the user writes in another language.',
        'Use Workspace filesystem tools (ls, read_file, write_file, edit_file, …) inside the authorized root.',
        'Office skills live under /skills (meeting-notes, weekly-report, research-brief).',
        'When a request matches a skill: workspace_list_skills or workspace_search_skills → workspace_activate_skill → workspace_read_skill → follow SKILL.md → write deliverable under the skill output path.',
        'Deliverable paths: /output/meeting-notes/, /output/weekly-report/, /output/research-brief/.',
        mcpInstruction,
        'All file paths must be virtual workspace paths starting with / (e.g. /notes/a.md, /output/meeting-notes/notes.md).',
        'Never use host absolute paths (/Users/..., /home/..., drive letters). Never paste operator host paths into tools.',
        'Prefer planning briefly, then read before write. Writes and deletes require user approval.',
        'Do not claim to be a remote multi-tenant production cluster — this is a local office sidecar.',
      ].join(' '),
      model: options.model,
      workspace,
      workspaceToolkits: {
        filesystem: {},
        sandbox: false,
        search: false,
        skills: {},
      },
      workspaceSkillsPrompt: {
        includeAvailable: true,
        includeActivated: true,
        maxAvailable: 10,
        maxActivated: 5,
      },
      ...(plugins.tools.length > 0
        ? { tools: plugins.tools as (Tool<any, any> | Toolkit)[] }
        : {}),
      maxSteps: defaults.maxSteps,
      summarization: defaults.summarization,
      memory: defaults.memory,
    })

    return {
      profile,
      agent,
      workspaceRoot,
      tools: honestyTools,
      workspace,
      maxSteps: defaults.maxSteps,
      summarizationEnabled: defaults.summarization !== false,
      memoryKind: defaults.memoryKind,
      mcpStatuses: plugins.mcpStatuses,
      mcpStatusLine: formatRegistryMcpStatusLine(plugins.mcpStatuses),
      cliStatuses: plugins.cliStatuses,
      cliStatusLine: formatRegistryCliStatusLine(plugins.cliStatuses),
      authStatuses: plugins.authStatuses,
      authStatusLine: plugins.authStatusLine,
      authDoctorLine: plugins.authDoctorLine,
      skillRoots,
      disconnectMcp: plugins.disconnect,
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
    skillRoots: [],
    disconnectMcp: async () => {},
  }
}
