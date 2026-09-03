/**
 * GET /interactive/staging/:draftId/content — same auth surface as tool execute.
 */

import type { Env, Hono, Schema } from 'hono'
import {
  authorizeSidecarToolSurface,
  resolveSidecarHttpToken,
} from './board-auth.js'
import type { InteractiveArtifactStaging } from './interactive-artifact-staging.js'
import {
  interactiveToolError,
  isInteractiveToolError,
} from './interactive-artifact-types.js'

export type MountInteractiveArtifactRoutesInput = {
  staging: InteractiveArtifactStaging
  token?: string | null
  env?: Record<string, string | undefined>
}

export function mountInteractiveArtifactRoutes<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, input: MountInteractiveArtifactRoutesInput): void {
  const token = resolveSidecarHttpToken(input.env ?? process.env, input.token)

  app.get('/interactive/staging/:draftId/content', async (c) => {
    if (
      !authorizeSidecarToolSurface({
        authorization: c.req.header('authorization'),
        token,
      })
    ) {
      return c.json(
        interactiveToolError(
          'not_authorized',
          '缺少或无效的本机侧车凭据，拒绝读取草稿',
        ),
        401,
      )
    }

    const draftId = c.req.param('draftId')?.trim()
    if (!draftId) {
      return c.json(interactiveToolError('unknown_build', '缺少 draftId'), 400)
    }

    const result = await input.staging.readReadyContent(draftId)
    if (isInteractiveToolError(result)) {
      const status = result.error === 'unknown_build' ? 404 : 410
      return c.json(result, status)
    }

    c.header('Content-Type', 'text/html; charset=utf-8')
    c.header('X-Content-Hash', result.hash)
    c.header('X-Byte-Length', String(result.bytes))
    c.header('X-Draft-Title', encodeURIComponent(result.title))
    c.header('X-Artifact-Id', result.artifactId)
    c.header('Cache-Control', 'no-store')
    return c.body(result.content)
  })
}
