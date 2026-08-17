/**
 * Client-side board control-plane tools (spec §5.2).
 * Schema only — no execute, no needsApproval. The renderer pulls staging
 * and writes IndexedDB, then resumes with a scalar result.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'

export const boardStatusTool = createTool({
  name: 'board_status',
  description:
    '只读查看当前看板：已落库的板与小组件、每板剩余额度、目标板是否存在、侧车未提交草稿。' +
    '权威在渲染层 IndexedDB，不要猜测已有哪些小组件。新建前先调用本工具决定追加还是建新板。' +
    '不得与 board_commit 并行调用。返回只有 id / 计数 / hash，不含 HTML。',
  parameters: z.object({
    boardId: z.string().optional().describe('若要确认某块板是否存在则传入'),
  }),
})

export const boardCommitTool = createTool({
  name: 'board_commit',
  description:
    '把已 finish 的小组件（及可选作业）一次提交进 IndexedDB。传入 widget 的 buildId 作为 draftId，以及 finish 返回的 contentHash。' +
    '若有作业，再传 jobId、jobDraftId（作业 buildId）与 codeHash；作业必须已经 board_job_finish 并获批。' +
    'boardId 缺省时用 newBoardTitle 建新板。一次调用写完，禁止并行、禁止分片提交。' +
    '返回 boardId / widgetId / mountId / placement，绝不含 HTML 或作业代码。宿主会在当前对话打开预览；作业运行时接通后才会首跑。',
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
