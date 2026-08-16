/**
 * Contract between the grid and whatever it lays out: an element marked with
 * this attribute is a move-drag surface.
 *
 * It lives here rather than on either component so the widget host stays usable
 * without a grid around it (the Timeline embeds a single widget) and the grid
 * stays usable for things that are not widgets (thumbnail placeholders).
 */
export const DRAG_HANDLE_ATTR = 'data-board-drag-handle'
