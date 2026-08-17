import { describe, expect, it } from 'vitest'
import {
  clampPlacement,
  firstEmptySlot,
  deltaToCells,
  layoutRows,
  moveItem,
  overlaps,
  resizeItem,
  THUMBNAIL_SLOTS,
  toThumbnailSlots,
  type GridItem,
  type SpanLimits,
} from './grid'

function item(id: string, x: number, y: number, w: number, h: number): GridItem {
  return { id, placement: { x, y, w, h } }
}

function placementOf(items: GridItem[], id: string) {
  return items.find((candidate) => candidate.id === id)?.placement
}

describe('board grid', () => {
  it('places a new widget in the first empty slot without overlapping', () => {
    expect(firstEmptySlot([])).toEqual({ x: 0, y: 0, w: 4, h: 4 })
    expect(
      firstEmptySlot([{ x: 0, y: 0, w: 4, h: 4 }]),
    ).toEqual({ x: 4, y: 0, w: 4, h: 4 })
  })

  it('keeps placements inside the column count and above the minimum size', () => {
    expect(clampPlacement({ x: 11, y: 0, w: 6, h: 4 })).toEqual({
      x: 6,
      y: 0,
      w: 6,
      h: 4,
    })
    expect(clampPlacement({ x: -3, y: -2, w: 1, h: 1 })).toEqual({
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    })
  })

  it('treats edge-sharing widgets as non-overlapping', () => {
    expect(
      overlaps({ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 }),
    ).toBe(false)
    expect(
      overlaps({ x: 0, y: 0, w: 5, h: 4 }, { x: 4, y: 3, w: 4, h: 4 }),
    ).toBe(true)
  })

  it('pins the moved widget and pushes only what it collides with', () => {
    const items = [
      item('a', 0, 0, 6, 4),
      item('b', 6, 0, 6, 4),
      item('c', 0, 4, 6, 4),
    ]
    const next = moveItem(items, 'b', { x: 0, y: 0 })

    expect(placementOf(next, 'b')).toEqual({ x: 0, y: 0, w: 6, h: 4 })
    expect(placementOf(next, 'a')).toEqual({ x: 0, y: 4, w: 6, h: 4 })
    expect(placementOf(next, 'c')).toEqual({ x: 0, y: 8, w: 6, h: 4 })
  })

  it('leaves a gap when a widget is dragged below everything', () => {
    const items = [item('a', 0, 0, 4, 3), item('b', 4, 0, 4, 3)]
    const next = moveItem(items, 'b', { x: 4, y: 9 })

    expect(placementOf(next, 'b')).toEqual({ x: 4, y: 9, w: 4, h: 3 })
    expect(placementOf(next, 'a')).toEqual({ x: 0, y: 0, w: 4, h: 3 })
  })

  it('never resizes past the right edge and pushes widgets below', () => {
    const items = [item('a', 8, 0, 4, 3), item('b', 8, 3, 4, 3)]
    const next = resizeItem(items, 'a', { w: 9, h: 5 })

    expect(placementOf(next, 'a')).toEqual({ x: 8, y: 0, w: 4, h: 5 })
    expect(placementOf(next, 'b')).toEqual({ x: 8, y: 5, w: 4, h: 3 })
  })

  it('clamps a resize to the widget min and max span', () => {
    const items = [item('a', 0, 0, 4, 4)]
    const limits: SpanLimits = {
      min: { w: 3, h: 3 },
      max: { w: 6, h: 5 },
    }

    expect(resizeItem(items, 'a', { w: 1, h: 1 }, 12, limits)).toEqual([
      item('a', 0, 0, 3, 3),
    ])
    expect(resizeItem(items, 'a', { w: 10, h: 10 }, 12, limits)).toEqual([
      item('a', 0, 0, 6, 5),
    ])
  })

  it('terminates on a layout where every widget overlaps every other', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      item(`w${index}`, 0, 0, 12, 4),
    )
    const next = moveItem(items, 'w0', { x: 0, y: 0 })
    expect(next).toHaveLength(8)
    expect(layoutRows(next)).toBeGreaterThan(4)
  })

  it('converts a pointer delta to whole cells', () => {
    const geometry = { columns: 12, rowHeight: 44, gap: 12 }
    expect(deltaToCells({ x: 210, y: 120 }, 1200, geometry)).toEqual({
      x: 2,
      y: 2,
    })
    expect(deltaToCells({ x: -40, y: -10 }, 1200, geometry)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('always fills four thumbnail slots regardless of widget count', () => {
    expect(toThumbnailSlots(['a']).map((slot) => slot.widgetId)).toEqual([
      'a',
      null,
      null,
      null,
    ])
    const many = toThumbnailSlots(['a', 'b', 'c', 'd', 'e'])
    expect(many).toHaveLength(THUMBNAIL_SLOTS)
    expect(many.map((slot) => slot.widgetId)).toEqual(['a', 'b', 'c', 'd'])
    expect(many[3].placement).toEqual({ x: 6, y: 3, w: 6, h: 3 })
  })
})
