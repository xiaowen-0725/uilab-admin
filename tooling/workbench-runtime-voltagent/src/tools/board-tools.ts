/**
 * Sidecar board content-plane tools (spec §5.2).
 * Chunked writes stay on disk; returns never include HTML, job source, or user data.
 */

import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { BOARD_JOB_FINISH_TOOL } from './board-policy.js'
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

export function createBoardTools(staging: BoardStaging) {
  const board_widget_begin = createTool({
    name: 'board_widget_begin',
    description:
      '开始一块看板小组件的分片写入。内容落在侧车 staging，不进用户工作区，也不进 IndexedDB。' +
      '传入 title；若要改已有小组件则带上同一 widgetId。必须使用返回的 widgetId 与 buildId，禁止编造。' +
      '随后按 seq 从 1 连续调用 board_widget_append（每片 2–4KB），最后 board_widget_finish。' +
      '返回只有 id，不含 HTML。小组件不能联网，外部数据一律经取数作业。',
    parameters: widgetBeginParams,
    needsApproval: false,
    execute: async ({ title, widgetId }) =>
      staging.beginWidget({ title, widgetId }),
  })

  const board_widget_append = createTool({
    name: 'board_widget_append',
    description:
      '向当前小组件草稿追加一片 HTML。seq 必须从 1 严格递增；模型重试时，同内容的重复 seq 会被幂等忽略，' +
      '不同内容则报错。乱序会指明缺哪一段，只补那一段，不要整份重写。返回 received 与 nextSeq，不含 HTML。',
    parameters: widgetAppendParams,
    needsApproval: false,
    execute: async ({ widgetId, buildId, seq, chunk }) =>
      staging.append({ ...widgetDraft(widgetId, buildId), seq, chunk }),
  })

  const board_widget_finish = createTool({
    name: 'board_widget_finish',
    description:
      '结束小组件分片写入并做静态校验：必须单文件自洽、调用 widget.ready()、读取 widget.data 或注册 onDataChange，' +
      '禁止 fetch/XHR/WebSocket/eval/new Function 与外链 src/href。失败只回错误码与一句 hint。' +
      '同一草稿最多自修 2 次。成功返回 widgetId、contentHash、bytes，绝不回 HTML。',
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
    description:
      '开始为指定小组件编写取数作业。allowedHosts 必须在此刻声明，之后与代码一起进入 board_job_finish 审批。' +
      '作业是零依赖单文件，导出 run(ctx)，只能访问声明过的主机。返回 jobId 与 buildId，必须原样使用。',
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
    description:
      '向当前取数作业草稿追加一片代码。seq 规则与 board_widget_append 相同：从 1 连续，同内容重复幂等，' +
      '不同内容或乱序报错并指明缺段。返回 received 与 nextSeq，不含代码正文。',
    parameters: jobAppendParams,
    needsApproval: false,
    execute: async ({ jobId, buildId, seq, chunk }) =>
      staging.append({ ...jobDraft(jobId, buildId), seq, chunk }),
  })

  const board_job_finish = createTool({
    name: BOARD_JOB_FINISH_TOOL,
    description:
      '结束作业分片写入、静态校验并请求用户批准。必须 export function run(ctx)，禁止 import、Deno.env、Deno.run 与路径逃逸。' +
      '这是唯一授予新网络能力的动作：批准后同一份代码可被重复执行而不再逐次确认（运行时另票交付）。' +
      '失败只回错误码与 hint；成功返回 jobId 与 codeHash，不含代码。' +
      '同一草稿最多自修 2 次。这是 board 族唯一需要审批的工具。',
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

