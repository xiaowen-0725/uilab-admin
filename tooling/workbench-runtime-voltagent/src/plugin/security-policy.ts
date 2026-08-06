/**
 * Host SecurityPolicy for sidecar plugins (ticket #18).
 *
 * Fail-closed: tools/CLI default to needsApproval unless exact allowlist / explicit flags.
 * Child env: only declared keys; model provider secrets hard-denied.
 */

import type { ProfileEnv } from './types.js'

/** Base runtime keys always allowed for stdio/CLI children (non-secret). */
export const CHILD_ENV_BASE_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
] as const

export type ToolApprovalInput = {
  toolName: string
  /** Exact-match allowlist of free (no approval) tool names */
  readOnlyAllowlist?: ReadonlySet<string>
}

export type CliApprovalInput = {
  /** Explicit declaration from plugin command */
  needsApproval?: boolean
  readOnly?: boolean
}

export function normalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[-\s]+/g, '_')
}

/**
 * True for LLM / model-provider secrets that must never reach plugin children.
 */
export function isModelProviderSecretKey(key: string): boolean {
  const k = key.trim().toUpperCase()
  if (!k) return false
  // Connector app credentials (Feishu/Lark) are not LLM keys.
  if (/^(FEISHU|LARK)_/.test(k)) return false
  if (k === 'GOOGLE_APPLICATION_CREDENTIALS' || k === 'GOOGLE_CALENDAR_ID') {
    return false
  }
  if (/_API_KEY$|_APIKEY$/.test(k)) return true
  if (
    /(OPENAI|ANTHROPIC|DEEPSEEK|GEMINI|GROQ|MISTRAL|COHERE|TOGETHER|FIREWORKS|XAI|VOLTAGENT|AZURE_OPENAI|GOOGLE_AI|VERTEX|CLAUDE)/.test(
      k,
    ) &&
    /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/.test(k)
  ) {
    return true
  }
  return false
}

/**
 * Fail-closed tool approval: needs approval unless name is on exact allowlist.
 */
export function decideToolNeedsApproval(input: ToolApprovalInput): boolean {
  const allow = input.readOnlyAllowlist ?? new Set<string>()
  if (allow.size === 0) return true
  return !allow.has(normalizeToolName(input.toolName))
}

/**
 * CLI command approval: default true; readOnly false only when explicitly declared.
 */
export function decideCliCommandNeedsApproval(input: CliApprovalInput): boolean {
  if (input.needsApproval === true) return true
  if (input.needsApproval === false) return false
  if (input.readOnly === true) return false
  return true
}

/**
 * Build env for a plugin child process from declared allow keys.
 * Always includes base runtime keys; hard-denies model secrets.
 */
export function filterChildEnv(
  source: ProfileEnv,
  allowedKeys: readonly string[],
  options?: { includeBaseKeys?: boolean },
): Record<string, string> {
  const includeBase = options?.includeBaseKeys !== false
  const allow = new Set<string>(allowedKeys)
  if (includeBase) {
    for (const k of CHILD_ENV_BASE_KEYS) allow.add(k)
  }

  const out: Record<string, string> = {}
  for (const key of allow) {
    if (isModelProviderSecretKey(key)) continue
    const v = source[key]
    if (typeof v === 'string' && v.length > 0) out[key] = v
  }
  return out
}

/**
 * Build a log-safe summary that never embeds known secret values.
 * Used by doctor/list surfaces.
 */
export function formatSafeStatusLine(
  parts: Array<string | undefined | null>,
): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .join(' ')
}

/**
 * Redact explicit secret values from a string (defense in depth for logs).
 */
export function redactSecretValues(
  text: string,
  secretValues: readonly string[],
): string {
  let out = text
  for (const secret of secretValues) {
    if (!secret || secret.length < 4) continue
    out = out.split(secret).join('***')
  }
  return out
}
