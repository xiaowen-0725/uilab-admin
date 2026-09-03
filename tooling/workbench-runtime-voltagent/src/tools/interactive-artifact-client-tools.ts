/**
 * Client-side Interactive Artifact control-plane tool.
 * Schema only — no execute, no needsApproval. The renderer pulls staging
 * and writes the Task library, then resumes with a scalar result.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { INTERACTIVE_TOOL_DESCRIPTIONS } from './interactive-artifact-agent-contract.js'

export const interactiveCommitTool = createTool({
  name: 'interactive_commit',
  description: INTERACTIVE_TOOL_DESCRIPTIONS.interactive_commit,
  parameters: z.object({
    draftId: z.string().min(1).describe('finish 使用的 draftId，用于拉取 HTML'),
    contentHash: z
      .string()
      .min(1)
      .describe('interactive_finish 返回的 contentHash'),
    title: z.string().min(1).describe('交互产物标题'),
    artifactId: z
      .string()
      .optional()
      .describe('更新同一份时必带上次返回的 artifactId；新建可省略'),
  }),
})

export const interactiveClientTools = [interactiveCommitTool]
