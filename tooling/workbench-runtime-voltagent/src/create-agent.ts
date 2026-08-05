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
      toolConfig: officeFilesystemToolConfig(),
    })

    const agent = new Agent({
      id: 'workbench',
      name: 'workbench',
      purpose: '本机办公 Agent Runtime（Workspace FS）',
      instructions: [
        'You are the local Office Agent Runtime for UI Lab Agent Workbench.',
        'Respond in Chinese unless the user writes in another language.',
        'Use Workspace filesystem tools (ls, read_file, write_file, edit_file, …) inside the authorized root.',
        'All file paths must be virtual workspace paths starting with / (e.g. /notes/a.md, /output/report.md).',
        'Never use host absolute paths (/Users/..., /home/..., drive letters). Never paste operator host paths into tools.',
        'Prefer planning briefly, then read before write. Writes and deletes require user approval.',
        'Do not claim to be a remote multi-tenant production cluster — this is a local office sidecar.',
      ].join(' '),
      model: options.model,
      workspace,
      // O1: FS only — no sandbox / search / skills (O3–O5 / later tickets).
      workspaceToolkits: {
        filesystem: {},
        sandbox: false,
        search: false,
        skills: false,
      },
      maxSteps: options.maxSteps ?? Number(env.VOLTAGENT_MAX_STEPS ?? 50),
    })

    return { profile, agent, workspaceRoot, tools, workspace }
  }

  // minimal — DIY tools (M1–M3 baseline)
  const agent = new Agent({
    id: 'workbench',
    name: 'workbench',
    purpose: '本机最小 Agent Runtime（DIY 工具）',
    instructions: [
      'You are the local Agent Runtime for UI Lab Agent Workbench.',
      'Respond in Chinese unless the user writes in another language.',
      'You may use read_file, write_file (requires approval), and run_command tools when helpful.',
      'Prefer concise answers. Stay within the workspace tools for file access.',
      'This is a local demo sidecar, not a remote production cluster.',
    ].join(' '),
    model: options.model,
    tools: workbenchTools as (Tool<any, any> | Toolkit)[],
    maxSteps: options.maxSteps ?? Number(env.VOLTAGENT_MAX_STEPS ?? 12),
  })

  return { profile, agent, workspaceRoot, tools }
}
