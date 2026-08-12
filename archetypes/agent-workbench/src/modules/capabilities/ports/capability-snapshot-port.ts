/**
 * CapabilitySnapshotPort — versioned status-safe read model + invalidation.
 * Renderer never holds secrets; Provider credentials stay behind the Sidecar.
 */

export type CapabilityConnectionState =
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
  enabled: boolean
  connected: boolean
  connectionState: CapabilityConnectionState
  taskSelected: boolean
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
  effectiveToolNames: string[]
  effectiveCommandScopes: string[]
  packageHint?: string
  loginHint?: string
  /** Product channel; Hybrid is reserved for genuine multi-channel Providers. */
  primaryChannel: 'domain_cli' | 'mcp' | 'hybrid' | 'none'
  /** Optional per-connector auth-channel honesty rows. */
  channelAuth?: Array<{
    channel: 'domain_cli' | 'mcp'
    authKind: string
    label: string
  }>
  availability: 'sidecar' | 'fake-catalog-only' | 'missing-binary'
  /** Brand icon key (sidecar descriptor drives; Renderer maps to actual icon). */
  brandIconKey?: string
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
  connectors: string[]
  source: 'static-catalog'
  /** Instruction overlay (optional; file catalog may supply) */
  instruction?: string
}

export type TaskCapabilitySelection = {
  connectorIds: string[]
  skillIds: string[]
  expertId: string | null
}

export type CapabilitySnapshot = {
  version: number
  generatedAt: string
  taskId: string | null
  honesty: {
    runtime: 'local-sidecar' | 'fake'
    authBoundary: 'provider_declared'
    note: string
  }
  connectors: CapabilitySnapshotConnector[]
  skills: CapabilitySnapshotSkill[]
  experts: CapabilitySnapshotExpert[]
  selection: TaskCapabilitySelection
  effectiveToolNames: string[]
  effectiveCommandScopes: string[]
}

export type StartAuthResult =
  | {
      ok: true
      connectorId: string
      kind: 'cli_session' | 'static_bearer' | 'oauth2'
      phase: 'login_started' | 'already_connected' | 'hint_only'
      step?: 'configure' | 'authorize' | 'connected'
      verificationUrl?: string
      expiresIn?: number
      loginHint: string
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
  verificationUrl?: string
  message: string
}

export type CapabilityAuthRefreshResult = {
  snapshot: CapabilitySnapshot
  transitions: ConnectorAuthTransition[]
}

export type CapabilityAuthRevokeResult = {
  snapshot: CapabilitySnapshot
  connectorId: string
  message: string
  /**
   * True when a sidecar restart is still needed for full cleanup (e.g. the
   * transport was loaded at boot and is not reachable for in-process reclaim).
   * False once the live transport is hot-reclaimed.
   */
  needsSidecarRestart: boolean
  /** True when the live MCP transport was disconnected in-process on revoke. */
  hotReclaimApplied?: boolean
}

export type CapabilitySnapshotListener = (snapshot: CapabilitySnapshot) => void

/**
 * Query + selection + auth-start. Composition injects Fake or VoltAgent adapter.
 * Invalidation: startAuth / selection / refresh must bump version and notify listeners.
 */
export interface CapabilitySnapshotPort {
  getSnapshot(taskId?: string | null): Promise<CapabilitySnapshot>

  setSelection(
    taskId: string,
    selection: Partial<TaskCapabilitySelection>
  ): Promise<CapabilitySnapshot>

  startAuth(
    connectorId: string,
    options?: { domains?: string[] }
  ): Promise<StartAuthResult>

  /** Force re-probe Connected (e.g. after CLI login completes). */
  refreshAuth(
    taskId?: string | null,
    connectorId?: string
  ): Promise<CapabilityAuthRefreshResult>

  /** Revoke one descriptor-owned account binding without exposing Provider details. */
  revokeAuth(
    taskId: string | null | undefined,
    connectorId: string
  ): Promise<CapabilityAuthRevokeResult>

  subscribe(listener: CapabilitySnapshotListener): () => void
}
