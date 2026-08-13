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

function isPlanStepStatus(value: unknown): value is PlanStepStatus {
  return (
    value === 'pending' || value === 'in_progress' || value === 'completed'
  )
}

function parseStep(entry: unknown): PlanStep | null {
  if (typeof entry === 'string' && entry.length > 0) {
    return { step: entry, status: 'pending' }
  }
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
    return null
  }
  const rec = entry as Record<string, unknown>
  const step = typeof rec.step === 'string' ? rec.step : ''
  if (step.length === 0) return null
  return {
    step,
    status: isPlanStepStatus(rec.status) ? rec.status : 'pending',
  }
}

export function parsePlanSnapshot(payload: unknown): PlanSnapshot {
  const rec =
    payload != null && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const explanation =
    typeof rec.explanation === 'string' && rec.explanation.length > 0
      ? rec.explanation
      : undefined
  const rawSteps = Array.isArray(rec.steps) ? rec.steps : []
  const steps: PlanStep[] = []
  for (const entry of rawSteps) {
    const parsed = parseStep(entry)
    if (parsed) steps.push(parsed)
  }
  const completed = steps.filter((step) => step.status === 'completed').length
  return explanation === undefined
    ? { steps, progress: { completed, total: steps.length } }
    : {
        explanation,
        steps,
        progress: { completed, total: steps.length },
      }
}
