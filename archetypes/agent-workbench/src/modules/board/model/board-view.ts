/**
 * Hydrated Board view for the three product surfaces.
 * Grid items are keyed by mountId so the same widget can exist twice (fullscreen).
 */

import type { IdentityScopeSnapshot } from '../ports/identity-scope-port'
import type { GridItem } from './grid'
import {
  resolveWidgetRenderState,
  type WidgetRenderState,
} from './widget-render-state'
import type {
  BoardPlacement,
  BoardRecord,
  BoardWidgetId,
  BoardWidgetRecord,
  WidgetDataJobRecord,
  WidgetDataSourceRecord,
  WidgetJobRunRecord,
} from './types'

export interface BoardView {
  board: BoardRecord
  widgets: ReadonlyMap<BoardWidgetId, BoardWidgetRecord>
  jobs: ReadonlyMap<BoardWidgetId, WidgetDataJobRecord>
  sources: ReadonlyMap<BoardWidgetId, WidgetDataSourceRecord>
  lastRunByJobId: ReadonlyMap<string, WidgetJobRunRecord>
}

export interface BoardListCard {
  board: BoardRecord
  widgets: readonly BoardWidgetRecord[]
  sources?: ReadonlyMap<BoardWidgetId, WidgetDataSourceRecord>
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

export function lastRunForWidget(
  view: BoardView,
  widgetId: BoardWidgetId,
): WidgetJobRunRecord | undefined {
  const job = view.jobs.get(widgetId)
  return job ? view.lastRunByJobId.get(job.id) : undefined
}

export function widgetRenderState(
  view: BoardView,
  widget: BoardWidgetRecord,
  identity: IdentityScopeSnapshot,
): WidgetRenderState {
  return resolveWidgetRenderState({
    latestData: widget.latestData,
    source: view.sources.get(widget.id),
    identity,
  })
}
