/**
 * Client-side Question Request tool.
 * No execute / no needsApproval: the model call suspends until the Workbench
 * posts the user's structured answer as this tool's output.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'

export const ASK_TOOL_INSTRUCTIONS = [
  'When you face a decision with multiple reasonable options that only the user can settle',
  '(scope, preference, ambiguous requirement), call ask_user_question instead of guessing or asking in plain text.',
  'Ask exactly one question per call, keep options short and concrete, put your recommended option first,',
  'and never call it for decisions you can resolve yourself or for confirmations of work already requested.',
  'After a skipped answer, proceed with your recommendation without asking again.',
].join(' ')

export const askUserQuestionTool = createTool({
  name: 'ask_user_question',
  description:
    'Ask the user one structured multiple-choice question and pause until they answer. ' +
    'Use only when you are blocked on a decision that is genuinely the user\'s to make and cannot be resolved from context. ' +
    'Provide 2-5 mutually distinct options. The user may also answer with free text ("other"), skip the question, or reply directly in the composer. ' +
    'The result is { status: "answered", selected: [{id,label}], other? } | { status: "skipped" } | { status: "replied", text }. ' +
    'If skipped, proceed with your own recommended choice.',
  parameters: z.object({
    question: z
      .string()
      .describe('The question to ask the user, in the conversation language (Chinese-first)'),
    options: z
      .array(z.object({ id: z.string(), label: z.string() }))
      .min(2)
      .describe('2-5 candidate answers, mutually distinct; put the recommended option first'),
    allow_multiple: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether the user may select multiple options'),
  }),
})
