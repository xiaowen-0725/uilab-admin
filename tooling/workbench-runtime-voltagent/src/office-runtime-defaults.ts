/**
 * Office Profile O5 — long-run defaults (maxSteps, summarization, memory).
 *
 * Honesty: local sidecar only; not a remote multi-tenant production Runtime.
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  InMemoryStorageAdapter,
  Memory,
  type AgentSummarizationOptions,
} from '@voltagent/core'
import { LibSQLMemoryAdapter } from '@voltagent/libsql'
import type { AgentProfile, ProfileEnv } from './profile.js'

/** Spec O5 recommended band is 80–100; default mid of that band. */
export const DEFAULT_OFFICE_MAX_STEPS = 80

/** Minimal / DIY profile keeps a short demo budget. */
export const DEFAULT_MINIMAL_MAX_STEPS = 12

export type MemoryKind = 'in-memory' | 'libsql' | 'disabled'

export type ResolvedOfficeRuntimeDefaults = {
  maxSteps: number
  summarization: AgentSummarizationOptions | false
  memory: Memory | false
  memoryKind: MemoryKind
}

/**
 * Resolve maxSteps: explicit override → env VOLTAGENT_MAX_STEPS → profile default.
 */
export function resolveMaxSteps(
  profile: AgentProfile,
  env: ProfileEnv = process.env,
  override?: number,
): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override)
  }
  const raw = env.VOLTAGENT_MAX_STEPS?.trim()
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return profile === 'office' ? DEFAULT_OFFICE_MAX_STEPS : DEFAULT_MINIMAL_MAX_STEPS
}

/**
 * Office summarization defaults — enabled, not demo-low token triggers.
 * Disable with VOLTAGENT_SUMMARIZATION=false|off|0.
 */
export function resolveSummarization(
  profile: AgentProfile,
  env: ProfileEnv = process.env,
): AgentSummarizationOptions | false {
  if (profile !== 'office') return false
  const flag = (env.VOLTAGENT_SUMMARIZATION ?? 'true').trim().toLowerCase()
  if (flag === 'false' || flag === 'off' || flag === '0') return false

  const triggerTokens = Number(env.VOLTAGENT_SUMMARIZATION_TRIGGER_TOKENS ?? 80_000)
  return {
    enabled: true,
    triggerTokens:
      Number.isFinite(triggerTokens) && triggerTokens > 0 ? triggerTokens : 80_000,
    keepMessages: 12,
    maxOutputTokens: 1000,
    systemPrompt:
      '用中文简要总结对话目标、已完成步骤、待办、关键文件路径与未决问题，供后续工具步骤继续。不要编造未出现的事实。',
  }
}

/**
 * Conversation memory for multi-turn (conversationId = taskId on adapter).
 * - office default: LibSQL file under workspace `.voltagent/memory.db` (SHOULD)
 * - VOLTAGENT_MEMORY=memory|in-memory → InMemory
 * - VOLTAGENT_MEMORY=false|off → disabled (stateless)
 * - VOLTAGENT_MEMORY_URL overrides LibSQL URL
 */
export async function resolveAgentMemory(
  profile: AgentProfile,
  env: ProfileEnv = process.env,
  workspaceRoot?: string,
): Promise<{ memory: Memory | false; memoryKind: MemoryKind }> {
  if (profile !== 'office') {
    // minimal: framework default in-memory is fine; keep DIY simple.
    return { memory: false, memoryKind: 'disabled' }
  }

  const mode = (env.VOLTAGENT_MEMORY ?? 'libsql').trim().toLowerCase()
  if (mode === 'false' || mode === 'off' || mode === '0' || mode === 'none') {
    return { memory: false, memoryKind: 'disabled' }
  }

  if (mode === 'memory' || mode === 'in-memory' || mode === 'inmemory') {
    return {
      memory: new Memory({ storage: new InMemoryStorageAdapter() }),
      memoryKind: 'in-memory',
    }
  }

  // libsql (default for office)
  const root = workspaceRoot ? path.resolve(workspaceRoot) : process.cwd()
  const defaultFile = path.join(root, '.voltagent', 'memory.db')
  await mkdir(path.dirname(defaultFile), { recursive: true })
  const url =
    env.VOLTAGENT_MEMORY_URL?.trim() ||
    `file:${defaultFile}`

  return {
    memory: new Memory({
      storage: new LibSQLMemoryAdapter({ url }),
    }),
    memoryKind: 'libsql',
  }
}

export async function resolveOfficeRuntimeDefaults(
  profile: AgentProfile,
  env: ProfileEnv = process.env,
  options?: { workspaceRoot?: string; maxStepsOverride?: number },
): Promise<ResolvedOfficeRuntimeDefaults> {
  const maxSteps = resolveMaxSteps(profile, env, options?.maxStepsOverride)
  const summarization = resolveSummarization(profile, env)
  const { memory, memoryKind } = await resolveAgentMemory(
    profile,
    env,
    options?.workspaceRoot,
  )
  return { maxSteps, summarization, memory, memoryKind }
}
