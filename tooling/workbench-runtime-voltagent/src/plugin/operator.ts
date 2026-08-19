/**
 * Operator list / doctor surface (#24).
 * Human ops only — not an Agent terminal. Reuses Registry + auth; no secret values.
 */

import { sanitizeHint } from './auth-status.js'
import {
  createPluginRegistryFromEnv,
  type CreatePluginRegistryOptions,
  type PluginRegistryLoadResult,
  type PluginRuntimeRecord,
} from './registry.js'
import type { ProfileEnv } from './types.js'

export type { ProfileEnv }

export type PluginListRow = {
  id: string
  name: string
  version: string
  kind: string
  enabled: boolean
  loadStatus: string
  /** Contribution kinds present on the manifest at load time */
  contributes: string[]
  reason?: string
}

export type DoctorFinding = {
  severity: 'ok' | 'info' | 'warn' | 'error'
  pluginId: string
  code: string
  /** Chinese-readable; never contains secrets */
  message: string
}

export type PluginListReport = {
  rows: PluginListRow[]
  text: string
  json: { plugins: PluginListRow[] }
}

export type PluginDoctorReport = {
  findings: DoctorFinding[]
  ok: boolean
  text: string
  json: { ok: boolean; findings: DoctorFinding[] }
}

function contributeSummary(
  rec: PluginRuntimeRecord,
  queryPluginIds: ReadonlySet<string>,
): string[] {
  const tags: string[] = []
  if (rec.mcp.length > 0) tags.push('mcp')
  if (rec.cli.length > 0) tags.push('cli')
  if (rec.skills) tags.push('skills')
  if (rec.auth.length > 0) tags.push('auth')
  if (queryPluginIds.has(rec.id)) tags.push('queries')
  // discovery synthetic rows may have none
  return tags
}

export function toListRows(result: PluginRegistryLoadResult): PluginListRow[] {
  const queryPluginIds = new Set((result.queries ?? []).map((query) => query.pluginId))
  return result.plugins.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    kind: p.kind,
    enabled: p.enabled,
    loadStatus: p.loadStatus,
    contributes: contributeSummary(p, queryPluginIds),
    reason: p.reason ? sanitizeHint(p.reason) : undefined,
  }))
}

export function formatListText(rows: PluginListRow[]): string {
  if (rows.length === 0) return '（无插件）\n'
  const lines = [
    'PLUGIN_ID\tVERSION\tKIND\tENABLED\tSTATUS\tCONTRIBUTES\tNOTE',
    ...rows.map((r) =>
      [
        r.id,
        r.version,
        r.kind,
        r.enabled ? 'yes' : 'no',
        r.loadStatus,
        r.contributes.join('+') || '-',
        r.reason ?? '',
      ].join('\t'),
    ),
  ]
  return `${lines.join('\n')}\n`
}

export function buildListReport(
  result: PluginRegistryLoadResult,
): PluginListReport {
  const rows = toListRows(result)
  return {
    rows,
    text: formatListText(rows),
    json: { plugins: rows },
  }
}

function pushFinding(
  findings: DoctorFinding[],
  secrets: string[],
  severity: DoctorFinding['severity'],
  pluginId: string,
  code: string,
  message: string,
  /** When true, redact secret-shaped substrings (default false for static ok copy). */
  scrub = false,
): void {
  findings.push({
    severity,
    pluginId,
    code,
    message: scrub ? sanitizeHint(message, secrets) : message,
  })
}

function authHintSuffix(hint: string | undefined): string {
  return hint ? ` · ${hint}` : ''
}

/**
 * Collect doctor findings from a loaded registry result.
 * Never includes secret material.
 */
