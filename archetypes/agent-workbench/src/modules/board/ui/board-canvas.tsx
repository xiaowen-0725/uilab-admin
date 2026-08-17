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
              spanLimits?.(drag.id),
            )
      setDraft(next)
    },
    [drag, geometry, items, spanLimits, width],
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
            spanLimits?.(id),
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
    [editable, geometry.columns, items, onLayoutChange, spanLimits],
  )

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
            const isDragged = drag?.id === item.id
            const followPointer = isDragged && drag.kind === 'move'
            // Follow the pointer from the grab cell; the dashed box uses the snap.
            const visualPlacement = isDragged ? drag.start : item.placement
            const rect = itemRect(visualPlacement, colWidth, geometry)
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
