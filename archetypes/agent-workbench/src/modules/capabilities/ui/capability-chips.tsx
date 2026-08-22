/**
 * Composer chips:
 * - Connectors: WorkBuddy-style brand badges for toolbar (use CapabilityToolbarConnectors)
 * - Expert / skills: text chips above input when needed
 */
import { BookOpenIcon as BookOpen, UserCircleIcon as UserRound } from '@heroicons/react/24/outline'
import { ComposerSkillChip } from '@/components/motion/agent-composer'
import type { CapabilitySnapshot } from '../ports/capability-snapshot-port'
import { ConnectorBrandBadge } from './brand-icons'

export type CapabilityChipsProps = {
  snapshot: CapabilitySnapshot | null
  onRemoveConnector: (connectorId: string) => void
  onRemoveExpert: () => void
  onRemoveSkill: (skillId: string) => void
  /**
   * `toolbar` — only connector brand buttons (place next to +).
   * `stack` — expert + skills text chips (above input).
   * `all` — legacy combined row (avoid for WorkBuddy layout).
   */
  variant?: 'toolbar' | 'stack' | 'all'
  onOpenConnector?: (connectorId: string) => void
}

export function CapabilityToolbarConnectors({
  snapshot,
  onRemoveConnector,
  onOpenConnector,
}: {
  snapshot: CapabilitySnapshot | null
  onRemoveConnector: (connectorId: string) => void
  onOpenConnector?: (connectorId: string) => void
}) {
  if (!snapshot) return null
  const selected = snapshot.connectors.filter((c) => c.taskSelected)
  if (selected.length === 0) return null

  return (
    <div
      className='flex items-center gap-1'
      data-testid='capability-toolbar-connectors'
    >
      {selected.map((c) => (
        <ConnectorBrandBadge
          key={c.id}
          brandIconKey={c.brandIconKey}
          connectorId={c.id}
          name={c.name}
          connected={c.connected}
          selected={c.taskSelected}
          onClick={() => onOpenConnector?.(c.id)}
          onRemove={() => onRemoveConnector(c.id)}
        />
      ))}
    </div>
  )
}

export function CapabilityChips({
  snapshot,
  onRemoveConnector,
  onRemoveExpert,
  onRemoveSkill,
  variant = 'stack',
  onOpenConnector,
}: CapabilityChipsProps) {
  if (!snapshot) return null

  const selectedConnectors = snapshot.connectors.filter((c) => c.taskSelected)
  const selectedExpert = snapshot.experts.find((e) => e.taskSelected)
  const selectedSkills = snapshot.skills.filter((s) => s.taskSelected)

  if (variant === 'toolbar') {
    return (
      <CapabilityToolbarConnectors
        snapshot={snapshot}
        onRemoveConnector={onRemoveConnector}
        onOpenConnector={onOpenConnector}
      />
    )
  }

  const showConnectors = variant === 'all'
  if (
    (showConnectors ? selectedConnectors.length === 0 : true) &&
    !selectedExpert &&
    selectedSkills.length === 0 &&
    !showConnectors
  ) {
    if (!selectedExpert && selectedSkills.length === 0) return null
  }

  if (!selectedExpert && selectedSkills.length === 0 && !showConnectors) {
    return null
  }
  if (
    showConnectors &&
    selectedConnectors.length === 0 &&
    !selectedExpert &&
    selectedSkills.length === 0
  ) {
    return null
  }

  return (
    <div
      className='flex flex-wrap items-center gap-1.5 px-1 pb-1'
      data-testid='capability-chips'
    >
      {showConnectors
        ? selectedConnectors.map((c) => (
            <ConnectorBrandBadge
              key={c.id}
              brandIconKey={c.brandIconKey}
              connectorId={c.id}
              name={c.name}
              connected={c.connected}
              selected
              onRemove={() => onRemoveConnector(c.id)}
              onClick={() => onOpenConnector?.(c.id)}
            />
          ))
        : null}
      {selectedExpert ? (
        <ComposerSkillChip
          key={selectedExpert.id}
          icon={<UserRound className='size-3.5' />}
          label={selectedExpert.name}
          data-testid={`capability-chip-expert-${selectedExpert.id}`}
          onRemove={onRemoveExpert}
        />
      ) : null}
      {selectedSkills.map((s) => (
        <ComposerSkillChip
          key={s.id}
          icon={<BookOpen className='size-3.5' />}
          label={s.name}
          data-testid={`capability-chip-skill-${s.id}`}
          onRemove={() => onRemoveSkill(s.id)}
        />
      ))}
    </div>
  )
}
