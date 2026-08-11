/**
 * Capability Surface snapshot types (status-safe, no secrets).
 * Spec: docs/plans/workbench-capability-surface-spec.md
 */

import type { AuthStatus } from '../plugin/types.js'

export type ConnectorConnectionState =
  | 'connected'
  | 'missing'
  | 'expired'
  | 'error'
  | 'none_required'
  | 'auth_in_progress'
  | 'unavailable'

export type CapabilitySnapshotConnector = {
  id: string
  name: string
  description: string
  /** Global packaging enabled */
  enabled: boolean
  /** Aggregated auth for the product connector's declared auth resource. */
  connected: boolean
  connectionState: ConnectorConnectionState
  taskSelected: boolean
  /** Whether this Connector's MCP tools or native command scope enters next Turn. */
  capabilityEffective: boolean
  reasons: string[]
  capabilities: Array<{
    id: string
    name: string
    available: boolean
    toolNames: string[]
  }>
  toolScope: string[]
  commandScopes: string[]
  /** Concrete tools that would enter next Turn if effective */
  effectiveToolNames: string[]
  /** Native executable scopes that enter next Turn for this Connector. */
  effectiveCommandScopes: string[]
  packageHint?: string
  loginHint?: string
  /**
   * Honest product channel. `hybrid` is reserved for a genuine multi-channel
   * Provider; it is not the default shape.
   */
  primaryChannel: 'domain_cli' | 'mcp' | 'hybrid' | 'none'
  /**
   * Optional per-channel auth honesty (no secrets).
   */
  channelAuth?: Array<{
    channel: 'domain_cli' | 'mcp'
    authKind: string
    label: string
  }>
  availability: 'sidecar' | 'fake-catalog-only' | 'missing-binary'
}

export type CapabilitySnapshotSkill = {
  id: string
  name: string
  taskSelected: boolean
  discoverable: boolean
  source: 'workspace' | 'expert-default' | 'catalog'
}

export type CapabilitySnapshotExpert = {
  id: string
  name: string
  description: string
  taskSelected: boolean
  skills: string[]
  /** Recommend-only connector ids */
  connectors: string[]
  /** Honest: temporary static catalog / experts/*.json, not Plugin packaging */
  source: 'static-catalog'
  /** Instruction overlay for next Turn (status-safe; optional in older clients) */
  instruction?: string
}

export type TaskCapabilitySelection = {
  connectorIds: string[]
  skillIds: string[]
  /** Single expert or null */
  expertId: string | null
}

export type CapabilitySnapshot = {
  version: number
  generatedAt: string
  taskId: string | null
  honesty: {
    runtime: 'local-sidecar'
    /** Provider auth semantics come from PluginManifest, not Host branches. */
    authBoundary: 'provider_declared'
    note: string
  }
  connectors: CapabilitySnapshotConnector[]
  skills: CapabilitySnapshotSkill[]
  experts: CapabilitySnapshotExpert[]
  selection: TaskCapabilitySelection
  /** Tools that enter next Turn for this task (connectors only, MVP) */
  effectiveToolNames: string[]
  /** Native executable scopes that enter next Turn for this task. */
  effectiveCommandScopes: string[]
}

export type StartAuthRequest = {
  connectorId: string
  /** Optional Provider CLI authorization domains/scopes. */
  domains?: string[]
}

export type StartAuthResult =
  | {
      ok: true
      connectorId: string
      kind: 'cli_session' | 'static_bearer' | 'oauth2'
      phase: 'login_started' | 'already_connected' | 'hint_only'
      /** Generic auth stage; Provider-specific flow details stay in Sidecar. */
      step?: 'configure' | 'authorize' | 'connected'
      /** Browser verification URL when device flow started (no token) */
      verificationUrl?: string
      expiresIn?: number
      loginHint: string
      /** Operator-facing message (Chinese) */
      message: string
    }
  | {
      ok: false
      connectorId: string
      error: string
      loginHint?: string
      message: string
    }

export type ConnectorAuthTransition = {
  connectorId: string
  kind: 'cli_session' | 'oauth2'
  phase: 'authorization_required' | 'connected' | 'failed'
  step: 'configure' | 'authorize' | 'connected'
  /** Browser-safe continuation URL; no device code or token. */
  verificationUrl?: string
  message: string
}

export type AuthStatusProbeResult = {
  connectorId: string
  pluginId: string
  resourceId: string
  status: AuthStatus
  connected: boolean
  hint?: string
  pluginEnabled: boolean
}
