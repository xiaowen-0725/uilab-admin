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

function contributeSummary(rec: PluginRuntimeRecord): string[] {
  const tags: string[] = []
  if (rec.mcp.length > 0) tags.push('mcp')
  if (rec.cli.length > 0) tags.push('cli')
  if (rec.skills) tags.push('skills')
  if (rec.auth.length > 0) tags.push('auth')
  // discovery synthetic rows may have none
  return tags
}

export function toListRows(result: PluginRegistryLoadResult): PluginListRow[] {
  return result.plugins.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    kind: p.kind,
    enabled: p.enabled,
    loadStatus: p.loadStatus,
    contributes: contributeSummary(p),
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

  for (const f of result.discoveryFailures) {
    findings.push({
      severity: 'error',
      pluginId: f.id,
      code: 'discovery_failed',
      message: sanitizeHint(`${f.reason}（${f.sourcePath}）`, secrets),
    })
  }

  for (const p of result.plugins) {
    if (p.loadStatus === 'failed' && p.enabled) {
      findings.push({
        severity: 'error',
        pluginId: p.id,
        code: 'load_failed',
        message: sanitizeHint(p.reason ?? '插件加载失败', secrets),
      })
    }

    for (const m of p.mcp) {
      if (m.status === 'failed') {
        findings.push({
          severity: 'error',
          pluginId: p.id,
          code: 'mcp_failed',
          message: sanitizeHint(
            `MCP ${m.serverId} 连接失败：${m.reason ?? 'unknown'}`,
            secrets,
          ),
        })
      } else if (m.status === 'disabled' && p.enabled) {
        findings.push({
          severity: 'info',
          pluginId: p.id,
          code: 'mcp_disabled',
          message: `MCP ${m.serverId} 未配置（需 MCP_*_URL 或 MCP_*_COMMAND）`,
        })
      } else if (m.status === 'connected') {
        findings.push({
          severity: 'ok',
          pluginId: p.id,
          code: 'mcp_connected',
          message: `MCP ${m.serverId} 已连接（${m.toolNames.length} tools）`,
        })
      }
    }

    for (const c of p.cli) {
      if (c.status === 'missing') {
        findings.push({
          severity: 'warn',
          pluginId: p.id,
          code: 'cli_missing',
          message: sanitizeHint(
            c.reason ?? `领域 CLI ${c.cliId} 可执行文件未找到`,
            secrets,
          ),
        })
      } else if (c.status === 'failed') {
        findings.push({
          severity: 'error',
          pluginId: p.id,
          code: 'cli_failed',
          message: sanitizeHint(
            c.reason ?? `领域 CLI ${c.cliId} 失败`,
            secrets,
          ),
        })
      } else if (c.status === 'ready') {
        findings.push({
          severity: 'ok',
          pluginId: p.id,
          code: 'cli_ready',
          message: `领域 CLI ${c.cliId} 就绪（${c.toolNames.length} tools）`,
        })
      }
    }

    if (p.skills?.status === 'failed') {
      findings.push({
        severity: 'error',
        pluginId: p.id,
        code: 'skills_failed',
        message: sanitizeHint(p.skills.reason ?? 'Skills seed 失败', secrets),
      })
    } else if (p.skills?.status === 'seeded' && p.skills.seededSkillIds.length > 0) {
      findings.push({
        severity: 'ok',
        pluginId: p.id,
        code: 'skills_seeded',
        message: `Skills 已 seed：${p.skills.seededSkillIds.join(',')}`,
      })
    }

    for (const a of p.auth) {
      if (a.status === 'missing') {
        findings.push({
          severity: a.pluginEnabled ? 'warn' : 'info',
          pluginId: p.id,
          code: 'auth_missing',
          message: sanitizeHint(
            `auth ${a.resourceId}=missing${a.hint ? ` · ${a.hint}` : ''}`,
            secrets,
          ),
        })
      } else if (a.status === 'error') {
        findings.push({
          severity: 'error',
          pluginId: p.id,
          code: 'auth_error',
          message: sanitizeHint(
            `auth ${a.resourceId}=error${a.hint ? ` · ${a.hint}` : ''}`,
            secrets,
          ),
        })
      } else if (a.status === 'connected') {
        findings.push({
          severity: 'ok',
          pluginId: p.id,
          code: 'auth_connected',
          message: `auth ${a.resourceId}=connected`,
        })
      } else if (a.status === 'none_required') {
        findings.push({
          severity: 'ok',
          pluginId: p.id,
          code: 'auth_none_required',
          message: `auth ${a.resourceId}=none_required`,
        })
      } else if (a.status === 'expired') {
        findings.push({
          severity: 'warn',
          pluginId: p.id,
          code: 'auth_expired',
          message: sanitizeHint(
            `auth ${a.resourceId}=expired${a.hint ? ` · ${a.hint}` : ''}`,
            secrets,
          ),
        })
      }
    }
  }

  if (findings.length === 0) {
    findings.push({
      severity: 'ok',
      pluginId: '*',
      code: 'healthy',
      message: '未发现插件问题',
    })
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

/**
 * Load registry once and build list report (operator entry).
 */
export async function runPluginList(
  options: RunOperatorOptions = {},
): Promise<PluginListReport & { disconnect: () => Promise<void> }> {
  const registry = await createPluginRegistryFromEnv(options)
  const result = await registry.load({
    workspaceRoot: options.workspaceRoot,
  })
  const report = buildListReport(result)
  return { ...report, disconnect: result.disconnect }
}

/**
 * Load registry once and build doctor report (operator entry).
 */
export async function runPluginDoctor(
  options: RunOperatorOptions = {},
): Promise<PluginDoctorReport & { disconnect: () => Promise<void> }> {
  const registry = await createPluginRegistryFromEnv(options)
  const result = await registry.load({
    workspaceRoot: options.workspaceRoot,
  })
  const report = buildDoctorReport(result, { env: options.env })
  return { ...report, disconnect: result.disconnect }
}
