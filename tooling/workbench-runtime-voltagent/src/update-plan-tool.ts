/**
 * Shared Plan tool for both sidecar profiles.
 * Stateless: no disk, no stored snapshot, no approval.
 * State-machine rules live in description + instructions, not the handler.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'

export const PLAN_TOOL_INSTRUCTIONS = [
  'Use update_plan for non-trivial, multi-stage tasks.',
  'Write each step as a one-sentence phrase.',
  'Never create a single-step plan.',
  'Keep exactly one step in_progress at a time.',
  'Mark a step completed immediately when it is done.',
  'If blocked, leave the step in_progress; do not mark it completed.',
  'Before finishing, resolve every step so none remain hanging.',
  'When you change the plan, include an explanation.',
  'Use the tool proactively and often.',
  "Write step text in the user's language (Chinese first when the user writes Chinese).",
].join(' ')

const planItemSchema = z.strictObject({
  step: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed']),
})

export const updatePlanTool = createTool({
  name: 'update_plan',
  description:
    'Updates the task plan. Provide an optional explanation and a list of plan items, each with a step and status. At most one step can be in_progress at a time.',
  parameters: z.strictObject({
    explanation: z.string().optional(),
    plan: z.array(planItemSchema),
  }),
  needsApproval: false,
  execute: async () =>
    'Plan updated. Continue to keep it updated as you progress.',
})
