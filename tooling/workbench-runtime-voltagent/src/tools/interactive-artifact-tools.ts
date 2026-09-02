/**
 * Sidecar Interactive Artifact content-plane tools.
 * Chunked writes stay on disk; returns never include HTML.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { INTERACTIVE_TOOL_DESCRIPTIONS } from './interactive-artifact-agent-contract.js'
import {
  isInteractiveToolError,
  toInteractiveModelOutput,
} from './interactive-artifact-types.js'
import type { InteractiveArtifactStaging } from './interactive-artifact-staging.js'

function toModelOutput({ output }: { output: unknown }): {
  type: 'json'
  value: unknown
} {
  return toInteractiveModelOutput(output)
}

const beginParams = z.object({
  title: z.string().optional().describe('交互产物标题，可在 commit 时再定'),
  artifactId: z
    .string()
    .optional()
    .describe('改已有产物时传入同一 id；新建可省略，必须使用返回的真实 id'),
})

const appendParams = z.object({
  artifactId: z.string().min(1).describe('begin 返回的真实 artifactId'),
  draftId: z.string().min(1).describe('begin 返回的真实 draftId'),
  seq: z.number().int().describe('从 1 起严格递增；同内容重复 seq 幂等'),
  chunk: z.string().describe('2–4KB 的 HTML 分片，不要一次塞整份'),
})

const finishParams = z.object({
  artifactId: z.string().min(1),
  draftId: z.string().min(1),
})

export function createInteractiveArtifactTools(staging: InteractiveArtifactStaging) {
  const interactive_begin = createTool({
    name: 'interactive_begin',
    description: INTERACTIVE_TOOL_DESCRIPTIONS.interactive_begin,
    parameters: beginParams,
    needsApproval: false,
    execute: async ({ title, artifactId }) =>
      staging.begin({ title, artifactId }),
    toModelOutput,
  })

  const interactive_append = createTool({
    name: 'interactive_append',
    description: INTERACTIVE_TOOL_DESCRIPTIONS.interactive_append,
    parameters: appendParams,
    needsApproval: false,
    execute: async ({ artifactId, draftId, seq, chunk }) =>
      staging.append({ artifactId, draftId, seq, chunk }),
    toModelOutput,
  })

  const interactive_finish = createTool({
    name: 'interactive_finish',
    description: INTERACTIVE_TOOL_DESCRIPTIONS.interactive_finish,
    parameters: finishParams,
    needsApproval: false,
    execute: async ({ artifactId, draftId }) => {
      const result = await staging.finish({ artifactId, draftId })
      if (isInteractiveToolError(result)) return result
      return {
        artifactId: result.artifactId,
        contentHash: result.hash,
        bytes: result.bytes,
      }
    },
    toModelOutput,
  })

  return {
    interactive_begin,
    interactive_append,
    interactive_finish,
  }
}

export type InteractiveArtifactTools = ReturnType<
  typeof createInteractiveArtifactTools
>

export function interactiveArtifactToolsList(
  tools: InteractiveArtifactTools,
): Array<InteractiveArtifactTools[keyof InteractiveArtifactTools]> {
  return Object.values(tools)
}
