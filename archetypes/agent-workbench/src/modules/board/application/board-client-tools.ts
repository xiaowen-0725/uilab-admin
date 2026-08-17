/**
 * Renderer executor for client-side board_status / board_commit.
 */

import type { BoardContentPort } from '../ports/board-content-port'
import type { BoardJobRuntimePort } from '../ports/board-job-runtime-port'
import type { BoardStorePort } from '../ports/board-store-port'
import type { BoardPreviewPolicy } from './board-preview-policy'
import type { BoardRefreshController } from './board-refresh'
import { grantBoardCapability } from './board-capability'
import {
  commitBoardDraft,
  readBoardStatus,
  runCommittedJob,
  type BoardCommitInput,
  type BoardCommitOk,
  type BoardStatusInput,
} from './board-write-channel'

export const BOARD_CLIENT_TOOL_NAMES = ['board_status', 'board_commit'] as const

export type BoardClientToolName = (typeof BOARD_CLIENT_TOOL_NAMES)[number]

export function isBoardClientTool(name: string): name is BoardClientToolName {
  return (BOARD_CLIENT_TOOL_NAMES as readonly string[]).includes(name)
}

export type BoardCommitEffects = {
  preview?: BoardPreviewPolicy
  openPreview?: (input: {
    boardId: string
    title?: string
    turnId: string
    taskId: string
  }) => void
  jobRuntime?: BoardJobRuntimePort | null
  refresh?: BoardRefreshController
}

export type BoardClientToolExecutor = (input: {
  toolName: string
  args: unknown
  taskId: string
  turnId: string
}) => Promise<unknown>

function asRecord(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createBoardClientToolExecutor(input: {
  store: BoardStorePort
  content: BoardContentPort
  effects?: BoardCommitEffects
}): BoardClientToolExecutor {
  return async ({ toolName, args, taskId, turnId }) => {
    const rec = asRecord(args)
    if (toolName === 'board_status') {
      return readBoardStatus(input.store, input.content, {
        boardId: asString(rec.boardId),
      } satisfies BoardStatusInput)
    }
    if (toolName !== 'board_commit') {
      return {
        ok: false,
        error: 'validation_failed',
        hint: `未知的看板控制面工具：${toolName}`,
      }
    }

    const result = await commitBoardDraft(input.store, input.content, {
      boardId: asString(rec.boardId),
      newBoardTitle: asString(rec.newBoardTitle),
      widgetId: asString(rec.widgetId) ?? '',
      draftId: asString(rec.draftId) ?? asString(rec.widgetDraftId),
      contentHash: asString(rec.contentHash) ?? '',
      jobId: asString(rec.jobId),
      jobDraftId: asString(rec.jobDraftId),
      codeHash: asString(rec.codeHash),
      taskId,
    } satisfies BoardCommitInput)

    if (result.ok) {
      await grantBoardCapability(input.store, taskId)
      await applyCommitEffects(input.store, result, { taskId, turnId }, input.effects)
      const { replayed: _replayed, ...publicResult } = result
      return publicResult
    }
    return result
  }
}

async function applyCommitEffects(
  store: BoardStorePort,
  result: BoardCommitOk,
  scope: { taskId: string; turnId: string },
  effects?: BoardCommitEffects,
): Promise<void> {
  if (result.jobId && !result.replayed) {
    try {
      if (effects?.refresh) {
        await effects.refresh.refreshJob(result.jobId)
      } else if (effects?.jobRuntime) {
        await runCommittedJob(store, effects.jobRuntime, {
          jobId: result.jobId,
          widgetId: result.widgetId,
        })
      }
    } catch {
      // First-run is best-effort; commit already succeeded.
    }
  }

  const decision = effects?.preview?.decide(scope.turnId, scope.taskId) ?? 'open'
  if (decision === 'skip') return
  const board = await store.getBoard(result.boardId)
  effects?.openPreview?.({
    boardId: result.boardId,
    title: board?.title,
    turnId: scope.turnId,
    taskId: scope.taskId,
  })
}
