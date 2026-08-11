/**
 * ConnectorDescriptor — thin product projection over Plugin packaging.
 *
 * Spec: docs/plans/workbench-capability-surface-spec.md
 * ADR: docs/adr/0016-capability-surface-module-and-snapshot-port.md
 *
 * Not a second Plugin kernel. PluginRegistry remains packaging truth;
 * this layer only projects connector-facing catalog fields for snapshot/UI.
 */

import type { PluginManifest } from './manifest.js'

/** Where the connector can actually run. */
export type ConnectorAvailability =
  | 'sidecar'
  | 'fake-catalog-only'
  | 'missing-binary'

/** Auth aggregation source (status-safe resource key, not a secret). */
export type ConnectorAuthSummarySource = {
  pluginId: string
  resourceId: string
  /** Product-facing auth model for this slice (honest labels only). */
  kind: 'cli_session' | 'static_bearer' | 'oauth2' | 'env_ref' | 'app_client'
}

/** Sub-capability exposed when allowlist / packaging truly declares it. */
export type ConnectorSubCapability = {
  id: string
  /** Chinese-first display name */
  name: string
  description?: string
  /** How this sub-capability is realized in the runtime host */
  channel: 'domain_cli' | 'mcp' | 'none'
  /** Tool name prefixes or exact names that belong to this sub-capability */
  toolNames: string[]
  /** Whether this slice treats the sub-capability as product-available */
  available: boolean
}

/**
 * Product-facing primary channel for a single Connector id.
 * - domain_cli / mcp: one active channel for Connected green-dot
 * - hybrid: multiple channels may contribute tools; Connected must be
 *   interpreted via `channelAuth` honesty rows (never one green for both)
 * - none: catalog-only / unavailable
 */
export type ConnectorPrimaryChannel = 'domain_cli' | 'mcp' | 'hybrid' | 'none'

/**
 * Per-channel auth honesty (status-safe). A single-channel connector may use
 * one row to explain its Provider-native auth; Hybrid may use multiple rows.
 */
export type ConnectorChannelAuthHonesty = {
  channel: 'domain_cli' | 'mcp'
  authKind: ConnectorAuthSummarySource['kind']
  /** Optional plugin/resource for that channel's status probe */
  pluginId?: string
  resourceId?: string
  /** Chinese short label, e.g. 「GitHub OAuth」/「CLI session」 */
  label: string
}

/**
 * Product connector projection.
 * Renderer-safe: no tokens, no raw AuthBinding dumps.
 */
export type ConnectorDescriptor = {
  id: string
  name: string
  description: string
  pluginRefs: string[]
  capabilities: ConnectorSubCapability[]
  authSummarySource: ConnectorAuthSummarySource
  /**
   * Product channel for this connector (single id, not two user-facing rows).
   * Defaults derived from capabilities when omitted at call sites.
   */
  primaryChannel: ConnectorPrimaryChannel
  /**
   * Provider-native auth-channel rows. Hybrid is allowed but not required.
   */
  channelAuth?: readonly ConnectorChannelAuthHonesty[]
  /** Provider-owned executable basenames routed through the generic Shell. */
  commandScopes: string[]
  /**
   * Tool scope for assembly / filtering.
   * Prefer Provider-owned prefixes (`provider_`) or exact tool names.
   * Trailing `.` or `_` means prefix match.
   */
  toolScope: string[]
  availability: ConnectorAvailability
  /** Optional package / binary install hint (no secret). */
  packageHint?: string
  /** Chinese operator/user login hint (no secret). */
  loginHint?: string
}

/**
 * Project Provider-owned connector contributions without knowing Provider
 * business commands in Host core. Duplicate product ids fail closed until a
 * future multi-provider aggregation contract is defined.
 */
export function projectConnectorDescriptors(
  manifests: readonly PluginManifest[],
): ConnectorDescriptor[] {
  const out: ConnectorDescriptor[] = []
  const owners = new Map<string, string>()

  for (const manifest of manifests) {
    for (const contribution of manifest.contributes?.connectors ?? []) {
      const previousOwner = owners.get(contribution.id)
      if (previousOwner) {
        throw new Error(
          `Connector id 冲突：${contribution.id}（${previousOwner}, ${manifest.id}）`,
        )
      }
      owners.set(contribution.id, manifest.id)
      out.push({
        id: contribution.id,
        name: contribution.name,
        description: contribution.description,
        pluginRefs: [manifest.id],
        capabilities: contribution.capabilities.map((capability) => ({
          ...capability,
          toolNames: [...capability.toolNames],
        })),
        authSummarySource: {
          pluginId: manifest.id,
          resourceId: contribution.authResourceId,
          kind: contribution.authKind,
        },
        primaryChannel: contribution.primaryChannel,
        channelAuth: contribution.channelAuth?.map((row) => ({
          ...row,
          pluginId: manifest.id,
        })),
        commandScopes: [...(contribution.commandScopes ?? [])],
        toolScope: [...contribution.toolScope],
        availability: contribution.availability,
        packageHint: contribution.packageHint,
        loginHint: contribution.loginHint,
      })
    }
  }

  return out
}

/** Derive primary channel from available sub-capabilities (helpers / tests). */
export function derivePrimaryChannel(
  capabilities: readonly ConnectorSubCapability[],
): ConnectorPrimaryChannel {
  const channels = new Set(
    capabilities.filter((c) => c.available).map((c) => c.channel),
  )
  channels.delete('none')
  if (channels.size === 0) return 'none'
  if (channels.size > 1) return 'hybrid'
  if (channels.has('domain_cli')) return 'domain_cli'
  if (channels.has('mcp')) return 'mcp'
  return 'none'
}

export function getConnectorDescriptor(
  id: string,
  catalog: readonly ConnectorDescriptor[],
): ConnectorDescriptor | undefined {
  return catalog.find((c) => c.id === id)
}

/**
 * Expand toolScope prefixes/exact names against a concrete tool name list.
 * Prefix match: scope ending with `.` or `_` (e.g. `provider_`).
 */
export function expandConnectorToolScope(
  descriptor: ConnectorDescriptor,
  availableToolNames: readonly string[],
): string[] {
  const out = new Set<string>()
  for (const scope of descriptor.toolScope) {
    if (scope.endsWith('.') || scope.endsWith('_')) {
      for (const name of availableToolNames) {
        if (name.startsWith(scope)) out.add(name)
      }
      continue
    }
    if (availableToolNames.includes(scope)) out.add(scope)
  }
  return [...out].sort()
}
