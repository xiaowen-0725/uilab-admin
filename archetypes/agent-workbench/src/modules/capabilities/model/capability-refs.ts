/**
 * Slim capability ref types — the status-safe projection consumed by
 * TurnComposerContext and other downstream readers.
 *
 * These are deliberately narrower than the full CapabilitySnapshot* row types:
 * they carry only what a Turn submission or runtime prompt needs (id, label,
 * taskSelected, connected, capabilityEffective, instruction). The capabilities
 * module owns this shape so the `name`→`label` rename lives in one place.
 */

import type {
  CapabilitySnapshot,
  CapabilitySnapshotConnector,
  CapabilitySnapshotExpert,
  CapabilitySnapshotSkill,
} from '../ports/capability-snapshot-port.js'

/** A skill selected for the current Turn (id + display label). */
export type SelectedSkillRef = {
  id: string
  label: string
}

/** A connector's status-safe projection for the current Turn. */
export type SelectedConnectorRef = {
  id: string
  label: string
  connected?: boolean
  taskSelected: boolean
  capabilityEffective?: boolean
}

/** A task-selected expert profile (not a sub-agent). */
export type SelectedExpertRef = {
  id: string
  label: string
  instruction?: string
}

/**
 * Project the capability snapshot's skills (already task-selected) into slim refs.
 * The `name`→`label` rename lives here, not at call sites.
 */
export function projectSelectedSkills(
  skills: readonly CapabilitySnapshotSkill[],
): SelectedSkillRef[] {
  return skills
    .filter((s) => s.taskSelected)
    .map((s) => ({ id: s.id, label: s.name }))
}

/**
 * Project all connectors into slim refs (unfiltered — the consumer re-checks
 * taskSelected at invocation time per ADR-0016 effective ownership).
 */
export function projectConnectorRefs(
  connectors: readonly CapabilitySnapshotConnector[],
): SelectedConnectorRef[] {
  return connectors.map((c) => ({
    id: c.id,
    label: c.name,
    connected: c.connected,
    taskSelected: c.taskSelected,
    capabilityEffective: c.capabilityEffective,
  }))
}

/**
 * Project the task-selected expert (at most one) into a slim ref, or null.
 */
export function projectSelectedExpert(
  experts: readonly CapabilitySnapshotExpert[],
): SelectedExpertRef | null {
  const selected = experts.find((e) => e.taskSelected)
  if (!selected) return null
  return {
    id: selected.id,
    label: selected.name,
    instruction: selected.instruction,
  }
}

/**
 * Convenience: project the full snapshot into the three ref arrays at once.
 */
export function projectSelectedCapabilityRefs(snapshot: CapabilitySnapshot): {
  skills: SelectedSkillRef[]
  connectors: SelectedConnectorRef[]
  expert: SelectedExpertRef | null
} {
  return {
    skills: projectSelectedSkills(snapshot.skills),
    connectors: projectConnectorRefs(snapshot.connectors),
    expert: projectSelectedExpert(snapshot.experts),
  }
}
