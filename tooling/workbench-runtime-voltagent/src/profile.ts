/**
 * Agent profile selection for the local Workbench VoltAgent sidecar.
 *
 * - minimal: plain Agent + DIY read/write tools (M1–M3 baseline)
 * - office: Agent + Workspace Node FS + Skills (O1–O3)
 *
 * Not a multi-tenant production Runtime.
 */

import os from 'node:os'
import path from 'node:path'
import { OFFICE_SKILL_TOOL_NAMES } from './office-skills.js'

export type AgentProfile = 'office' | 'minimal'

export type ProfileEnv = Record<string, string | undefined>

/**
 * Resolve profile from env.
 * Default remains `minimal` so CI / offline demos keep DIY tools unless opt-in.
 */
export function resolveAgentProfile(env: ProfileEnv = process.env): AgentProfile {
  const raw = String(
    env.AGENT_PROFILE ?? env.VOLTAGENT_AGENT_PROFILE ?? 'minimal',
  )
    .trim()
    .toLowerCase()
  if (raw === 'office' || raw === 'cowork') return 'office'
  return 'minimal'
}

/**
 * Workspace root for FS tools (Office Profile O2 productization).
 * Explicit WORKSPACE_ROOT always wins.
 * Office without config uses a safe default under the user home
 * (`~/VoltAgent-Office/workspace` — not home itself, not monorepo root).
 * First-run mkdir + README lives in ensureOfficeWorkspace (workspace-root.ts).
 * Minimal without config keeps the historical monorepo-relative default.
 */
export function resolveWorkspaceRoot(
  env: ProfileEnv = process.env,
  profile: AgentProfile = resolveAgentProfile(env),
  options?: { cwd?: string; homeDir?: string },
): string {
  const explicit = env.WORKSPACE_ROOT?.trim()
  if (explicit) return path.resolve(explicit)

  if (profile === 'office') {
    const home = options?.homeDir ?? os.homedir()
    return path.join(home, 'VoltAgent-Office', 'workspace')
  }

  const cwd = options?.cwd ?? process.cwd()
  return path.resolve(cwd, '../../')
}

/** Tool names exposed by the Office Workspace FS toolkit (subset listed for honesty). */
export const OFFICE_FS_TOOL_NAMES = [
  'ls',
  'read_file',
  'write_file',
  'edit_file',
  'delete_file',
  'stat',
  'mkdir',
  'rmdir',
  'list_tree',
  'list_files',
  'glob',
  'grep',
] as const

export { OFFICE_SKILL_TOOL_NAMES }

export const MINIMAL_TOOL_NAMES = [
  'read_file',
  'write_file',
  'run_command',
] as const

/** Office honesty list: FS tools + skills toolkit (no DIY run_command). */
export const OFFICE_TOOL_NAMES = [
  ...OFFICE_FS_TOOL_NAMES,
  ...OFFICE_SKILL_TOOL_NAMES,
] as const

export function toolsForProfile(profile: AgentProfile): readonly string[] {
  return profile === 'office' ? OFFICE_TOOL_NAMES : MINIMAL_TOOL_NAMES
}
