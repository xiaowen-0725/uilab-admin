/**
 * Board staging content pull (spec §5.1 / §10.2).
 * GET /board/staging/:draftId/content — same auth surface as tool execute.
 */

import type { Env, Hono, Schema } from 'hono'
import {
  authorizeSidecarToolSurface,
  resolveSidecarHttpToken,
} from './board-auth.js'
import type { BoardStaging } from './board-staging.js'
import {
  boardToolError,
  isBoardToolError,
  type BoardDraftKind,
} from './board-types.js'

function contentTypeFor(kind: BoardDraftKind): string {
  if (kind === 'widget') return 'text/html; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

export type MountBoardStagingRoutesInput = {
  staging: BoardStaging
  token?: string | null
  env?: Record<string, string | undefined>
}

export function mountBoardStagingRoutes<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, input: MountBoardStagingRoutesInput): void {
  const token = resolveSidecarHttpToken(input.env ?? process.env, input.token)

  app.get('/board/staging/:draftId/content', async (c) => {
    if (
      !authorizeSidecarToolSurface({
        authorization: c.req.header('authorization'),
        token,
      })
    ) {
      return c.json(
        boardToolError('not_authorized', '缺少或无效的本机侧车凭据，拒绝读取草稿'),
        401,
      )
    }

    const draftId = c.req.param('draftId')?.trim()
    if (!draftId) {
      return c.json(boardToolError('unknown_build', '缺少 draftId'), 400)
    }

    const result = await input.staging.readReadyContent(draftId)
    if (isBoardToolError(result)) {
      const status = result.error === 'unknown_build' ? 404 : 410
      return c.json(result, status)
    }

    c.header('Content-Type', contentTypeFor(result.kind))
    c.header('X-Content-Hash', result.hash)
    c.header('X-Byte-Length', String(result.bytes))
    c.header('X-Draft-Kind', result.kind)
    c.header('X-Draft-Title', encodeURIComponent(result.title))
    if (result.description) {
      c.header('X-Draft-Description', encodeURIComponent(result.description))
    }
    if (result.allowedHosts?.length) {
      c.header('X-Allowed-Hosts', result.allowedHosts.join(','))
    }
    if (result.widgetId) c.header('X-Widget-Id', result.widgetId)
    if (result.jobId) c.header('X-Job-Id', result.jobId)
    c.header('Cache-Control', 'no-store')
    return c.body(result.content)
  })

  app.get('/board/staging', async (c) => {
    if (
      !authorizeSidecarToolSurface({
        authorization: c.req.header('authorization'),
        token,
      })
    ) {
      return c.json(
        boardToolError('not_authorized', '缺少或无效的本机侧车凭据，拒绝读取草稿'),
        401,
      )
    }
    const drafts = await input.staging.listDrafts()
    return c.json({ drafts })
  })
}
