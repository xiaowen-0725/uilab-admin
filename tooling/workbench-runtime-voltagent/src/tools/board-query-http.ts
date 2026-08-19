/**
 * Board query catalog + execute routes (ADR-0024 §2 / #146).
 * Same auth surface as job HTTP. Not registered as tools. No Task required.
 * Request body is query params only — no code, no credentials.
 */

import type { Context, Env, Hono, Schema } from 'hono'
import type { QueryCatalogEntry } from '../plugin/query-catalog.js'
import type { QueryHandler } from '../plugin/plugin-package.js'
import {
  authorizeSidecarToolSurface,
  resolveSidecarHttpToken,
} from './board-auth.js'
import {
  executeBoardQuery,
  type BoardQueryErrorCode,
  type BoardQueryFailure,
} from './board-query-executor.js'
import type { ProductIdentityPort } from './board-query-identity.js'

export type BoardQueryRuntime = {
  catalog: QueryCatalogEntry[]
  handlers: Record<string, QueryHandler>
  identity: ProductIdentityPort
}

export type MountBoardQueryRoutesInput = {
  getQueries: () => BoardQueryRuntime
  token?: string | null
  env?: Record<string, string | undefined>
}

const HTTP_STATUS: Record<BoardQueryErrorCode, 400 | 403 | 404> = {
  unknown_query: 404,
  missing_required_permissions: 403,
  resource_not_authorized: 403,
  permission_denied: 403,
  invalid_resource_parameter: 400,
  output_too_large: 400,
  validation_failed: 400,
  upstream_failed: 400,
}

const BODY_KEYS = new Set(['params'])

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

function rejectQuery(c: Context, result: BoardQueryFailure): Response {
  return c.json(result, HTTP_STATUS[result.error])
}

function publicCatalog(catalog: readonly QueryCatalogEntry[]) {
  return catalog.map((entry) => ({
    pluginId: entry.pluginId,
    name: entry.name,
    title: entry.title,
    parameters: entry.parameters,
    requiredPermissions: entry.requiredPermissions,
    referencableByJob: entry.referencableByJob,
  }))
}

export function mountBoardQueryRoutes<
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(app: Hono<E, S, BasePath>, input: MountBoardQueryRoutesInput): void {
  const token = resolveSidecarHttpToken(input.env ?? process.env, input.token)

  app.get('/board/queries', (c) => {
    const denied = rejectUnauthorized(
      c,
      token,
      '缺少或无效的本机侧车凭据，拒绝读取查询目录',
    )
    if (denied) return denied
    const queries = input.getQueries()
    const body = { queries: publicCatalog(queries.catalog) }
    const json = JSON.stringify(body)
    if (queries.identity.containsCredential(json)) {
      return c.json(
        { ok: false, error: 'validation_failed', hint: '查询目录含有身份凭据，已拒绝回传' },
        400,
      )
    }
    return c.json(body)
  })

  app.post('/board/queries/:name/run', async (c) => {
    const denied = rejectUnauthorized(
      c,
      token,
      '缺少或无效的本机侧车凭据，拒绝执行查询',
    )
    if (denied) return denied
    const name = c.req.param('name')?.trim()
    if (!name) {
      return rejectQuery(c, {
        ok: false,
        error: 'unknown_query',
        hint: '缺少查询名称',
      })
    }

    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return rejectQuery(c, {
        ok: false,
        error: 'validation_failed',
        hint: '执行请求体必须是 JSON',
      })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return rejectQuery(c, {
        ok: false,
        error: 'validation_failed',
        hint: '执行请求体必须是对象',
      })
    }
    for (const key of Object.keys(body)) {
      if (!BODY_KEYS.has(key)) {
        return rejectQuery(c, {
          ok: false,
          error: 'validation_failed',
          hint: '执行请求只接受 params，拒绝代码或凭据字段',
        })
      }
    }
    const params = body.params
    if (params != null && (typeof params !== 'object' || Array.isArray(params))) {
      return rejectQuery(c, {
        ok: false,
        error: 'validation_failed',
        hint: 'params 必须是对象',
      })
    }

    const queries = input.getQueries()
    const result = await executeBoardQuery({
      name,
      params: (params ?? {}) as Record<string, unknown>,
      catalog: queries.catalog,
      handlers: queries.handlers,
      identity: queries.identity,
    })
    const encoded = JSON.stringify(result)
    if (queries.identity.containsCredential(encoded)) {
      return rejectQuery(c, {
        ok: false,
        error: 'validation_failed',
        hint: '查询响应含有身份凭据，已拒绝回传',
      })
    }
    if (!result.ok) return rejectQuery(c, result)
    return c.json(result)
  })
}
