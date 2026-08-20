/**
 * BoardPresetCatalogPort backed by sidecar GET /board/presets.
 * Fail-open to [] when the sidecar is down so the list still shows examples.
 */

import type {
  BoardPresetCatalogEntry,
  BoardPresetCatalogPort,
  BoardPresetCatalogWidget,
} from '../ports/board-preset-catalog-port'
import type {
  DataSourceResourceParameterDecl,
  WidgetDataSourceTrigger,
} from '../model/types'

export type HttpBoardPresetCatalogOptions = {
  baseUrl: string
  token?: string | null
  fetchImpl?: typeof fetch
}

function authHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
  return headers
}

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

function parseTrigger(value: unknown): WidgetDataSourceTrigger {
  const rec = asObject(value)
  if (rec?.kind === 'manual') return { kind: 'manual' }
  if (rec?.kind === 'schedule') {
    return typeof rec.everyMs === 'number'
      ? { kind: 'schedule', everyMs: rec.everyMs }
      : { kind: 'schedule' }
  }
  return { kind: 'onOpen' }
}

function parseSpan(
  value: unknown,
): BoardPresetCatalogWidget['span'] | undefined {
  const rec = asObject(value)
  const min = asObject(rec?.min)
  const def = asObject(rec?.default)
  const max = asObject(rec?.max)
  if (!min || !def || !max) return undefined
  if (
    typeof min.w !== 'number' ||
    typeof min.h !== 'number' ||
    typeof def.w !== 'number' ||
    typeof def.h !== 'number' ||
    typeof max.w !== 'number' ||
    typeof max.h !== 'number'
  ) {
    return undefined
  }
  return {
    min: { w: min.w, h: min.h },
    default: { w: def.w, h: def.h },
    max: { w: max.w, h: max.h },
  }
}

function parseParameterSchema(
  value: unknown,
): Record<string, DataSourceResourceParameterDecl> {
  const rec = asObject(value) ?? {}
  const next: Record<string, DataSourceResourceParameterDecl> = {}
  for (const [key, decl] of Object.entries(rec)) {
    const item = asObject(decl)
    if (item?.type !== 'resource' || typeof item.resourceType !== 'string') {
      continue
    }
    const extra = asStringList(item.requiredPermissions)
    next[key] = extra.length
      ? { type: 'resource', resourceType: item.resourceType, requiredPermissions: extra }
      : { type: 'resource', resourceType: item.resourceType }
  }
  return next
}

function parseWidget(value: unknown): BoardPresetCatalogWidget | null {
  const rec = asObject(value)
  if (!rec) return null
  if (typeof rec.id !== 'string' || !rec.id.trim()) return null
  if (typeof rec.title !== 'string') return null
  if (typeof rec.html !== 'string' || !rec.html.trim()) return null
  if (typeof rec.queryName !== 'string' || !rec.queryName.trim()) return null
  const placement = asObject(rec.placement)
  if (
    typeof placement?.x !== 'number' ||
    typeof placement.y !== 'number' ||
    typeof placement.w !== 'number' ||
    typeof placement.h !== 'number'
  ) {
    return null
  }
  const requiredPermissions = asStringList(rec.requiredPermissions)
  if (requiredPermissions.length === 0) return null
  const widget: BoardPresetCatalogWidget = {
    id: rec.id.trim(),
    title: rec.title,
    html: rec.html,
    placement: {
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
    },
    queryName: rec.queryName.trim(),
    parameters: asObject(rec.parameters) ?? {},
    parameterSchema: parseParameterSchema(rec.parameterSchema),
    requiredPermissions,
    referencableByJob: rec.referencableByJob === true,
    trigger: parseTrigger(rec.trigger),
  }
  const span = parseSpan(rec.span)
  if (span) widget.span = span
  return widget
}

function parseEntry(value: unknown): BoardPresetCatalogEntry | null {
  const rec = asObject(value)
  if (!rec) return null
  if (typeof rec.presetId !== 'string' || !rec.presetId.trim()) return null
  if (typeof rec.title !== 'string') return null
  if (!Number.isInteger(rec.version) || (rec.version as number) < 1) return null
  if (!Array.isArray(rec.widgets)) return null
  const widgets = rec.widgets
    .map(parseWidget)
    .filter((widget): widget is BoardPresetCatalogWidget => widget != null)
  if (widgets.length === 0) return null
  const entry: BoardPresetCatalogEntry = {
    pluginId: typeof rec.pluginId === 'string' ? rec.pluginId : '',
    presetId: rec.presetId.trim(),
    version: rec.version as number,
    title: rec.title,
    widgets,
  }
  if (typeof rec.purpose === 'string' && rec.purpose.trim()) {
    entry.purpose = rec.purpose
  }
  return entry
}

export function createHttpBoardPresetCatalog(
  options: HttpBoardPresetCatalogOptions,
): BoardPresetCatalogPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const headers = authHeaders(options.token)

  return {
    async listPresetBoards(): Promise<readonly BoardPresetCatalogEntry[]> {
      try {
        const res = await fetchImpl(`${baseUrl}/board/presets`, { headers })
        if (!res.ok) return []
        const body = (await res.json()) as { presetBoards?: unknown }
        if (!Array.isArray(body.presetBoards)) return []
        return body.presetBoards
          .map(parseEntry)
          .filter((entry): entry is BoardPresetCatalogEntry => entry != null)
      } catch {
        return []
      }
    },
  }
}

export function createMemoryBoardPresetCatalog(
  entries: readonly BoardPresetCatalogEntry[] = [],
): BoardPresetCatalogPort {
  return {
    listPresetBoards: async () => entries,
  }
}
