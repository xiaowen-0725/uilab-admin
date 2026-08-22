/**
 * Board grid math — pure, no React.
 *
 * Placement is in grid cells: x/w columns, y/h rows. A dropped widget stays
 * where the user put it; only widgets it actually overlaps are pushed down.
 * Gravity-up compaction is rejected: it makes "drag to the bottom" snap back.
 */

import type { WidgetSpan } from './types'

export const GRID_COLUMNS = 12
export const MIN_WIDGET_W = 2
export const MIN_WIDGET_H = 2
export const THUMBNAIL_SLOTS = 4
export const THUMBNAIL_SCALE = 0.34
export const BOARD_PREVIEW_WIDTH = 480

export interface GridPlacement {
  x: number
  y: number
  w: number
  h: number
}

export interface GridItem {
  id: string
  placement: GridPlacement
}

export interface GridGeometry {
  columns: number
  rowHeight: number
  gap: number
}

export interface SpanLimits {
  min: WidgetSpan
  max: WidgetSpan
}

export const DETAIL_GEOMETRY: GridGeometry = {
  columns: GRID_COLUMNS,
  rowHeight: 44,
  gap: 12,
}

export const PREVIEW_GEOMETRY: GridGeometry = {
  columns: GRID_COLUMNS,
  rowHeight: 32,
  gap: 8,
}

export const THUMBNAIL_GEOMETRY: GridGeometry = {
  columns: GRID_COLUMNS,
  rowHeight: 24,
  gap: 6,
}

export function overlaps(a: GridPlacement, b: GridPlacement): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  )
}

export function clampPlacement(
  placement: GridPlacement,
  columns = GRID_COLUMNS,
): GridPlacement {
  const w = Math.max(MIN_WIDGET_W, Math.min(columns, Math.round(placement.w)))
  const h = Math.max(MIN_WIDGET_H, Math.round(placement.h))
  const x = Math.max(0, Math.min(columns - w, Math.round(placement.x)))
  const y = Math.max(0, Math.round(placement.y))
  return { x, y, w, h }
}

/**
 * Push widgets that overlap `pinnedId` downwards, cascading.
 * The pinned widget keeps its exact placement; others only move down.
 */
export function resolveLayout(items: GridItem[], pinnedId: string): GridItem[] {
  const next = new Map(items.map((item) => [item.id, { ...item.placement }]))
  if (!next.has(pinnedId)) return items

  const queue: string[] = [pinnedId]
  const maxPushes = items.length * items.length + 32
  let pushes = 0

  while (queue.length > 0 && pushes < maxPushes) {
    const currentId = queue.shift() as string
    const current = next.get(currentId) as GridPlacement
    for (const [id, placement] of next) {
      if (id === currentId) continue
      if (!overlaps(current, placement)) continue
      placement.y = current.y + current.h
      pushes += 1
      if (!queue.includes(id)) queue.push(id)
    }
  }

  return items.map((item) => ({
    ...item,
    placement: next.get(item.id) as GridPlacement,
  }))
}

export function moveItem(
  items: GridItem[],
  id: string,
  to: Pick<GridPlacement, 'x' | 'y'>,
  columns = GRID_COLUMNS,
): GridItem[] {
  const target = items.find((item) => item.id === id)
  if (!target) return items
  const placement = clampPlacement(
    { ...target.placement, x: to.x, y: to.y },
    columns,
  )
  const moved = items.map((item) =>
    item.id === id ? { ...item, placement } : item,
  )
  return resolveLayout(moved, id)
}

export function resizeItem(
  items: GridItem[],
  id: string,
  to: Pick<GridPlacement, 'w' | 'h'>,
  columns = GRID_COLUMNS,
  limits?: SpanLimits,
): GridItem[] {
  const target = items.find((item) => item.id === id)
  if (!target) return items
  const minW = limits?.min.w ?? MIN_WIDGET_W
  const minH = limits?.min.h ?? MIN_WIDGET_H
  const maxW = limits?.max.w ?? columns
  const maxH = limits?.max.h ?? Number.POSITIVE_INFINITY
  const w = Math.max(
    minW,
    Math.min(maxW, columns - target.placement.x, Math.round(to.w)),
  )
  const h = Math.max(minH, Math.min(maxH, Math.round(to.h)))
  const resized = items.map((item) =>
    item.id === id ? { ...item, placement: { ...item.placement, w, h } } : item,
  )
  return resolveLayout(resized, id)
}

export function layoutRows(items: GridItem[]): number {
  return items.reduce(
    (rows, item) => Math.max(rows, item.placement.y + item.placement.h),
    0,
  )
}

export function columnWidth(
  containerWidth: number,
  geometry: GridGeometry,
): number {
  const gaps = geometry.gap * (geometry.columns - 1)
  return Math.max(1, (containerWidth - gaps) / geometry.columns)
}

export function deltaToCells(
  delta: { x: number; y: number },
  containerWidth: number,
  geometry: GridGeometry,
): { x: number; y: number } {
  const unitX = columnWidth(containerWidth, geometry) + geometry.gap
  const unitY = geometry.rowHeight + geometry.gap
  return {
    x: Math.round(delta.x / unitX) || 0,
    y: Math.round(delta.y / unitY) || 0,
  }
}

export interface ThumbnailSlot {
  widgetId: string | null
  placement: GridPlacement
}

/** First cell that does not overlap existing placements. Agent commits only append. */
export function firstEmptySlot(
  placements: readonly GridPlacement[],
  span: WidgetSpan = { w: 4, h: 4 },
  columns = GRID_COLUMNS,
): GridPlacement {
  const w = Math.max(MIN_WIDGET_W, Math.min(columns, Math.round(span.w)))
  const h = Math.max(MIN_WIDGET_H, Math.round(span.h))
  for (let y = 0; y < 10_000; y += 1) {
    for (let x = 0; x <= columns - w; x += 1) {
      const candidate = { x, y, w, h }
      if (!placements.some((item) => overlaps(item, candidate))) {
        return candidate
      }
    }
  }
  return { x: 0, y: 0, w, h }
}

export function toThumbnailSlots(
  widgetIds: string[],
  slots = THUMBNAIL_SLOTS,
): ThumbnailSlot[] {
  const half = GRID_COLUMNS / 2
  return Array.from({ length: slots }, (_, index) => ({
    widgetId: widgetIds[index] ?? null,
    placement: {
      x: (index % 2) * half,
      y: Math.floor(index / 2) * 3,
      w: half,
      h: 3,
    },
  }))
}
