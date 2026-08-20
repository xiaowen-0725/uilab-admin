/**
 * Preset board catalog — enabled plugin templates joined to query declarations.
 * Filesystem plugins reject unknown queryName at discover parse.
 * Builtin packages that skip parse still drop the board here (fail-closed).
 */

import type {
  PluginManifest,
  PresetBoardContribution,
  PresetBoardWidgetContribution,
  QueryContribution,
  QueryParameterDecl,
} from './manifest.js'

export type PresetBoardCatalogWidget = {
  id: string
  title: string
  html: string
  placement: { x: number; y: number; w: number; h: number }
  span?: {
    min: { w: number; h: number }
    default: { w: number; h: number }
    max: { w: number; h: number }
  }
  queryName: string
  parameters: Record<string, unknown>
  parameterSchema: Record<string, Extract<QueryParameterDecl, { type: 'resource' }>>
  requiredPermissions: string[]
  referencableByJob: boolean
  trigger:
    | { kind: 'manual' }
    | { kind: 'onOpen' }
    | { kind: 'schedule'; everyMs?: number }
}

export type PresetBoardCatalogEntry = {
  pluginId: string
  presetId: string
  version: number
  title: string
  purpose?: string
  widgets: PresetBoardCatalogWidget[]
}

export function listPresetBoards(
  manifests: readonly PluginManifest[],
  enabledIds: ReadonlySet<string>,
): PresetBoardCatalogEntry[] {
  const entries: PresetBoardCatalogEntry[] = []
  const seen = new Set<string>()
  for (const manifest of manifests) {
    if (!enabledIds.has(manifest.id)) continue
    const queries = new Map(
      (manifest.contributes?.queries ?? []).map((query) => [query.name, query]),
    )
    for (const board of manifest.contributes?.presetBoards ?? []) {
      if (seen.has(board.presetId)) continue
      const resolved = resolvePresetBoard(manifest.id, board, queries)
      if (!resolved) continue
      seen.add(board.presetId)
      entries.push(resolved)
    }
  }
  return entries
}

function resolvePresetBoard(
  pluginId: string,
  board: PresetBoardContribution,
  queries: ReadonlyMap<string, QueryContribution>,
): PresetBoardCatalogEntry | null {
  const widgets: PresetBoardCatalogWidget[] = []
  for (const widget of board.widgets) {
    const resolved = resolveWidget(widget, queries)
    if (!resolved) return null
    widgets.push(resolved)
  }
  const entry: PresetBoardCatalogEntry = {
    pluginId,
    presetId: board.presetId,
    version: board.version,
    title: board.title,
    widgets,
  }
  if (board.purpose) entry.purpose = board.purpose
  return entry
}

function resolveWidget(
  widget: PresetBoardWidgetContribution,
  queries: ReadonlyMap<string, QueryContribution>,
): PresetBoardCatalogWidget | null {
  const query = queries.get(widget.source.queryName)
  if (!query) return null
  const parameterSchema: PresetBoardCatalogWidget['parameterSchema'] = {}
  for (const [key, decl] of Object.entries(query.parameters)) {
    if (decl.type !== 'resource') continue
    parameterSchema[key] = decl
  }
  const resolved: PresetBoardCatalogWidget = {
    id: widget.id,
    title: widget.title,
    html: widget.html,
    placement: widget.placement,
    queryName: query.name,
    parameters: { ...(widget.source.parameters ?? {}) },
    parameterSchema,
    requiredPermissions: [...query.requiredPermissions],
    referencableByJob: query.referencableByJob,
    trigger: widget.source.trigger ?? { kind: 'onOpen' },
  }
  if (widget.span) resolved.span = widget.span
  return resolved
}
