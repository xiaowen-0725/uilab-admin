/**
 * Plugin preset board install shape — ordinary user rows, query-bound, not examples.
 */

import { DEFAULT_WIDGET_SPAN } from './types'
import type {
  BoardRecord,
  BoardWidgetRecord,
  WidgetDataSourceRecord,
} from './types'
import type { BoardPresetCatalogEntry, BoardPresetCatalogWidget } from '../ports/board-preset-catalog-port'
import { dataSourceIdForWidget } from './data-source'

export function isPluginPresetBoard(
  board: Pick<BoardRecord, 'isExample' | 'presetId'>,
): boolean {
  return Boolean(board.presetId) && !board.isExample
}

export function boardOriginBadge(
  board: Pick<BoardRecord, 'isExample' | 'presetId'>,
): { testId: 'board-example-badge' | 'board-preset-badge'; label: '示例' | '预置' } | null {
  if (board.isExample) {
    return { testId: 'board-example-badge', label: '示例' }
  }
  if (isPluginPresetBoard(board)) {
    return { testId: 'board-preset-badge', label: '预置' }
  }
  return null
}

export function presetBoardId(presetId: string): string {
  return `preset:${presetId}`
}

export function presetWidgetId(presetId: string, localId: string): string {
  return `preset:${presetId}:${localId}`
}

export function buildPresetBoard(
  entry: BoardPresetCatalogEntry,
  now: string,
): BoardRecord {
  const board: BoardRecord = {
    id: presetBoardId(entry.presetId),
    title: entry.title,
    isExample: false,
    presetId: entry.presetId,
    presetVersion: entry.version,
    placements: [],
    createdAt: now,
    updatedAt: now,
  }
  if (entry.purpose) board.purpose = entry.purpose
  return board
}

export function buildPresetWidget(
  presetId: string,
  spec: BoardPresetCatalogWidget,
  now: string,
): BoardWidgetRecord {
  return {
    id: presetWidgetId(presetId, spec.id),
    title: spec.title,
    html: spec.html,
    span: spec.span ?? DEFAULT_WIDGET_SPAN,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  }
}

export function buildPresetQuerySource(
  presetId: string,
  spec: BoardPresetCatalogWidget,
  now: string,
): WidgetDataSourceRecord {
  const widgetId = presetWidgetId(presetId, spec.id)
  return {
    id: dataSourceIdForWidget(widgetId),
    widgetId,
    kind: 'query',
    trigger: spec.trigger,
    parameters: { ...spec.parameters },
    parameterSchema: { ...spec.parameterSchema },
    requiredPermissions: [...spec.requiredPermissions],
    referencableByJob: spec.referencableByJob,
    queryName: spec.queryName,
    createdAt: now,
    updatedAt: now,
  }
}
