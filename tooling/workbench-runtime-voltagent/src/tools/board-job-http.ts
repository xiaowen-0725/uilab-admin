/**
 * Board job execution routes (spec §7.6 / §8.2 / §10.2).
 * Same auth surface as tool-adjacent HTTP. Not registered as tools.
 */

import type { Env, Hono, Schema } from 'hono'
import {
  authorizeSidecarToolSurface,
  resolveSidecarHttpToken,
} from './board-auth.js'
import type { BoardJobExecutor } from './board-job-executor.js'
import type { BoardJobStore } from './board-job-store.js'
import { boardToolError, isBoardToolError } from './board-types.js'

export type MountBoardJobRoutesInput = {
  jobs: BoardJobStore
  executor: BoardJobExecutor
  token?: string | null
  env?: Record<string, string | undefined>
}

function httpStatusFor(error: string): 400 | 401 | 404 | 409 | 503 {
  if (error === 'not_authorized') return 401
  if (error === 'unknown_job') return 404
  if (error === 'deno_not_found' || error === 'runtime_unavailable') return 503
  if (
    error === 'not_approved' ||
    error === 'code_hash_mismatch' ||
    error === 'already_running' ||
    error === 'hash_mismatch'
  ) {
    return 409
  }
  return 400
}

export function mountBoardJobRoutes<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, input: MountBoardJobRoutesInput): void {
  const token = resolveSidecarHttpToken(input.env ?? process.env, input.token)

  const deny = (c: { req: { header: (name: string) => string | undefined } }) =>
    !authorizeSidecarToolSurface({
      authorization: c.req.header('authorization'),
      token,
    })

  app.post('/board/jobs/:jobId/install', async (c) => {
    if (deny(c)) {
      return c.json(
        boardToolError('not_authorized', '缺少或无效的本机侧车凭据，拒绝安装作业'),
        401,
      )
    }
    const jobId = c.req.param('jobId')?.trim()
    if (!jobId) {
      return c.json(boardToolError('unknown_job', '缺少 jobId'), 400)
    }
    let body: {
      widgetId?: string
      code?: string
      codeHash?: string
      allowedHosts?: string[]
      timeoutMs?: number
    }
    try {
      body = (await c.req.json()) as typeof body
    } catch {
      return c.json(boardToolError('validation_failed', '安装请求体必须是 JSON'), 400)
    }
    const result = await input.jobs.install({
      jobId,
      widgetId: body.widgetId ?? '',
      code: body.code ?? '',
      codeHash: body.codeHash ?? '',
      allowedHosts: Array.isArray(body.allowedHosts) ? body.allowedHosts : [],
      timeoutMs: body.timeoutMs,
    })
    if (isBoardToolError(result)) {
      return c.json(result, httpStatusFor(result.error))
    }
    return c.json({ ok: true, jobId, codeHash: result.codeHash })
  })

  app.post('/board/jobs/:jobId/run', async (c) => {
    if (deny(c)) {
      return c.json(
        boardToolError('not_authorized', '缺少或无效的本机侧车凭据，拒绝执行作业'),
        401,
      )
    }
    const jobId = c.req.param('jobId')?.trim()
    if (!jobId) {
      return c.json(boardToolError('unknown_job', '缺少 jobId'), 400)
    }
    const started = await input.executor.startRun(jobId)
    if (isBoardToolError(started)) {
      return c.json(started, httpStatusFor(started.error))
    }
    return c.json({ runId: started.runId }, 202)
  })

  app.get('/board/runs/:runId', (c) => {
    if (deny(c)) {
      return c.json(
        boardToolError('not_authorized', '缺少或无效的本机侧车凭据，拒绝读取运行'),
        401,
      )
    }
    const runId = c.req.param('runId')?.trim()
    const run = runId ? input.executor.getRun(runId) : undefined
    if (!run) {
      return c.json(boardToolError('unknown_job', '未知的 runId'), 404)
    }
    return c.json(run)
  })

  app.post('/board/runs/:runId/cancel', async (c) => {
    if (deny(c)) {
      return c.json(
        boardToolError('not_authorized', '缺少或无效的本机侧车凭据，拒绝取消运行'),
        401,
      )
    }
    const runId = c.req.param('runId')?.trim()
    if (!runId) {
      return c.json(boardToolError('unknown_job', '缺少 runId'), 400)
    }
    const result = await input.executor.cancel(runId)
    if (isBoardToolError(result)) {
      return c.json(result, httpStatusFor(result.error))
    }
    return c.json(result)
  })
}
