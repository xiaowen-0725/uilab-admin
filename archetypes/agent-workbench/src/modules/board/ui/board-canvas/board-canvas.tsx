import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { DRAG_HANDLE_ATTR } from '../../model/drag-handle'
import {
  columnWidth,
  deltaToCells,
  layoutRows,
  moveItem,
  resizeItem,
  type GridGeometry,
  type GridItem,
  type GridPlacement,
} from '../../model/grid'

/** Interactive controls inside a handle must win over the drag. */
const HANDLE_CONTROL_SELECTOR =
  'button, a, input, select, textarea, [role="menuitem"], [role="button"]'

export interface BoardCanvasProps {
  items: GridItem[]
  geometry: GridGeometry
  /** `read-only` is the preview and thumbnail mode: layout cannot change. */
  mode?: 'edit' | 'read-only'
  onLayoutChange?: (items: GridItem[]) => void
  renderItem: (id: string) => ReactNode
  /** Extra empty rows below the content, so there is somewhere to drag to. */
  spareRows?: number
  className?: string
  'data-testid'?: string
}

interface DragState {
  id: string
  kind: 'move' | 'resize'
  pointerId: number
  originX: number
  originY: number
  offsetX: number
  offsetY: number
  start: GridPlacement
}

function itemRect(
  placement: GridPlacement,
  colWidth: number,
  geometry: GridGeometry,
) {
  const { gap, rowHeight } = geometry
  return {
    left: placement.x * (colWidth + gap),
    top: placement.y * (rowHeight + gap),
    width: placement.w * colWidth + (placement.w - 1) * gap,
    height: placement.h * rowHeight + (placement.h - 1) * gap,
  }
}

/**
 * Board grid — the one layout surface reused by the detail page, the
 * in-conversation preview, and list thumbnails. It owns placement and drag
 * only; what sits in a cell is entirely the caller's business, which is what
 * lets a thumbnail put grey placeholders in the same grid as live widgets.
 *
 * Dragging is pixel-smooth with a snapped drop target, rather than snapping the
 * dragged widget itself: cell-snapped dragging reads as lag at this cell size.
 */
