/**
 * Client-side board control-plane tools (spec §5.2).
 * Schema only — no execute, no needsApproval. The renderer pulls staging
 * and writes IndexedDB, then resumes with a scalar result.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { BOARD_TOOL_DESCRIPTIONS } from './board-agent-contract.js'

export const boardStatusTool = createTool({
  name: 'board_status',
  description: BOARD_TOOL_DESCRIPTIONS.board_status,
  parameters: z.object({
    boardId: z.string().optional().describe('若要确认某块板是否存在则传入'),
  }),
})

export const boardCommitTool = createTool({
  name: 'board_commit',
  description: BOARD_TOOL_DESCRIPTIONS.board_commit,
  parameters: z.object({
    boardId: z.string().optional().describe('追加到已有板时传入'),
    newBoardTitle: z.string().optional().describe('boardId 缺省时的新板标题'),
    widgetId: z.string().min(1).describe('begin 返回的真实 widgetId'),
    draftId: z.string().min(1).describe('widget 的 buildId，用于拉取 HTML'),
    contentHash: z.string().min(1).describe('board_widget_finish 返回的 contentHash'),
    jobId: z.string().optional().describe('可选作业 id'),
    jobDraftId: z.string().optional().describe('作业的 buildId'),
    codeHash: z.string().optional().describe('board_job_finish 返回的 codeHash'),
  }),
})

export const boardClientTools = [boardStatusTool, boardCommitTool]
