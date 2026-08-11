/**
 * Build status-safe CapabilitySnapshot (sidecar owner of effective truth).
 */

import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
import {
  isConnectorEffective,
  resolveEffectiveConnectors,
  resolveEffectiveSkills,
} from '../plugin/effective-capabilities.js'
import type { PluginAuthStatus } from '../plugin/auth-status.js'
import type { CliLoadStatus } from '../plugin/cli-loader.js'
import type { AuthStatus } from '../plugin/types.js'
import {
  emptyTaskCapabilitySelection,
  type CapabilitySelectionStore,
} from './selection-store.js'
import { getDefaultExpertSnapshotCatalog } from './expert-catalog.js'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotConnector,
  CapabilitySnapshotExpert,
  CapabilitySnapshotSkill,
  ConnectorConnectionState,
  TaskCapabilitySelection,
} from './types.js'

/**
 * @deprecated Prefer experts/*.json via loadExpertCatalog / getDefaultExpertSnapshotCatalog.
 * Kept as alias so existing imports keep working.
 */
export const TEMP_EXPERT_CATALOG: readonly CapabilitySnapshotExpert[] =
  getDefaultExpertSnapshotCatalog()

export type BuildCapabilitySnapshotInput = {
  version: number
  nowIso?: () => string
  taskId?: string | null
  selection?: TaskCapabilitySelection
  selectionStore?: CapabilitySelectionStore
  descriptors: readonly ConnectorDescriptor[]
  /** Packaging auth statuses (plugin resources) */
  authStatuses: readonly PluginAuthStatus[]
  /** CLI load statuses (binary ready/missing) */
  cliStatuses?: readonly CliLoadStatus[]
  /** All packaged tool names currently loaded */
  packagedToolNames: readonly string[]
  /** Discoverable skill folder ids under workspace */
  discoverableSkillIds?: readonly string[]
  experts?: readonly CapabilitySnapshotExpert[]
  /** Enabled plugin ids from registry */
  enabledPluginIds: readonly string[]
}

export function buildCapabilitySnapshot(
  input: BuildCapabilitySnapshotInput,
): CapabilitySnapshot {
  const taskId = input.taskId?.trim() || null
  const selection =
    input.selection ??
    (taskId && input.selectionStore
      ? input.selectionStore.get(taskId)
      : emptyTaskCapabilitySelection())
  const descriptors = input.descriptors
  const expertsCatalog = input.experts ?? [...TEMP_EXPERT_CATALOG]
  const discoverable = input.discoverableSkillIds ?? []
  const now = (input.nowIso ?? (() => new Date().toISOString()))()

  const connectorInputs = descriptors.map((d) => {
    const auth = resolveConnectorAuth(
      d,
      input.authStatuses,
      input.enabledPluginIds,
    )
    return {
      descriptor: d,
      pluginGloballyEnabled: auth.pluginGloballyEnabled,
      authStatus: auth.authStatus,
      authHint: auth.hint,
      taskSelected: selection.connectorIds.includes(d.id),
      availability: resolveAvailability(d, input.cliStatuses),
    }
  })

  const effective = resolveEffectiveConnectors({
    connectors: connectorInputs.map((c) => ({
      connectorId: c.descriptor.id,
      pluginGloballyEnabled: c.pluginGloballyEnabled,
      authStatus: c.authStatus,
      taskSelected: c.taskSelected,
    })),
    descriptors,
    packagedToolNames: input.packagedToolNames,
  })

  const connectors: CapabilitySnapshotConnector[] = connectorInputs.map((c) => {
    const decision = isConnectorEffective({
      connectorId: c.descriptor.id,
      pluginGloballyEnabled: c.pluginGloballyEnabled,
      authStatus: c.authStatus,
      taskSelected: c.taskSelected,
    })
    const connectionState = toConnectionState(c.authStatus, c.availability)
    const scopedTools = effective.effectiveToolNames.filter((name) =>
      c.descriptor.toolScope.some((scope) =>
        scope.endsWith('.') || scope.endsWith('_')
          ? name.startsWith(scope)
          : name === scope,
      ),
    )
    return {
      id: c.descriptor.id,
      name: c.descriptor.name,
      description: c.descriptor.description,
      enabled: c.pluginGloballyEnabled,
      connected: c.authStatus === 'connected',
      connectionState,
      taskSelected: c.taskSelected,
      capabilityEffective: decision.capabilityEntersNextTurn,
      reasons: decision.reasons,
      capabilities: c.descriptor.capabilities.map((cap) => ({
        id: cap.id,
        name: cap.name,
        available: cap.available,
        toolNames: [...cap.toolNames],
      })),
      toolScope: [...c.descriptor.toolScope],
      commandScopes: [...c.descriptor.commandScopes],
      effectiveToolNames: decision.capabilityEntersNextTurn ? scopedTools : [],
      effectiveCommandScopes: decision.capabilityEntersNextTurn
        ? [...c.descriptor.commandScopes]
        : [],
      packageHint: c.descriptor.packageHint,
      loginHint: c.authHint ?? c.descriptor.loginHint,
      primaryChannel: c.descriptor.primaryChannel,
      channelAuth: c.descriptor.channelAuth?.map((row) => ({
        channel: row.channel,
        authKind: row.authKind,
        label: row.label,
      })),
      availability: c.availability,
    }
  })

  const selectedExpert = selection.expertId
    ? expertsCatalog.find((e) => e.id === selection.expertId)
    : undefined
  const expertDefaultSkills = selectedExpert?.skills ?? []

  const effectiveSkillIds = new Set(
    resolveEffectiveSkills({
      expertDefaultSkills,
      taskSelectedSkills: selection.skillIds,
      discoverableSkillRoots: discoverable,
    }),
  )

  const skillIds = new Set([
    ...discoverable,
    ...selection.skillIds,
    ...expertDefaultSkills,
  ])
  const skills: CapabilitySnapshotSkill[] = [...skillIds].sort().map((id) => ({
    id,
    name: id,
    taskSelected: effectiveSkillIds.has(id),
    discoverable: discoverable.includes(id),
    source: expertDefaultSkills.includes(id)
      ? 'expert-default'
      : discoverable.includes(id)
        ? 'workspace'
        : 'catalog',
  }))

  const experts: CapabilitySnapshotExpert[] = expertsCatalog.map((e) => ({
    ...e,
    taskSelected: selection.expertId === e.id,
  }))

  return {
    version: input.version,
    generatedAt: now,
    taskId,
    honesty: {
      runtime: 'local-sidecar',
      authBoundary: 'provider_declared',
      note: '本机侧车 Capability Snapshot。Connected 由各 PluginManifest 声明的 auth resource 独立探测；OAuth token、CLI device code 与原始凭据均不进入 Renderer。Fake 不得假登录或外呼成功。',
    },
    connectors,
    skills,
    experts,
    selection: {
      connectorIds: [...selection.connectorIds],
      skillIds: [...selection.skillIds],
      expertId: selection.expertId,
    },
    effectiveToolNames: effective.effectiveToolNames,
    effectiveCommandScopes: effective.effectiveCommandScopes,
    // Keep effectiveSkillIds available via skills flags; list for tests:
    // (explicit field omitted from type to keep MVP whitelist tight)
  }
}

