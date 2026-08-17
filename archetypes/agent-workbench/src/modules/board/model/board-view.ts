/**
 * Hydrated Board view for the three product surfaces.
 * Grid items are keyed by mountId so the same widget can exist twice (fullscreen).
 */

import type { GridItem } from './grid'
import type {
  BoardPlacement,
  BoardRecord,
  BoardWidgetId,
  BoardWidgetRecord,
  WidgetDataJobRecord,
  WidgetJobRunRecord,
} from './types'

export interface BoardView {
  board: BoardRecord
  widgets: ReadonlyMap<BoardWidgetId, BoardWidgetRecord>
  jobs: ReadonlyMap<BoardWidgetId, WidgetDataJobRecord>
  lastRunByJobId: ReadonlyMap<string, WidgetJobRunRecord>
}

export interface BoardListCard {
  board: BoardRecord
  widgets: readonly BoardWidgetRecord[]
}

export function placementsToGridItems(
  placements: readonly BoardPlacement[],
): GridItem[] {
  return placements.map((placement) => ({
    id: placement.mountId,
    placement: {
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
    },
  }))
}

export function gridItemsToPlacements(
  items: readonly GridItem[],
  previous: readonly BoardPlacement[],
): BoardPlacement[] {
  const byMount = new Map(previous.map((item) => [item.mountId, item]))
  return items.map((item) => {
    const prior = byMount.get(item.id)
    return {
      mountId: item.id,
      widgetId: prior?.widgetId ?? item.id,
      x: item.placement.x,
      y: item.placement.y,
      w: item.placement.w,
      h: item.placement.h,
    }
  })
}

export function widgetOnMount(
  view: BoardView,
  mountId: string,
): BoardWidgetRecord | undefined {
  const placement = view.board.placements.find((item) => item.mountId === mountId)
  return placement ? view.widgets.get(placement.widgetId) : undefined
}
