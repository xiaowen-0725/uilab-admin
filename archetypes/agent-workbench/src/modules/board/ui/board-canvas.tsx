import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { DRAG_HANDLE_ATTR } from '../model/drag-handle'
import {
  columnWidth,
  deltaToCells,
  layoutRows,
  moveItem,
  resizeItem,
  type GridGeometry,
  type GridItem,
  type GridPlacement,
  type SpanLimits,
} from '../model/grid'

const HANDLE_CONTROL_SELECTOR =
  'button, a, input, select, textarea, [role="menuitem"], [role="button"]'

export interface BoardCanvasProps {
  items: GridItem[]
  geometry: GridGeometry
  mode?: 'edit' | 'read-only'
  onLayoutChange?: (items: GridItem[]) => void
  renderItem: (id: string) => ReactNode
  spanLimits?: (id: string) => SpanLimits | undefined
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
  start: GridPlacement
}

interface ItemRect {
  left: number
  top: number
  width: number
  height: number
}

function itemRect(
  placement: GridPlacement,
  colWidth: number,
  geometry: GridGeometry,
): ItemRect {
  const { gap, rowHeight } = geometry
  return {
    left: placement.x * (colWidth + gap),
    top: placement.y * (rowHeight + gap),
    width: placement.w * colWidth + (placement.w - 1) * gap,
    height: placement.h * rowHeight + (placement.h - 1) * gap,
  }
}

function itemVisualStyle(
  rect: ItemRect,
  kind: DragState['kind'] | null,
  pointerDelta: { x: number; y: number },
): ItemRect {
  if (kind === 'move') {
    return {
      ...rect,
      left: rect.left + pointerDelta.x,
      top: rect.top + pointerDelta.y,
    }
  }
  if (kind === 'resize') {
    return {
      ...rect,
      width: rect.width + pointerDelta.x,
      height: rect.height + pointerDelta.y,
    }
  }
  return rect
}

function layoutFromPointer(
  items: GridItem[],
  drag: DragState,
  delta: { x: number; y: number },
  width: number,
  geometry: GridGeometry,
  limits?: SpanLimits,
): GridItem[] {
  const cells = deltaToCells(delta, width, geometry)
  if (drag.kind === 'move') {
    return moveItem(
      items,
      drag.id,
      { x: drag.start.x + cells.x, y: drag.start.y + cells.y },
      geometry.columns,
    )
  }
  return resizeItem(
    items,
    drag.id,
    { w: drag.start.w + cells.x, h: drag.start.h + cells.y },
    geometry.columns,
    limits,
  )
}

function nudgeItem(
  items: GridItem[],
  id: string,
  direction: { x: number; y: number },
  columns: number,
  resize: boolean,
  limits?: SpanLimits,
): GridItem[] | null {
  const target = items.find((item) => item.id === id)
  if (!target) return null
  if (resize) {
    return resizeItem(
      items,
      id,
      {
        w: target.placement.w + direction.x,
        h: target.placement.h + direction.y,
      },
      columns,
      limits,
    )
  }
  return moveItem(
    items,
    id,
    {
      x: target.placement.x + direction.x,
      y: target.placement.y + direction.y,
    },
    columns,
  )
}

/**
 * Shared board grid. Owns placement and drag only; cells are the caller's.
 * Drag is pixel-smooth with a snapped drop target so 44px rows do not jump.
 */
export function BoardCanvas({
  items,
  geometry,
  mode = 'edit',
  onLayoutChange,
  renderItem,
  spanLimits,
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
        // Capture is optional; container move/up still see the pointer.
      }
      setDrag({
        id,
        kind,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
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
      setDraft(
        layoutFromPointer(
          items,
          drag,
          delta,
          width,
          geometry,
          spanLimits?.(drag.id),
        ),
      )
    },
    [drag, geometry, items, spanLimits, width],
  )

  const clearDrag = useCallback(() => {
    setDrag(null)
    setDraft(null)
    setPointerDelta({ x: 0, y: 0 })
  }, [])

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (draft) onLayoutChange?.(draft)
      clearDrag()
    },
    [clearDrag, draft, drag, onLayoutChange],
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
      const next = nudgeItem(
        items,
        id,
        direction,
        geometry.columns,
        event.shiftKey,
        spanLimits?.(id),
      )
      if (!next) return
      event.preventDefault()
      onLayoutChange?.(next)
    },
    [editable, geometry.columns, items, onLayoutChange, spanLimits],
  )

  useEffect(() => {
    if (!drag) return
    window.addEventListener('blur', clearDrag)
    return () => window.removeEventListener('blur', clearDrag)
  }, [clearDrag, drag])

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
            const isDragged = drag?.id === item.id
            const dragKind = isDragged && drag ? drag.kind : null
            const followPointer = dragKind === 'move'
            // Follow the pointer from the grab cell; the dashed box uses the snap.
            const visualPlacement =
              isDragged && drag ? drag.start : item.placement
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
                style={itemVisualStyle(
                  itemRect(visualPlacement, colWidth, geometry),
                  dragKind,
                  pointerDelta,
                )}
                data-testid='board-canvas-item'
                data-item-id={item.id}
                data-placement={`${item.placement.x},${item.placement.y},${item.placement.w},${item.placement.h}`}
                data-follow-x={followPointer ? String(pointerDelta.x) : undefined}
                data-follow-y={followPointer ? String(pointerDelta.y) : undefined}
                role={editable ? 'group' : undefined}
                tabIndex={editable ? 0 : undefined}
                onPointerDown={(event) => onItemPointerDown(event, item.id)}
                onKeyDown={(event) => onItemKeyDown(event, item.id)}
              >
                {renderItem(item.id)}

                {editable ? (
                  <span
                    className='absolute right-0.5 bottom-0.5 z-10 size-3 cursor-se-resize border-r border-b border-muted-foreground/40 hover:border-primary'
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
