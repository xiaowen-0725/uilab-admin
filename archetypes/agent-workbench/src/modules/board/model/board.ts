/**
 * Board entities as the prototype needs them — pure types, no React.
 *
 * Deliberately narrower than the shipped spec: no IndexedDB records, no job
 * run history, no sidecar wiring. Persistence and Widget Data Job execution
 * are implementation-phase concerns (map #111).
 */
import type { GridPlacement } from './grid'

export type WidgetDataState = 'idle' | 'loading' | 'ready' | 'failed'

export interface BoardWidget {
  id: string
  title: string
  /** Single-file widget body: CSS + JS authored against the widget SDK. */
  source: WidgetSource
  placement: GridPlacement
  /** Latest Widget Data Job payload handed to the widget, if any. */
  data: unknown
  dataState: WidgetDataState
  /** Present when the widget is fed by a Widget Data Job. */
  job: WidgetJobSummary | null
}

export interface WidgetSource {
  css: string
  script: string
}

export interface WidgetJobSummary {
  id: string
  name: string
  /** No scheduler in the first version — kept for honest UI copy. */
  enabled: boolean
  lastRunAt: number | null
  lastRunOutcome: 'succeeded' | 'failed' | null
}

export interface Board {
  id: string
  name: string
  isExample: boolean
  updatedAt: number
  widgets: BoardWidget[]
}

export function widgetIds(board: Board): string[] {
  return board.widgets.map((widget) => widget.id)
}

export function findWidget(board: Board, id: string): BoardWidget | undefined {
  return board.widgets.find((widget) => widget.id === id)
}
