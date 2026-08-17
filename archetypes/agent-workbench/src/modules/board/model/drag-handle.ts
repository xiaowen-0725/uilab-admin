/**
 * Contract between the grid and whatever it lays out: an element marked with
 * this attribute is a move-drag surface.
 *
 * Lives here so the widget host stays usable without a grid (Timeline can
 * embed a single widget) and the grid stays usable for non-widget cells
 * (thumbnail placeholders).
 */
export const DRAG_HANDLE_ATTR = 'data-board-drag-handle'
