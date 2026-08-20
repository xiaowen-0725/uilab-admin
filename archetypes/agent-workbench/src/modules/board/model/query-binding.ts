/**
 * Agent-facing query binding checks (ADR-0024 §6 / #149).
 * Catalog lookup + schema extras + resource membership/permissions.
 */

import type { BoardQueryCatalogEntry } from '../ports/board-query-catalog-port'
import type { IdentityAuthorization } from '../ports/identity-scope-port'
import { authorizeDataSourceParameters } from './source-authorization'
import type { WidgetDataSourceRecord } from './types'
import { dataSourceFromQuery } from './data-source'

export type QueryBindingFailure = {
  ok: false
  error: string
  hint: string
}

export type QueryBindingOk = {
  ok: true
  query: BoardQueryCatalogEntry
  source: WidgetDataSourceRecord
}

export type QueryBindingResult = QueryBindingOk | QueryBindingFailure

const BINDING_HINTS: Record<string, string> = {
  unknown_query: '未知指标。先 board_status 对照目录里的 name，不要编指标名。',
  missing_required_permissions: '该指标未声明 requiredPermissions，已拒绝绑定',
  validation_failed: '查询参数不在指标 schema 内，或缺少必填项',
}

export function validateQueryBinding(
  catalog: readonly BoardQueryCatalogEntry[],
  input: {
    widgetId: string
    queryName: string
    params: Record<string, unknown>
    now: string
  },
  authorization: IdentityAuthorization,
): QueryBindingResult {
  const name = input.queryName.trim()
  if (!name) {
    return fail('unknown_query', '缺少指标名。先 board_status 对照目录。')
  }
  const query = catalog.find((entry) => entry.name === name)
  if (!query) {
    return fail('unknown_query', `未知指标：${name}。先 board_status 对照目录里的 name，不要编指标名。`)
  }

  const schemaKeys = new Set(Object.keys(query.parameters))
  for (const key of Object.keys(input.params)) {
    if (!schemaKeys.has(key)) {
      return fail(
        'validation_failed',
        `参数 ${key} 不在指标 schema 内，请删掉后重试`,
      )
    }
  }

  for (const [key, decl] of Object.entries(query.parameters)) {
    if (decl.type === 'resource') {
      if (!(key in input.params)) {
        return fail(
          'invalid_resource_parameter',
          `参数 ${key} 不是合法的资源引用（字符串或字符串数组）`,
        )
      }
      continue
    }
    if (decl.required !== false && !(key in input.params)) {
      return fail('validation_failed', `缺少必填参数 ${key}`)
    }
  }

  const source = dataSourceFromQuery(input.widgetId, query, input.params, input.now)
  const authorized = authorizeDataSourceParameters(source, authorization)
  if (authorized.ok) return { ok: true, query, source }

  if (authorized.reason === 'invalid_resource_parameter') {
    return fail(
      'invalid_resource_parameter',
      '资源引用参数必须是字符串或字符串数组。对照目录 parameters 重填。',
    )
  }
  if (authorized.reason === 'resource_not_authorized') {
    return fail(
      'resource_not_authorized',
      '资源不在当前身份授权集合内。对照 board_status.identity.resources 再填。',
    )
  }
  if (authorized.reason === 'permission_denied') {
    const needed = source.requiredPermissions?.join('、') ?? ''
    return fail(
      'permission_denied',
      `当前身份缺少权限：${needed}。请改选 requiredPermissions 被资源 permissions 覆盖的指标。`,
    )
  }
  return fail(
    authorized.reason,
    BINDING_HINTS[authorized.reason] ?? BINDING_HINTS.validation_failed,
  )
}

export function queryBindingMatches(
  source: WidgetDataSourceRecord | null | undefined,
  queryName: string,
  params: Record<string, unknown>,
): boolean {
  if (source?.kind !== 'query') return false
  if (source.queryName !== queryName) return false
  return stableJson(source.parameters ?? {}) === stableJson(params)
}

function fail(error: string, hint: string): QueryBindingFailure {
  return { ok: false, error, hint }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value != null && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(rec)
        .sort()
        .map((key) => [key, sortKeys(rec[key])]),
    )
  }
  return value
}
