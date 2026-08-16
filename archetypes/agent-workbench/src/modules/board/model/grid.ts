/**
 * Board grid math — pure, no React.
 *
 * Placement is expressed in grid cells: x/w in columns, y/h in rows.
 * Layout does not auto-compact: a dropped widget stays exactly where the user
 * put it, and only widgets it actually overlaps get pushed down. Gravity-up
 * compaction (react-grid-layout's `compactType: 'vertical'`) was rejected for
 * the prototype because it makes "drag to the bottom of the board" impossible.
 */

export const GRID_COLUMNS = 12
export const MIN_WIDGET_W = 2
export const MIN_WIDGET_H = 2

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
  /** Row height in px. */
  rowHeight: number
  /** Gap between cells in px, both axes. */
  gap: number
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
  rowHeight: 18,
  gap: 4,
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
 * The pinned widget keeps its exact placement; every other widget only moves
 * down, never sideways and never up.
 */
export function resolveLayout(items: GridItem[], pinnedId: string): GridItem[] {
  const next = new Map(items.map((item) => [item.id, { ...item.placement }]))
  if (!next.has(pinnedId)) return items

  const queue: string[] = [pinnedId]
  // Every push strictly increases y, but a push cycle could still spin; cap it.
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
): GridItem[] {
  const target = items.find((item) => item.id === id)
  if (!target) return items
  const w = Math.max(
    MIN_WIDGET_W,
    Math.min(columns - target.placement.x, Math.round(to.w)),
  )
  const h = Math.max(MIN_WIDGET_H, Math.round(to.h))
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

/** Convert a pointer delta in px to a whole-cell delta. */
export function deltaToCells(
  delta: { x: number; y: number },
  containerWidth: number,
  geometry: GridGeometry,
): { x: number; y: number } {
  const unitX = columnWidth(containerWidth, geometry) + geometry.gap
  const unitY = geometry.rowHeight + geometry.gap
  return {
    x: roundCells(delta.x / unitX),
    y: roundCells(delta.y / unitY),
  }
}

function roundCells(value: number): number {
  const rounded = Math.round(value)
  // Small upward drags round to -0, which reads oddly in placements and tests.
  return rounded === 0 ? 0 : rounded
}

/**
 * Thumbnail layout: first N widgets in a fixed 2×2 grid, short by placeholder
 * slots. Mirrors Kimi, whose board thumbnails always draw 4 slots regardless
 * of how many widgets the board actually holds.
 */
export const THUMBNAIL_SLOTS = 4

export interface ThumbnailSlot {
  /** Widget id, or null for an empty placeholder slot. */
  widgetId: string | null
  placement: GridPlacement
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
