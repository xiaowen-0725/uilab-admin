/**
 * Plugin auth status resolution (#22).
 * Enable ≠ login: plugin may be enabled while auth=missing.
 * Doctor/list summaries never embed secret values.
 */

import type { CliRunner } from './cli-loader.js'
import type { AuthResourceContribution } from './manifest.js'
import { firstEnv } from './parse-util.js'
import {
  createEnvSecretStore,
  resolveAuthStatus,
  type AuthBindingStore,
  type SecretStore,
} from './secret-store.js'
import { formatSafeStatusLine, redactSecretValues } from './security-policy.js'
import type {
  AuthBinding,
  AuthStatus,
  AuthStatusResult,
  ProfileEnv,
} from './types.js'

export type PluginAuthStatus = {
  pluginId: string
  resourceId: string
  kind: AuthBinding['kind']
  /** Whether the owning plugin is enabled in the registry */
  pluginEnabled: boolean
  status: AuthStatus
  /** Chinese-friendly, never contains secret material */
  hint?: string
}

export type ResolvePluginAuthOptions = {
  env?: ProfileEnv
  store?: SecretStore
  /** Overrides / user bindings; cleared → fall back to manifest declaration */
  bindingStore?: AuthBindingStore
  /** For cli_session statusCommand probe */
  runner?: CliRunner
}

export function authResourceToBinding(
  pluginId: string,
  resource: AuthResourceContribution,
  env: ProfileEnv = process.env,
): AuthBinding {
  const statusCmd = resource.statusCommand
  const command = statusCmd
    ? (firstEnv(env, statusCmd.commandFromEnv) ??
        statusCmd.command?.trim() ??
        '')
    : ''
  // ANY of envNames present counts as connected (bearer aliases)
  return {
    pluginId,
    resourceId: resource.resourceId,
    kind: resource.kind,
    envNames: resource.envNames,
    secretRef: resource.secretRef,
    loginHint: resource.loginHint,
    statusCommand: statusCmd
      ? {
          command,
          argv: statusCmd.argv,
        }
      : undefined,
  }
}

/**
 * Resolve one resource: binding store override wins, else manifest contribution.
 */
export async function resolveAuthResourceStatus(
  pluginId: string,
  resource: AuthResourceContribution,
  pluginEnabled: boolean,
  options: ResolvePluginAuthOptions = {},
): Promise<PluginAuthStatus> {
  const env = options.env ?? process.env
  const store = options.store ?? createEnvSecretStore(env)
  const override = options.bindingStore?.get(pluginId, resource.resourceId)
  const binding: AuthBinding = override
    ? {
        ...override,
        pluginId,
        resourceId: resource.resourceId,
        // Fill statusCommand command from env when override omits absolute path
        statusCommand: override.statusCommand
          ? {
              command:
                firstEnv(env, resource.statusCommand?.commandFromEnv) ??
                override.statusCommand.command,
              argv: override.statusCommand.argv,
            }
          : authResourceToBinding(pluginId, resource, env).statusCommand,
      }
    : authResourceToBinding(pluginId, resource, env)

  // Disabled plugins: never execute statusCommand (surface only)
  if (!pluginEnabled && binding.kind === 'cli_session') {
    return {
      pluginId,
      resourceId: resource.resourceId,
      kind: binding.kind,
      pluginEnabled,
      status: 'missing',
      hint: binding.loginHint ?? '插件未启用；登录状态未探测',
    }
  }

  const result = await resolveAuthStatus(binding, store, env, {
    runner: options.runner,
    expectExitCode: resource.statusCommand?.expectExitCode,
  })

  return {
    pluginId,
    resourceId: resource.resourceId,
    kind: binding.kind,
    pluginEnabled,
    status: result.status,
    hint: result.hint,
  }
}

export async function resolvePluginAuthStatuses(
  items: Array<{
    pluginId: string
    enabled: boolean
    resources: AuthResourceContribution[]
  }>,
  options: ResolvePluginAuthOptions = {},
): Promise<PluginAuthStatus[]> {
  const out: PluginAuthStatus[] = []
  for (const item of items) {
    for (const resource of item.resources) {
      out.push(
        await resolveAuthResourceStatus(
          item.pluginId,
          resource,
          item.enabled,
          options,
        ),
      )
    }
  }
  return out
}

/**
 * Doctor-safe one-liner per resource. Never includes secret values.
 */
export function formatAuthDoctorLine(statuses: PluginAuthStatus[]): string {
  if (statuses.length === 0) return 'auth=none'
  return statuses
    .map((s) => {
      const en = s.pluginEnabled ? 'on' : 'off'
      const base = `${s.pluginId}/${s.resourceId} enable=${en} auth=${s.status}`
      if (s.hint && s.status !== 'connected' && s.status !== 'none_required') {
        return `${base} hint=${sanitizeHint(s.hint)}`
      }
      return base
    })
    .join('; ')
}

export function formatAuthStatusSummary(
  statuses: PluginAuthStatus[],
): string {
  if (statuses.length === 0) return 'auth=none'
  const parts = statuses.map(
    (s) => `${s.pluginId}/${s.resourceId}=${s.status}`,
  )
  return parts.join(',')
}

/** Strip anything that looks like a secret-ish token from hints (defense). */
export function sanitizeHint(hint: string, secretValues: string[] = []): string {
  let out = redactSecretValues(hint, secretValues)
  // Opaque token assignments from errors: token=..., access_token=...
  out = out.replace(
    /\b([A-Za-z0-9_]*token|authorization|password|secret)\s*[:=]\s*\S+/gi,
    '$1=***',
  )
  // Only redact token-shaped values — never rewrite status words like auth bearer=missing
  out = out.replace(
    /\b(ghp_[A-Za-z0-9]+|sk-[A-Za-z0-9._-]+|xox[bap]-[A-Za-z0-9-]+)/gi,
    '***',
  )
  out = out.replace(/\bBearer\s+[A-Za-z0-9._\-/=+]{8,}/gi, 'Bearer ***')
  return formatSafeStatusLine([out])
}

export type { AuthStatusResult }
