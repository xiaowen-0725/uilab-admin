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

function parseParameter(value: unknown): BoardQueryParameterDecl | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const rec = value as Record<string, unknown>
  if (rec.type === 'resource' && typeof rec.resourceType === 'string') {
    const extra = Array.isArray(rec.requiredPermissions)
      ? rec.requiredPermissions.filter((item): item is string => typeof item === 'string')
      : undefined
    return extra?.length
      ? { type: 'resource', resourceType: rec.resourceType, requiredPermissions: extra }
      : { type: 'resource', resourceType: rec.resourceType }
  }
  if (typeof rec.type === 'string' && SCALAR_TYPES.has(rec.type)) {
    return {
      type: rec.type as Exclude<BoardQueryParameterDecl, { type: 'resource' }>['type'],
      required: rec.required === false ? false : true,
    }
  }
  return null
}

function parseEntry(value: unknown): BoardQueryCatalogEntry | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const rec = value as Record<string, unknown>
  if (typeof rec.name !== 'string' || !rec.name.trim()) return null
  if (typeof rec.title !== 'string') return null
  if (!Array.isArray(rec.requiredPermissions) || rec.requiredPermissions.length === 0) {
    return null
  }
  const parameters: Record<string, BoardQueryParameterDecl> = {}
  const rawParams =
    rec.parameters != null && typeof rec.parameters === 'object' && !Array.isArray(rec.parameters)
      ? (rec.parameters as Record<string, unknown>)
      : {}
  for (const [key, decl] of Object.entries(rawParams)) {
    const parsed = parseParameter(decl)
    if (!parsed) return null
    parameters[key] = parsed
  }
  const entry: BoardQueryCatalogEntry = {
    name: rec.name.trim(),
    title: rec.title,
    parameters,
    requiredPermissions: rec.requiredPermissions.filter(
      (item): item is string => typeof item === 'string',
    ),
    referencableByJob: rec.referencableByJob === true,
  }
  if (entry.requiredPermissions.length === 0) return null
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
        const entries: BoardQueryCatalogEntry[] = []
        for (const item of body.queries) {
          const entry = parseEntry(item)
          if (entry) entries.push(entry)
        }
        return entries
      } catch {
        return []
      }
    },
  }
}
