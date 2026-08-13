/**
 * Plugin auth status resolution (#22).
 * Enable ≠ login: plugin may be enabled while auth=missing.
 * Doctor/list summaries never embed secret values.
 */

import type { CliRunner } from './cli-loader.js'
import type { AuthBindingStore } from './auth-binding-store.js'
import { resolveCredentialMaterial } from './credential-resolver.js'
import type { AuthResourceContribution } from './manifest.js'
import { firstEnv } from './parse-util.js'
import {
  createEnvSecretStore,
  type SecretStore,
} from './secret-store.js'
import { formatSafeStatusLine, redactSecretValues } from './security-policy.js'
import type {
  AuthBinding,
  AuthStatus,
  AuthStatusResult,
  CredentialMaterial,
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
          connectedWhen: statusCmd.connectedWhen,
        }
      : undefined,
  }
}

/** Build effective AuthBinding: store override wins, else manifest; revoked is caller-checked. */
export function resolveEffectiveBinding(
  pluginId: string,
  resource: AuthResourceContribution,
  options: ResolvePluginAuthOptions = {},
): AuthBinding {
  const env = options.env ?? process.env
  const override = options.bindingStore?.get(pluginId, resource.resourceId)
  if (!override) return authResourceToBinding(pluginId, resource, env)
  return {
    ...override,
    pluginId,
    resourceId: resource.resourceId,
    statusCommand: override.statusCommand
      ? {
          command:
            firstEnv(env, resource.statusCommand?.commandFromEnv) ??
            override.statusCommand.command,
          argv: override.statusCommand.argv,
          connectedWhen:
            resource.statusCommand?.connectedWhen ??
            override.statusCommand.connectedWhen,
        }
      : authResourceToBinding(pluginId, resource, env).statusCommand,
  }
}

/**
 * Resolve injectable material for one resource (#28).
 * Same binding/revoked rules as status — inject path must call this, not raw env.
 */
export async function resolveAuthResourceMaterial(
  pluginId: string,
  resource: AuthResourceContribution,
  pluginEnabled: boolean,
  options: ResolvePluginAuthOptions = {},
): Promise<CredentialMaterial> {
  const env = options.env ?? process.env
  const store = options.store ?? createEnvSecretStore(env)
  const controlled = [
    ...(resource.envNames ?? []),
    ...(resource.secretRef?.backend === 'env'
      ? [resource.secretRef.envName]
      : []),
  ]

  if (options.bindingStore?.isRevoked(pluginId, resource.resourceId)) {
    return {
      status: 'missing',
      hint:
        resource.loginHint ??
        '授权已撤销；请重新配置凭据或 login（process env 残留不再生效）',
      envValues: {},
      controlledEnvNames: controlled,
    }
  }

  const binding = resolveEffectiveBinding(pluginId, resource, options)

  if (!pluginEnabled && binding.kind === 'cli_session') {
    return {
      status: 'missing',
      hint: binding.loginHint ?? '插件未启用；登录状态未探测',
      envValues: {},
      controlledEnvNames: controlled,
    }
  }

  return resolveCredentialMaterial(binding, store, env, {
    runner: options.runner,
    expectExitCode: resource.statusCommand?.expectExitCode,
    bindingStore: options.bindingStore,
  })
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
  const material = await resolveAuthResourceMaterial(
    pluginId,
    resource,
    pluginEnabled,
    options,
  )
  return {
    pluginId,
    resourceId: resource.resourceId,
    kind: resource.kind,
    pluginEnabled,
    status: material.status,
    hint: material.hint,
  }
}

/**
 * Pick auth resource for an MCP server on the same plugin (#28).
 * Prefer mcp:<serverId>, then bearer, then static/env/oauth kinds.
 */
export function pickAuthResourceForMcp(
  resources: AuthResourceContribution[],
  serverId: string,
): AuthResourceContribution | undefined {
  return (
    resources.find((r) => r.resourceId === `mcp:${serverId}`) ??
    resources.find((r) => r.resourceId === 'bearer') ??
    resources.find(
      (r) =>
        r.kind === 'static_bearer' ||
        r.kind === 'env_ref' ||
        r.kind === 'oauth2' ||
        r.kind === 'app_client',
    )
  )
}

/** Pick auth resource for a domain CLI contribution. */
export function pickAuthResourceForCli(
  resources: AuthResourceContribution[],
  cliId: string,
): AuthResourceContribution | undefined {
  return (
    resources.find((r) => r.resourceId === `cli:${cliId}`) ??
    resources.find((r) => r.kind === 'cli_session') ??
    resources.find(
      (r) =>
        r.kind === 'app_client' ||
        r.kind === 'env_ref' ||
        r.kind === 'static_bearer',
    )
  )
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
