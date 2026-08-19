/**
 * Fail-closed query execution (ADR-0024 §2).
 * Validates membership + requiredPermissions independently of the renderer.
 */

import { BOARD_JOB_RESULT_MAX_BYTES } from './board-job-store.js'
import type { QueryCatalogEntry } from '../plugin/query-catalog.js'
import type { QueryHandler } from '../plugin/plugin-package.js'
import type {
  ProductIdentityPort,
  QueryAuthorizedResource,
  QueryAuthorization,
} from './board-query-identity.js'

export type BoardQueryErrorCode =
  | 'unknown_query'
  | 'missing_required_permissions'
  | 'resource_not_authorized'
  | 'permission_denied'
  | 'invalid_resource_parameter'
  | 'output_too_large'
  | 'validation_failed'
  | 'upstream_failed'

export type BoardQueryOk = { ok: true; payload: unknown }
export type BoardQueryFailure = {
  ok: false
  error: BoardQueryErrorCode
  hint: string
}
export type BoardQueryResult = BoardQueryOk | BoardQueryFailure

export type ExecuteBoardQueryInput = {
  name: string
  params: Record<string, unknown>
  catalog: readonly QueryCatalogEntry[]
  handlers: Readonly<Record<string, QueryHandler>>
  identity: ProductIdentityPort
}

function failure(error: BoardQueryErrorCode, hint: string): BoardQueryFailure {
  return { ok: false, error, hint }
}

export function authorizeQueryParameters(
  query: Pick<QueryCatalogEntry, 'parameters' | 'requiredPermissions'>,
  params: Record<string, unknown>,
  authorization: QueryAuthorization,
): BoardQueryResult | { ok: true } {
  const required = query.requiredPermissions ?? []
  if (required.length === 0) {
    return failure(
      'missing_required_permissions',
      '查询未声明 requiredPermissions，已拒绝执行',
    )
  }
  if (authorization.kind === 'unrestricted') return { ok: true }

  for (const [key, decl] of Object.entries(query.parameters)) {
    if (decl.type !== 'resource') continue
    const ids = resourceIdsFromParameter(params[key])
    if (!ids) {
      return failure('invalid_resource_parameter', `参数 ${key} 不是合法的资源引用`)
    }
    const needed = uniquePermissions(required, decl.requiredPermissions)
    for (const id of ids) {
      const resource = findResource(authorization.resources, decl.resourceType, id)
      if (!resource) {
        return failure('resource_not_authorized', `资源不在授权集合内：${id}`)
      }
      if (!permissionsCover(resource.permissions, needed)) {
        return failure(
          'permission_denied',
          `资源权限不足：${id} 缺少 ${needed.join('、')}`,
        )
      }
    }
  }
  return { ok: true }
}

export async function executeBoardQuery(
  input: ExecuteBoardQueryInput,
): Promise<BoardQueryResult> {
  const name = input.name.trim()
  if (!name) return failure('unknown_query', '缺少查询名称')

  const query = input.catalog.find((entry) => entry.name === name)
  if (!query) return failure('unknown_query', `未知查询：${name}`)

  const authorized = authorizeQueryParameters(
    query,
    input.params,
    input.identity.getSnapshot().authorization,
  )
  if (!authorized.ok) return authorized

  const handler = input.handlers[name]
  if (!handler) {
    return failure('unknown_query', `查询没有受信实现：${name}`)
  }

  let raw: unknown
  try {
    raw = await handler({
      name,
      params: input.params,
      fetch: input.identity.createSignedFetch(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('upstream_failed')) {
      return failure('upstream_failed', '上游查询失败')
    }
    return failure('upstream_failed', '查询执行失败')
  }

  return sanitizeQueryPayload(raw, input.identity)
}

export function sanitizeQueryPayload(
  value: unknown,
  identity: ProductIdentityPort,
): BoardQueryResult {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return failure('validation_failed', '查询产物无法 JSON 序列化')
  }
  if (json === undefined) {
    return failure('validation_failed', '查询产物无法 JSON 序列化')
  }
  const bytes = Buffer.byteLength(json, 'utf8')
  if (bytes > BOARD_JOB_RESULT_MAX_BYTES) {
    return failure(
      'output_too_large',
      `产物超过 512 KiB（${bytes} 字节），已拒绝回传`,
    )
  }

  if (identity.containsCredential(json)) {
    return failure('validation_failed', '查询产物含有身份凭据，已拒绝回传')
  }

  try {
    return { ok: true, payload: JSON.parse(json) as unknown }
  } catch {
    return failure('validation_failed', '查询产物无法 JSON 序列化')
  }
}

function uniquePermissions(
  queryLevel: readonly string[],
  paramLevel?: readonly string[],
): string[] {
  return [...new Set([...queryLevel, ...(paramLevel ?? [])])]
}

function findResource(
  resources: readonly QueryAuthorizedResource[],
  type: string,
  id: string,
): QueryAuthorizedResource | undefined {
  return resources.find((resource) => resource.type === type && resource.id === id)
}

function permissionsCover(
  have: readonly string[],
  required: readonly string[],
): boolean {
  const owned = new Set(have)
  return required.every((permission) => owned.has(permission))
}

function resourceIdsFromParameter(value: unknown): string[] | null {
  if (value === undefined) return null
  if (typeof value === 'string') {
    const id = value.trim()
    return id ? [id] : null
  }
  if (Array.isArray(value)) {
    const ids: string[] = []
    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) return null
      ids.push(item.trim())
    }
    return ids
  }
  return null
}
