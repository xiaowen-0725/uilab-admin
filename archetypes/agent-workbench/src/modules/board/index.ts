/**
 * Board module (prototype) — the only import surface for `@/modules/board`.
 *
 * Prototype scope: grid, widget sandbox host, and the three pages that reuse
 * them. No persistence, no Widget Data Job execution, no Shell wiring — those
 * are implementation-phase tickets cut from map #111.
 */
export type {
  Board,
  BoardWidget,
  WidgetDataState,
  WidgetJobSummary,
  WidgetSource,
} from './model/board'
export {
  DETAIL_GEOMETRY,
  GRID_COLUMNS,
  PREVIEW_GEOMETRY,
  THUMBNAIL_GEOMETRY,
  THUMBNAIL_SLOTS,
  toThumbnailSlots,
  type GridGeometry,
  type GridItem,
  type GridPlacement,
} from './model/grid'
export {
  WIDGET_SANDBOX,
  widgetCsp,
  type WidgetTheme,
} from './model/widget-document'
export { BoardCanvas, type BoardCanvasProps } from './ui/board-canvas/board-canvas'
export {
  BoardWidgetHost,
  type BoardWidgetHostProps,
  type WidgetChrome,
} from './ui/board-widget-host/board-widget-host'
export {
  BoardListPage,
  type BoardListPageProps,
  type ThumbnailMode,
} from './ui/board-list-page/board-list-page'
export {
  BoardDetailPage,
  type BoardDetailPageProps,
} from './ui/board-detail-page/board-detail-page'
export {
  BoardPreviewPanel,
  type BoardPreviewPanelProps,
} from './ui/board-preview-panel/board-preview-panel'
export { BoardPrototype, type BoardPrototypeProps } from './ui/board-prototype/board-prototype'
export { emptyPrototypeBoard, prototypeBoards } from './fixtures/prototype-boards'
