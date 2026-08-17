/**
 * Sidecar board content-plane tools (spec §5.2).
 * Chunked writes stay on disk; returns never include HTML, job source, or user data.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { BOARD_TOOL_DESCRIPTIONS } from './board-agent-contract.js'
import { BOARD_JOB_FINISH_TOOL } from './board-policy.js'
import {
  installFromFinishedDraft,
  type BoardJobStore,
} from './board-job-store.js'
import type { BoardStaging } from './board-staging.js'
import { isBoardToolError } from './board-types.js'
import {
  validateAllowedHosts,
  validateJobSource,
  validateWidgetSource,
} from './board-validation.js'

const widgetBeginParams = z.object({
  title: z.string().min(1).describe('小组件标题'),
  widgetId: z
    .string()
    .optional()
    .describe('改已有小组件时传入同一 id；新建可省略，必须使用返回的真实 id'),
})

const widgetAppendParams = z.object({
  widgetId: z.string().min(1),
  buildId: z.string().min(1),
  seq: z.number().int().describe('从 1 起严格递增；同内容重复 seq 幂等'),
  chunk: z.string().describe('2–4KB 的 HTML 分片，不要一次塞整份'),
})

const widgetFinishParams = z.object({
  widgetId: z.string().min(1),
  buildId: z.string().min(1),
})

const jobBeginParams = z.object({
  widgetId: z.string().min(1),
  title: z.string().min(1).describe('用户可见的作业标题'),
  description: z.string().min(1).describe('用户可见的作业说明'),
  allowedHosts: z
    .array(z.string().min(1))
    .min(1)
    .describe('作业可访问的主机名清单，审批后写入白名单'),
})

const jobAppendParams = z.object({
  jobId: z.string().min(1),
  buildId: z.string().min(1),
  seq: z.number().int(),
  chunk: z.string().describe('2–4KB 的作业代码分片'),
})

const jobFinishParams = z.object({
  jobId: z.string().min(1),
  buildId: z.string().min(1),
})

function widgetDraft(widgetId: string, buildId: string) {
  return {
    buildId,
    expectedKind: 'widget' as const,
    ownerId: widgetId,
    ownerField: 'widgetId' as const,
  }
}

function jobDraft(jobId: string, buildId: string) {
  return {
    buildId,
    expectedKind: 'job' as const,
    ownerId: jobId,
    ownerField: 'jobId' as const,
  }
}

export function createBoardTools(staging: BoardStaging, jobs: BoardJobStore) {
  const board_widget_begin = createTool({
    name: 'board_widget_begin',
    description: BOARD_TOOL_DESCRIPTIONS.board_widget_begin,
    parameters: widgetBeginParams,
    needsApproval: false,
    execute: async ({ title, widgetId }) =>
      staging.beginWidget({ title, widgetId }),
  })

  const board_widget_append = createTool({
    name: 'board_widget_append',
    description: BOARD_TOOL_DESCRIPTIONS.board_widget_append,
    parameters: widgetAppendParams,
    needsApproval: false,
    execute: async ({ widgetId, buildId, seq, chunk }) =>
      staging.append({ ...widgetDraft(widgetId, buildId), seq, chunk }),
  })

  const board_widget_finish = createTool({
    name: 'board_widget_finish',
    description: BOARD_TOOL_DESCRIPTIONS.board_widget_finish,
    parameters: widgetFinishParams,
    needsApproval: false,
    execute: async ({ widgetId, buildId }) => {
      const result = await staging.finish({
        ...widgetDraft(widgetId, buildId),
        validate: validateWidgetSource,
      })
      if (isBoardToolError(result)) return result
      return {
        widgetId,
        contentHash: result.hash,
        bytes: result.bytes,
      }
    },
  })

  const board_job_begin = createTool({
    name: 'board_job_begin',
    description: BOARD_TOOL_DESCRIPTIONS.board_job_begin,
    parameters: jobBeginParams,
    needsApproval: false,
    execute: async ({ widgetId, title, description, allowedHosts }) => {
      const hosts = validateAllowedHosts(allowedHosts)
      if (hosts.ok !== true) return hosts
      return staging.beginJob({ widgetId, title, description, allowedHosts })
    },
  })

  const board_job_append = createTool({
    name: 'board_job_append',
    description: BOARD_TOOL_DESCRIPTIONS.board_job_append,
    parameters: jobAppendParams,
    needsApproval: false,
    execute: async ({ jobId, buildId, seq, chunk }) =>
      staging.append({ ...jobDraft(jobId, buildId), seq, chunk }),
  })

  const board_job_finish = createTool({
    name: BOARD_JOB_FINISH_TOOL,
    description: BOARD_TOOL_DESCRIPTIONS.board_job_finish,
    parameters: jobFinishParams,
    needsApproval: true,
    execute: async ({ jobId, buildId }) => {
      const result = await staging.finish({
        ...jobDraft(jobId, buildId),
        validate: (content, meta) => {
          const hosts = validateAllowedHosts(meta.allowedHosts ?? [])
          if (hosts.ok !== true) return hosts
          return validateJobSource(content)
        },
      })
      if (isBoardToolError(result)) return result
      const installed = await jobs.install(installFromFinishedDraft(jobId, result))
      if (isBoardToolError(installed)) return installed
      return {
        jobId,
        codeHash: result.hash,
      }
    },
  })

  return {
    board_widget_begin,
    board_widget_append,
    board_widget_finish,
    board_job_begin,
    board_job_append,
    board_job_finish,
  }
}

export type BoardTools = ReturnType<typeof createBoardTools>

export function boardToolsList(tools: BoardTools): Array<BoardTools[keyof BoardTools]> {
  return Object.values(tools)
}

