/**
 * Composer chips:
 * - Connectors: brand badges for toolbar (use CapabilityToolbarConnectors)
 * - Expert: persona control beside + (use CapabilityToolbarExpert)
 * - Skills: removable tags on the first draft line (use CapabilityInputSkills)
 */
import { BookOpenIcon as BookOpen, UserCircleIcon as UserRound, XMarkIcon as X } from '@heroicons/react/24/outline'
import { ComposerSkillChip } from '@/components/motion/agent-composer'
import { cn } from '@/lib/utils'
import type { CapabilitySnapshot } from '../ports/capability-snapshot-port'
import { ConnectorBrandBadge } from './brand-icons'

export type CapabilityChipsProps = {
  snapshot: CapabilitySnapshot | null
  onRemoveConnector: (connectorId: string) => void
  onRemoveExpert: () => void
  onRemoveSkill: (skillId: string) => void
  /**
   * `toolbar` — only connector brand buttons (place next to +).
   * `stack` — leftover combined expert/skill row (prefer toolbar expert + input skills).
   * `all` — legacy combined row.
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

export type CapabilityToolbarExpertProps = {
  snapshot: CapabilitySnapshot | null
  onRemoveExpert: () => void
}

export function CapabilityToolbarExpert({
  snapshot,
  onRemoveExpert,
}: CapabilityToolbarExpertProps) {
  if (!snapshot) return null
  const expert = snapshot.experts.find((item) => item.taskSelected)
  if (!expert) return null

  const removeLabel = `移除 ${expert.name}`

  return (
    <button
      type='button'
      title={removeLabel}
      aria-label={removeLabel}
      onClick={onRemoveExpert}
      data-testid={`capability-chip-expert-${expert.id}`}
      className={cn(
        'group/expert tl-chrome inline-flex h-7 min-w-0 max-w-[8rem] shrink items-center gap-1.5 rounded-full',
        'bg-transparent pe-2 ps-1 text-[13px] text-foreground/80 transition-colors',
        'hover:bg-[var(--wb-inset-strong)] hover:pe-1.5 hover:text-foreground',
        'focus-visible:bg-[var(--wb-inset-strong)] focus-visible:pe-1.5 focus-visible:text-foreground',
        'sm:max-w-[12rem]',
      )}
    >
      <span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors group-hover/expert:bg-[var(--wb-hover-strong)] group-focus-visible/expert:bg-[var(--wb-hover-strong)]'>
        <UserRound className='size-3.5' />
      </span>
      <span className='min-w-0 truncate'>{expert.name}</span>
      <span
        data-testid='capability-expert-remove'
        aria-hidden='true'
        className='flex w-0 shrink-0 items-center justify-center overflow-hidden opacity-0 group-hover/expert:w-3 group-hover/expert:opacity-100 group-focus-visible/expert:w-3 group-focus-visible/expert:opacity-100'
      >
        <X className='size-3 text-muted-foreground' />
      </span>
    </button>
  )
}

export type CapabilityInputSkillsProps = {
  snapshot: CapabilitySnapshot | null
  onRemoveSkill: (skillId: string) => void
}

export function CapabilityInputSkills({
  snapshot,
  onRemoveSkill,
}: CapabilityInputSkillsProps) {
  if (!snapshot) return null
  const selected = snapshot.skills.filter((skill) => skill.taskSelected)
  if (selected.length === 0) return null

  return (
    <>
      {selected.map((skill) => (
        <ComposerSkillChip
          key={skill.id}
          icon={<BookOpen className='size-3.5' />}
          label={skill.name}
          data-testid={`capability-chip-skill-${skill.id}`}
          onRemove={() => onRemoveSkill(skill.id)}
        />
      ))}
    </>
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
  const hasConnectors = showConnectors && selectedConnectors.length > 0
  if (!hasConnectors && !selectedExpert && selectedSkills.length === 0) {
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