function resolveConnectorAuth(
  descriptor: ConnectorDescriptor,
  authStatuses: readonly PluginAuthStatus[],
  enabledPluginIds: readonly string[],
): {
  pluginGloballyEnabled: boolean
  authStatus: AuthStatus
  hint?: string
} {
  const pluginId = descriptor.authSummarySource.pluginId
  const resourceId = descriptor.authSummarySource.resourceId
  const pluginGloballyEnabled = enabledPluginIds.includes(pluginId)
  const row = authStatuses.find(
    (a) => a.pluginId === pluginId && a.resourceId === resourceId,
  )
  if (!pluginGloballyEnabled) {
    return {
      pluginGloballyEnabled: false,
      authStatus: 'missing',
      hint: row?.hint ?? descriptor.loginHint ?? '插件未启用',
    }
  }
  if (!row) {
    return {
      pluginGloballyEnabled: true,
      authStatus: 'missing',
      hint: descriptor.loginHint ?? '未找到 auth 资源',
    }
  }
  return {
    pluginGloballyEnabled: true,
    authStatus: row.status,
    hint: row.hint ?? descriptor.loginHint,
  }
}

function resolveAvailability(
  descriptor: ConnectorDescriptor,
  cliStatuses: readonly CliLoadStatus[] | undefined,
): CapabilitySnapshotConnector['availability'] {
  if (descriptor.availability === 'fake-catalog-only')
    return 'fake-catalog-only'
  if (!cliStatuses?.length) return descriptor.availability
  // Provider CLI binary status
  for (const pluginId of descriptor.pluginRefs) {
    const st = cliStatuses.find((s) => s.pluginId === pluginId)
    if (st?.status === 'missing') return 'missing-binary'
  }
  return 'sidecar'
}

function toConnectionState(
  status: AuthStatus,
  availability: CapabilitySnapshotConnector['availability'],
): ConnectorConnectionState {
  if (availability === 'missing-binary') return 'unavailable'
  if (status === 'connected') return 'connected'
  if (status === 'expired') return 'expired'
  if (status === 'error') return 'error'
  if (status === 'none_required') return 'none_required'
  return 'missing'
}
