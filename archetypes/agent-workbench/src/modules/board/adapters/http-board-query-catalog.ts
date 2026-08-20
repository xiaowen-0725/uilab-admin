/**
 * BoardQueryCatalogPort backed by sidecar GET /board/queries.
 * Fail-open to [] when the sidecar is down so board_status still answers IDB.
 */

import { containsEndpointLeak } from '../model/endpoint-leak'
import type {
  BoardQueryCatalogEntry,
  BoardQueryCatalogPort,
  BoardQueryParameterDecl,
} from '../ports/board-query-catalog-port'

export type HttpBoardQueryCatalogOptions = {
  baseUrl: string
  token?: string | null
  fetchImpl?: typeof fetch
}

function authHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
  return headers
}

const SCALAR_TYPES = new Set(['string', 'number', 'boolean', 'string_array'])

function asObject(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function parseParameter(value: unknown): BoardQueryParameterDecl | null {
  const rec = asObject(value)
  if (!rec) return null
  if (rec.type === 'resource' && typeof rec.resourceType === 'string') {
    const extra = asStringList(rec.requiredPermissions)
    const parameter: BoardQueryParameterDecl = {
      type: 'resource',
      resourceType: rec.resourceType,
    }
    if (extra.length > 0) parameter.requiredPermissions = extra
    return parameter
  }
  if (typeof rec.type === 'string' && SCALAR_TYPES.has(rec.type)) {
    return {
      type: rec.type as Exclude<BoardQueryParameterDecl, { type: 'resource' }>['type'],
      required: rec.required !== false,
    }
  }
  return null
}

function parseEntry(value: unknown): BoardQueryCatalogEntry | null {
  const rec = asObject(value)
  if (!rec) return null
  if (typeof rec.name !== 'string' || !rec.name.trim()) return null
  if (typeof rec.title !== 'string') return null
  const requiredPermissions = asStringList(rec.requiredPermissions)
  if (requiredPermissions.length === 0) return null

  const parameters: Record<string, BoardQueryParameterDecl> = {}
  for (const [key, decl] of Object.entries(asObject(rec.parameters) ?? {})) {
    const parsed = parseParameter(decl)
    if (!parsed) return null
    parameters[key] = parsed
  }
  const entry: BoardQueryCatalogEntry = {
    name: rec.name.trim(),
    title: rec.title,
    parameters,
    requiredPermissions,
    referencableByJob: rec.referencableByJob === true,
  }
  if (containsEndpointLeak(entry)) return null
  return entry
}

export function createHttpBoardQueryCatalog(
  options: HttpBoardQueryCatalogOptions,
): BoardQueryCatalogPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const headers = authHeaders(options.token)

  return {
    async listQueries(): Promise<readonly BoardQueryCatalogEntry[]> {
      try {
        const res = await fetchImpl(`${baseUrl}/board/queries`, { headers })
        if (!res.ok) return []
        const body = (await res.json()) as { queries?: unknown }
        if (!Array.isArray(body.queries)) return []
        return body.queries
          .map(parseEntry)
          .filter((entry): entry is BoardQueryCatalogEntry => entry != null)
      } catch {
        return []
      }
    },
  }
}
