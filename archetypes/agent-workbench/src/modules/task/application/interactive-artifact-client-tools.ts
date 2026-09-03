/**
 * Renderer executor for client-side interactive_commit.
 */

import { isInteractiveClientTool } from './interactive-artifact-agent-contract'
import {
  commitInteractiveDraft,
  type InteractiveArtifactCommitInput,
  type InteractiveArtifactCommitOk,
} from './interactive-artifact-write-channel'
import type { InteractiveArtifactContentPort } from '../ports/interactive-artifact-content-port'
import type { InteractiveArtifactStorePort } from '../ports/interactive-artifact-store-port'

export type InteractiveArtifactClientToolExecutor = (input: {
  toolName: string
  args: unknown
  taskId: string
  turnId: string
}) => Promise<unknown>

export type InteractiveArtifactCommitEffects = {
  onCommitted?: (input: {
    taskId: string
    turnId: string
    artifactId: string
    title: string
    updated: boolean
    replayed: boolean
  }) => void
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createInteractiveArtifactClientToolExecutor(input: {
  store: InteractiveArtifactStorePort
  content: InteractiveArtifactContentPort
  effects?: InteractiveArtifactCommitEffects
}): InteractiveArtifactClientToolExecutor {
  return async ({ toolName, args, taskId, turnId }) => {
    if (!isInteractiveClientTool(toolName)) {
      return {
        ok: false,
        error: 'validation_failed',
        hint: `未知的交互产物控制面工具：${toolName}`,
      }
    }

    const rec = asRecord(args)
    const result = await commitInteractiveDraft(input.store, input.content, {
      taskId,
      artifactId: asString(rec.artifactId),
      draftId: asString(rec.draftId) ?? '',
      contentHash: asString(rec.contentHash) ?? '',
      title: asString(rec.title) ?? '',
    } satisfies InteractiveArtifactCommitInput)

    if (result.ok) {
      notifyCommitted(result, { taskId, turnId }, input.effects)
    }
    return result
  }
}

function notifyCommitted(
  result: InteractiveArtifactCommitOk,
  scope: { taskId: string; turnId: string },
  effects?: InteractiveArtifactCommitEffects,
): void {
  effects?.onCommitted?.({
    taskId: scope.taskId,
    turnId: scope.turnId,
    artifactId: result.artifactId,
    title: result.title,
    updated: result.updated,
    replayed: Boolean(result.replayed),
  })
}
