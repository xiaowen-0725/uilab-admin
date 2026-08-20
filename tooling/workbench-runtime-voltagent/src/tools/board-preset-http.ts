/**
 * Preset board catalog route (ADR-0024 §5 / #148).
 * Same auth surface as query HTTP. HTML is content, not executed here.
 */

import type { Context, Env, Hono, Schema } from 'hono'
import type { PresetBoardCatalogEntry } from '../plugin/preset-board-catalog.js'
import {
  authorizeSidecarToolSurface,
  resolveSidecarHttpToken,
} from './board-auth.js'
import type { ProductIdentityPort } from './board-query-identity.js'

export type BoardPresetRuntime = {
  boards: PresetBoardCatalogEntry[]
  identity: ProductIdentityPort
}

export type MountBoardPresetRoutesInput = {
  getPresets: () => BoardPresetRuntime
  token?: string | null
  env?: Record<string, string | undefined>
}

function rejectUnauthorized(
  c: Context,
  token: string | null,
  hint: string,
): Response | null {
  if (authorizeSidecarToolSurface({ authorization: c.req.header('authorization'), token })) {
    return null
  }
  return c.json({ ok: false, error: 'not_authorized', hint }, 401)
}

function publicCatalog(boards: readonly PresetBoardCatalogEntry[]) {
  return boards.map((board) => ({
    pluginId: board.pluginId,
    presetId: board.presetId,
    version: board.version,
    title: board.title,
    purpose: board.purpose,
    widgets: board.widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      html: widget.html,
      placement: widget.placement,
      span: widget.span,
      queryName: widget.queryName,
      parameters: widget.parameters,
      parameterSchema: widget.parameterSchema,
      requiredPermissions: widget.requiredPermissions,
      referencableByJob: widget.referencableByJob,
      trigger: widget.trigger,
    })),
  }))
}

export function mountBoardPresetRoutes<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, input: MountBoardPresetRoutesInput): void {
  const token = resolveSidecarHttpToken(input.env ?? process.env, input.token)

  app.get('/board/presets', (c) => {
    const denied = rejectUnauthorized(
      c,
      token,
      '缺少或无效的本机侧车凭据，拒绝读取预置看板目录',
    )
    if (denied) return denied
    const presets = input.getPresets()
    const body = { presetBoards: publicCatalog(presets.boards) }
    const json = JSON.stringify(body)
    if (presets.identity.containsCredential(json)) {
      return c.json(
        { ok: false, error: 'validation_failed', hint: '预置看板目录含有身份凭据，已拒绝回传' },
        400,
      )
    }
    return c.json(body)
  })
}