export function BoardCanvas({
  items,
  geometry,
  mode = 'edit',
  onLayoutChange,
  renderItem,
  spareRows = 0,
  className,
  'data-testid': testId = 'board-canvas',
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [draft, setDraft] = useState<GridItem[] | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [pointerDelta, setPointerDelta] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => setWidth(node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const editable = mode === 'edit'
  const live = draft ?? items
  const colWidth = columnWidth(width, geometry)
  const rows = layoutRows(live) + (editable ? spareRows : 0)
  const height = Math.max(
    0,
    rows * (geometry.rowHeight + geometry.gap) - geometry.gap,
  )

  const beginDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      id: string,
      kind: DragState['kind'],
    ) => {
      if (!editable) return
      const target = live.find((item) => item.id === id)
      if (!target) return
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Capture is an improvement, not a requirement: the container's own
        // move/up handlers still see the drag if the pointer id is not capturable.
      }
      setDrag({
        id,
        kind,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        offsetX: 0,
        offsetY: 0,
        start: target.placement,
      })
      setPointerDelta({ x: 0, y: 0 })
      setDraft(live)
    },
    [editable, live],
  )

  const onItemPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
      if (!editable || event.button !== 0) return
      const origin = event.target as HTMLElement
      if (!origin.closest(`[${DRAG_HANDLE_ATTR}]`)) return
      if (origin.closest(HANDLE_CONTROL_SELECTOR)) return
      event.preventDefault()
      beginDrag(event, id, 'move')
    },
    [beginDrag, editable],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const delta = {
        x: event.clientX - drag.originX,
        y: event.clientY - drag.originY,
      }
      setPointerDelta(delta)
      const cells = deltaToCells(delta, width, geometry)
      const next =
        drag.kind === 'move'
          ? moveItem(
              items,
              drag.id,
              { x: drag.start.x + cells.x, y: drag.start.y + cells.y },
              geometry.columns,
            )
          : resizeItem(
              items,
              drag.id,
              { w: drag.start.w + cells.x, h: drag.start.h + cells.y },
              geometry.columns,
            )
      setDraft(next)
    },
    [drag, geometry, items, width],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (draft) onLayoutChange?.(draft)
      setDrag(null)
      setDraft(null)
      setPointerDelta({ x: 0, y: 0 })
    },
    [draft, drag, onLayoutChange],
  )

  const onItemKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, id: string) => {
      if (!editable) return
      const step: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      }
      const direction = step[event.key]
      if (!direction) return
      const target = items.find((item) => item.id === id)
      if (!target) return
      event.preventDefault()
      const next = event.shiftKey
        ? resizeItem(
            items,
            id,
            {
              w: target.placement.w + direction.x,
              h: target.placement.h + direction.y,
            },
            geometry.columns,
          )
        : moveItem(
            items,
            id,
            {
              x: target.placement.x + direction.x,
              y: target.placement.y + direction.y,
            },
            geometry.columns,
          )
      onLayoutChange?.(next)
    },
    [editable, geometry.columns, items, onLayoutChange],
  )

  // A pointer lost outside the window must not leave the board mid-drag.
  useEffect(() => {
    if (!drag) return
    const cancel = () => {
      setDrag(null)
      setDraft(null)
      setPointerDelta({ x: 0, y: 0 })
    }
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [drag])

  const dragged = drag ? live.find((item) => item.id === drag.id) : undefined

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full', className)}
      style={{ height }}
      data-testid={testId}
      data-mode={mode}
      data-dragging={drag ? drag.kind : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {width === 0
        ? null
        : live.map((item) => {
            const rect = itemRect(item.placement, colWidth, geometry)
            const isDragged = drag?.id === item.id
            const followPointer = isDragged && drag.kind === 'move'
            return (
              <div
                key={item.id}
                className={cn(
                  'absolute',
                  isDragged ? 'z-20' : 'z-0',
                  !isDragged &&
                    'transition-[left,top,width,height] duration-150 ease-out',
                  editable && 'focus-visible:outline-2 focus-visible:outline-ring',
                )}
                style={{
                  left: rect.left + (followPointer ? pointerDelta.x : 0),
                  top: rect.top + (followPointer ? pointerDelta.y : 0),
                  width:
                    isDragged && drag.kind === 'resize'
                      ? rect.width + pointerDelta.x
                      : rect.width,
                  height:
                    isDragged && drag.kind === 'resize'
                      ? rect.height + pointerDelta.y
                      : rect.height,
                }}
                data-testid='board-canvas-item'
                data-item-id={item.id}
                data-placement={`${item.placement.x},${item.placement.y},${item.placement.w},${item.placement.h}`}
                role={editable ? 'group' : undefined}
                tabIndex={editable ? 0 : undefined}
                onPointerDown={(event) => onItemPointerDown(event, item.id)}
                onKeyDown={(event) => onItemKeyDown(event, item.id)}
              >
                {renderItem(item.id)}

                {editable ? (
                  <span
                    className='absolute bottom-0.5 right-0.5 z-10 size-3 cursor-se-resize border-b border-r border-muted-foreground/40 hover:border-primary'
                    data-testid='board-canvas-resize-handle'
                    data-item-id={item.id}
                    aria-hidden
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      beginDrag(event, item.id, 'resize')
                    }}
                  />
                ) : null}
              </div>
            )
          })}

      {/* Snapped drop target, so a pixel-smooth drag still reads as a grid. */}
      {dragged ? (
        <div
          className='pointer-events-none absolute z-10 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5'
          style={itemRect(dragged.placement, colWidth, geometry)}
          data-testid='board-canvas-drop-target'
          aria-hidden
        />
      ) : null}
    </div>
  )
}
