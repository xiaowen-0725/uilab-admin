/**
 * Build the Workbench sidecar Agent for the selected profile.
 * Office → Agent + Workspace (Node FS, write/delete need approval).
 * Minimal → plain Agent + DIY tools (legacy M3).
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
  type McpConnectorStatus,
  formatMcpStatusLine,
  loadOfficeMcpTools,
} from './office-mcp.js'
import {
  OFFICE_SKILLS_VIRTUAL_ROOT,
  ensureOfficeSkills,
} from './office-skills.js'
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
  /** O4 MCP connector statuses (office only; empty for minimal). */
  mcpStatuses: McpConnectorStatus[]
  mcpStatusLine: string
  disconnectMcp: () => Promise<void>
}

/**
 * Filesystem tool policies: reads free; write/edit/delete/rmdir need approval.
 */
export function officeFilesystemToolConfig() {
  return {
    filesystem: {
      // Fail closed for mutators; explicit reads stay free.
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
    // O2: create safe default root + first-run README when missing.
    await ensureOfficeWorkspace(workspaceRoot)
    // O3: seed bundled skills + conventional output dirs.
    await ensureOfficeSkills(workspaceRoot)

    // O5: long-run defaults (maxSteps / summarization / memory).
    const defaults = await resolveOfficeRuntimeDefaults(profile, env, {
      workspaceRoot,
      maxStepsOverride: options.maxSteps,
    })

    // O4: optional docs + calendar MCP (env-gated; degrade on failure).
    const mcp = await loadOfficeMcpTools(env)
    const honestyTools = [...tools, ...mcp.toolNames]

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
        rootPaths: [OFFICE_SKILLS_VIRTUAL_ROOT],
        autoDiscover: true,
      },
      toolConfig: officeFilesystemToolConfig(),
    })

    const mcpInstruction =
      mcp.toolNames.length > 0
        ? [
            'Optional MCP tools may be available for docs/knowledge and calendar (names as listed in tools).',
            'Prefer read-only MCP tools; write/update/delete MCP tools require user approval.',
            'If MCP is unavailable, continue with local Workspace FS and skills only — do not invent cloud content.',
          ].join(' ')
        : 'MCP docs/calendar connectors are not connected in this session; use local Workspace FS and skills only.'

    const agent = new Agent({
      id: 'workbench',
      name: 'workbench',
      purpose: '本机办公 Agent Runtime（Workspace FS + Skills + 可选 MCP · 非远程生产集群）',
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
      // MCP tools only when connected — never invent unavailable cloud tools.
      ...(mcp.tools.length > 0
        ? { tools: mcp.tools as (Tool<any, any> | Toolkit)[] }
        : {}),
      maxSteps: defaults.maxSteps,
      summarization: defaults.summarization,
      // false = stateless; Memory instance = multi-turn (conversationId = taskId).
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
      mcpStatuses: mcp.statuses,
      mcpStatusLine: formatMcpStatusLine(mcp.statuses),
      disconnectMcp: mcp.disconnect,
    }
  }

  // minimal — DIY tools (M1–M3 baseline)
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
    mcpStatusLine: 'docs=off,calendar=off',
    disconnectMcp: async () => {},
  }
}