export function collectDoctorFindings(
  result: PluginRegistryLoadResult,
  options?: { secretValues?: string[] },
): DoctorFinding[] {
  const findings: DoctorFinding[] = []
  const secrets = options?.secretValues ?? []
  const add = (
    severity: DoctorFinding['severity'],
    pluginId: string,
    code: string,
    message: string,
    scrub = false,
  ) => pushFinding(findings, secrets, severity, pluginId, code, message, scrub)

  for (const f of result.discoveryFailures) {
    add(
      'error',
      f.id,
      'discovery_failed',
      `${f.reason}（${f.sourcePath}）`,
      true,
    )
  }

  for (const p of result.plugins) {
    if (p.loadStatus === 'failed' && p.enabled) {
      add('error', p.id, 'load_failed', p.reason ?? '插件加载失败', true)
    }

    for (const m of p.mcp) {
      if (m.status === 'failed') {
        add(
          'error',
          p.id,
          'mcp_failed',
          `MCP ${m.serverId} 连接失败：${m.reason ?? 'unknown'}`,
          true,
        )
      } else if (m.status === 'disabled' && p.enabled) {
        add(
          'info',
          p.id,
          'mcp_disabled',
          `MCP ${m.serverId} 未配置（需 MCP_*_URL 或 MCP_*_COMMAND）`,
        )
      } else if (m.status === 'connected') {
        add(
          'ok',
          p.id,
          'mcp_connected',
          `MCP ${m.serverId} 已连接（${m.toolNames.length} tools）`,
        )
      }
    }

    for (const c of p.cli) {
      if (c.status === 'missing') {
        add(
          'warn',
          p.id,
          'cli_missing',
          c.reason ?? `领域 CLI ${c.cliId} 可执行文件未找到`,
          true,
        )
      } else if (c.status === 'failed') {
        add(
          'error',
          p.id,
          'cli_failed',
          c.reason ?? `领域 CLI ${c.cliId} 失败`,
          true,
        )
      } else if (c.status === 'ready') {
        add(
          'ok',
          p.id,
          'cli_ready',
          `领域 CLI ${c.cliId} 就绪（${c.toolNames.length} tools）`,
        )
      }
    }

    if (p.skills?.status === 'failed') {
      add('error', p.id, 'skills_failed', p.skills.reason ?? 'Skills seed 失败', true)
    } else if (p.skills?.status === 'seeded' && p.skills.seededSkillIds.length > 0) {
      add(
        'ok',
        p.id,
        'skills_seeded',
        `Skills 已 seed：${p.skills.seededSkillIds.join(',')}`,
      )
    }

    for (const a of p.auth) {
      const label = `auth ${a.resourceId}`
      if (a.status === 'missing') {
        add(
          a.pluginEnabled ? 'warn' : 'info',
          p.id,
          'auth_missing',
          `${label}=missing${authHintSuffix(a.hint)}`,
          true,
        )
      } else if (a.status === 'error') {
        add(
          'error',
          p.id,
          'auth_error',
          `${label}=error${authHintSuffix(a.hint)}`,
          true,
        )
      } else if (a.status === 'connected') {
        add('ok', p.id, 'auth_connected', `${label}=connected`)
      } else if (a.status === 'none_required') {
        add('ok', p.id, 'auth_none_required', `${label}=none_required`)
      } else if (a.status === 'expired') {
        add(
          'warn',
          p.id,
          'auth_expired',
          `${label}=expired${authHintSuffix(a.hint)}`,
          true,
        )
      }
    }
  }

  if (findings.length === 0) {
    add('ok', '*', 'healthy', '未发现插件问题')
  }

  return findings
}

export function formatDoctorText(findings: DoctorFinding[]): string {
  const lines = findings.map((f) => {
    const tag = f.severity.toUpperCase().padEnd(5)
    return `${tag}\t${f.pluginId}\t${f.code}\t${f.message}`
  })
  return `${lines.join('\n')}\n`
}

/** Collect non-empty env values that look like secrets for doctor redaction. */
export function collectEnvSecretValues(
  env: ProfileEnv = process.env,
): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string' || v.length < 8) continue
    if (
      /KEY|TOKEN|SECRET|PASSWORD|BEARER|CREDENTIAL/i.test(k) ||
      /^(sk-|ghp_|xox)/i.test(v)
    ) {
      out.push(v)
    }
  }
  return out
}

export function buildDoctorReport(
  result: PluginRegistryLoadResult,
  options?: { env?: ProfileEnv },
): PluginDoctorReport {
  const secretValues = collectEnvSecretValues(options?.env)
  const findings = collectDoctorFindings(result, { secretValues })
  const ok = !findings.some(
    (f) => f.severity === 'error' || f.severity === 'warn',
  )
  return {
    findings,
    ok,
    text: formatDoctorText(findings),
    json: { ok, findings },
  }
}

export type RunOperatorOptions = CreatePluginRegistryOptions & {
  env?: ProfileEnv
  workspaceRoot?: string
  pluginPaths?: string[]
}

async function loadRegistryOnce(options: RunOperatorOptions) {
  const registry = await createPluginRegistryFromEnv(options)
  return registry.load({ workspaceRoot: options.workspaceRoot })
}

/** Load registry once and build list report (operator entry). */
export async function runPluginList(
  options: RunOperatorOptions = {},
): Promise<PluginListReport & { disconnect: () => Promise<void> }> {
  const result = await loadRegistryOnce(options)
  return { ...buildListReport(result), disconnect: result.disconnect }
}

/** Load registry once and build doctor report (operator entry). */
export async function runPluginDoctor(
  options: RunOperatorOptions = {},
): Promise<PluginDoctorReport & { disconnect: () => Promise<void> }> {
  const result = await loadRegistryOnce(options)
  return {
    ...buildDoctorReport(result, { env: options.env }),
    disconnect: result.disconnect,
  }
}
