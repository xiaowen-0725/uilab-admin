/**
 * Effective capability set resolver (sidecar is the sole owner of truth).
 *
 * Spec algorithm (connectors / tools):
 *   pluginGloballyEnabled ∧ authStatus==connected ∧ taskSelected ∧ !taskMuted
 *
 * Renderer must not invent the final tool list. This module is pure + testable.
 */

import {
  expandConnectorToolScope,
  type ConnectorDescriptor,
} from './connector-descriptor.js'
import type { AuthStatus } from './types.js'

/** Minimal connector status inputs for one Task's next Turn. */
export type ConnectorEffectiveInput = {
  connectorId: string
  /** Plugin packaging enabled in Runtime host (global). */
  pluginGloballyEnabled: boolean
  /** Aggregated auth status for the connector's authSummarySource. */
  authStatus: AuthStatus
  /** Task-level selection overlay. */
  taskSelected: boolean
  /**
   * Reserved mute flag. MVP may express mute via deselect (taskSelected=false).
   * When true, tools are absent even if selected+connected.
   */
  taskMuted?: boolean
}

export type EffectiveConnectorDecision = {
  connectorId: string
  /** Whether this connector's execution capability enters the next Turn. */
  capabilityEntersNextTurn: boolean
  /** Chip may still show selection even when tools are absent. */
  chipVisible: boolean
  reasons: string[]
}

export type ResolveEffectiveConnectorsOptions = {
  connectors: readonly ConnectorEffectiveInput[]
  /**
   * Optional descriptors to expand toolScope → concrete tool names.
   * When omitted, only boolean decisions are returned.
   */
  descriptors?: readonly ConnectorDescriptor[]
  /** Tools currently loadable by packaging (before Task effective filter). */
  packagedToolNames?: readonly string[]
}

export type EffectiveCapabilitySet = {
  decisions: EffectiveConnectorDecision[]
  /** Connector ids whose tools enter the next Turn. */
  effectiveConnectorIds: string[]
  /**
   * Concrete tool names that may enter the next Turn for connectors.
   * Empty when descriptors/packaged tools not supplied.
   */
  effectiveToolNames: string[]
  /** Native executable scopes that may enter the next Turn. */
  effectiveCommandScopes: string[]
}

/**
 * Decide whether a single connector's tool face enters the next Turn.
 * Pure: no I/O, no secrets.
 */
export function isConnectorEffective(
  input: ConnectorEffectiveInput,
): EffectiveConnectorDecision {
  const reasons: string[] = []
  const muted = input.taskMuted === true

  if (!input.pluginGloballyEnabled) {
    reasons.push('plugin_not_enabled')
  }
  if (input.authStatus !== 'connected') {
    reasons.push(
      input.authStatus === 'missing'
        ? 'not_connected'
        : `auth_${input.authStatus}`,
    )
  }
  if (!input.taskSelected) {
    reasons.push('not_task_selected')
  }
  if (muted) {
    reasons.push('task_muted')
  }

  const capabilityEntersNextTurn =
    input.pluginGloballyEnabled &&
    input.authStatus === 'connected' &&
    input.taskSelected &&
    !muted

  // Selection chip can remain when user selected but auth later revoked / missing.
  const chipVisible = input.taskSelected

  return {
    connectorId: input.connectorId,
    capabilityEntersNextTurn,
    chipVisible,
    reasons: capabilityEntersNextTurn ? [] : reasons,
  }
}

/**
 * Resolve the effective connector tool set for the next Turn.
 * Sidecar-owned algorithm; Workbench only supplies selection + consumes snapshot.
 */
export function resolveEffectiveConnectors(
  options: ResolveEffectiveConnectorsOptions,
): EffectiveCapabilitySet {
  const decisions = options.connectors.map(isConnectorEffective)
  const effectiveConnectorIds = decisions
    .filter((d) => d.capabilityEntersNextTurn)
    .map((d) => d.connectorId)

  const effectiveToolNames = new Set<string>()
  const effectiveCommandScopes = new Set<string>()
  const descriptors = options.descriptors ?? []
  const packaged = options.packagedToolNames ?? []

  if (descriptors.length > 0) {
    for (const id of effectiveConnectorIds) {
      const desc = descriptors.find((d) => d.id === id)
      if (!desc) continue
      if (packaged.length > 0) {
        for (const name of expandConnectorToolScope(desc, packaged)) {
          effectiveToolNames.add(name)
        }
      }
      for (const command of desc.commandScopes) {
        effectiveCommandScopes.add(command)
      }
    }
  }

  return {
    decisions,
    effectiveConnectorIds,
    effectiveToolNames: [...effectiveToolNames].sort(),
    effectiveCommandScopes: [...effectiveCommandScopes].sort(),
  }
}

/**
 * Expert skills merge (pure subset of Spec skills algorithm).
 * expertDefaultSkills ∪ taskSelectedSkills ∩ discoverableSkillRoots
 */
export function resolveEffectiveSkills(input: {
  expertDefaultSkills?: readonly string[]
  taskSelectedSkills?: readonly string[]
  discoverableSkillRoots: readonly string[]
}): string[] {
  const union = new Set<string>([
    ...(input.expertDefaultSkills ?? []),
    ...(input.taskSelectedSkills ?? []),
  ])
  const discoverable = new Set(input.discoverableSkillRoots)
  return [...union].filter((id) => discoverable.has(id)).sort()
}
