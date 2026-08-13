/**
 * Plan snapshot parse + derived progress. Leaf: no React.
 *
 * Latest `plan.updated` is the full table. Legacy `steps: string[]` is
 * tolerated as all-pending.
 */

export const PLAN_STEP_STATUSES = ['pending', 'in_progress', 'completed'] as const

export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number]

export interface PlanStep {
  step: string
  status: PlanStepStatus
}

export interface PlanProgress {
  completed: number
  total: number
}

export interface PlanSnapshot {
  explanation?: string
  steps: PlanStep[]
  progress: PlanProgress
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function isPlanStepStatus(value: unknown): value is PlanStepStatus {
  return (PLAN_STEP_STATUSES as readonly string[]).includes(value as string)
}

function parseStep(entry: unknown): PlanStep | null {
  if (typeof entry === 'string' && entry.length > 0) {
    return { step: entry, status: 'pending' }
  }
  const rec = asRecord(entry)
  const step = typeof rec.step === 'string' ? rec.step : ''
  if (step.length === 0) return null
  return {
    step,
    status: isPlanStepStatus(rec.status) ? rec.status : 'pending',
  }
}

export function parsePlanSnapshot(payload: unknown): PlanSnapshot {
  const rec = asRecord(payload)
  const explanation =
    typeof rec.explanation === 'string' && rec.explanation.length > 0
      ? rec.explanation
      : undefined
  const rawSteps = Array.isArray(rec.steps) ? rec.steps : []
  const steps = rawSteps
    .map(parseStep)
    .filter((step): step is PlanStep => step !== null)
  const snapshot: PlanSnapshot = {
    steps,
    progress: {
      completed: steps.filter((step) => step.status === 'completed').length,
      total: steps.length,
    },
  }
  if (explanation !== undefined) snapshot.explanation = explanation
  return snapshot
}
