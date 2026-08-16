import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { DRAG_HANDLE_ATTR } from '../../model/drag-handle'
import { DETAIL_GEOMETRY, type GridItem } from '../../model/grid'
import { BoardCanvas } from './board-canvas'

const ITEMS: GridItem[] = [
  { id: 'a', placement: { x: 0, y: 0, w: 6, h: 4 } },
  { id: 'b', placement: { x: 6, y: 0, w: 6, h: 4 } },
]

function Harness({
  onLayoutChange,
  mode = 'edit',
}: {
  onLayoutChange?: (items: GridItem[]) => void
  mode?: 'edit' | 'read-only'
}) {
  const [items, setItems] = useState(ITEMS)
  return (
    <div style={{ width: 1200 }}>
      <BoardCanvas
        items={items}
        geometry={DETAIL_GEOMETRY}
        mode={mode}
        spareRows={4}
        onLayoutChange={(next) => {
          setItems(next)
          onLayoutChange?.(next)
        }}
        renderItem={(id) => (
          <div className='h-full bg-muted' data-testid={`body-${id}`}>
            <div
              className='h-8 bg-card'
              data-testid={`handle-${id}`}
              {...{ [DRAG_HANDLE_ATTR]: '' }}
            >
              {id}
            </div>
          </div>
        )}
      />
    </div>
  )
}

/**
 * Programmatic pointer events do not get React's synchronous discrete flush, so
 * a drag has to be confirmed started before the move is dispatched.
 */
async function expectDragging(kind: 'move' | 'resize' | null) {
  await expect
    .poll(
      () => page.getByTestId('board-canvas').element().getAttribute('data-dragging'),
      { timeout: 2000 },
    )
    .toBe(kind)
}

function placementOf(id: string) {
  return page
    .getByTestId('board-canvas-item')
    .elements()
    .find((element) => element.getAttribute('data-item-id') === id)
    ?.getAttribute('data-placement')
}

describe('BoardCanvas', () => {
  it('moves a widget by dragging its handle and pushes what it lands on', async () => {
    const onLayoutChange = vi.fn()
    await render(<Harness onLayoutChange={onLayoutChange} />)

    const handle = page.getByTestId('handle-b').element()
    const box = handle.getBoundingClientRect()
    const startX = box.x + 20
    const startY = box.y + box.height / 2

    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: startX,
        clientY: startY,
      }),
    )
    await expectDragging('move')

    // One column unit is (1200 - 11*12)/12 + 12 ≈ 101px, one row is 56px.
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: startX - 606,
        clientY: startY,
      }),
    )
    await expect
      .element(page.getByTestId('board-canvas-drop-target'))
      .toBeInTheDocument()
    // The board previews the drop before the pointer is released.
    await expect.poll(() => placementOf('b'), { timeout: 2000 }).toBe('0,0,6,4')
    await expect.poll(() => placementOf('a'), { timeout: 2000 }).toBe('0,4,6,4')

    handle.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        clientX: startX - 606,
        clientY: startY,
      }),
    )

    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(placementOf('b')).toBe('0,0,6,4')
    // `a` was where `b` landed, so it moved down by `b`'s height.
    expect(placementOf('a')).toBe('0,4,6,4')
  })

  it('does not start a drag from a control inside the handle', async () => {
    const onLayoutChange = vi.fn()
    await render(
      <div style={{ width: 1200 }}>
        <BoardCanvas
          items={ITEMS}
          geometry={DETAIL_GEOMETRY}
          onLayoutChange={onLayoutChange}
          renderItem={(id) => (
            <div
              className='h-8'
              data-testid={`handle-${id}`}
              {...{ [DRAG_HANDLE_ATTR]: '' }}
            >
              <button type='button' data-testid={`button-${id}`}>
                刷新
              </button>
            </div>
          )}
        />
      </div>,
    )

    const button = page.getByTestId('button-b').element()
    const box = button.getBoundingClientRect()
    button.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        button: 0,
        clientX: box.x + 2,
        clientY: box.y + 2,
      }),
    )
    button.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 2,
        clientX: box.x - 300,
        clientY: box.y,
      }),
    )
    await expectDragging(null)

    expect(page.getByTestId('board-canvas-drop-target').elements()).toHaveLength(
      0,
    )
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('resizes from the corner grip', async () => {
    await render(<Harness />)
    const grip = page
      .getByTestId('board-canvas-resize-handle')
      .elements()
      .find((element) => element.getAttribute('data-item-id') === 'a')
    if (!grip) throw new Error('missing resize grip')
    const box = grip.getBoundingClientRect()

    grip.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 3,
        button: 0,
        clientX: box.x,
        clientY: box.y,
      }),
    )
    await expectDragging('resize')

    grip.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 3,
        clientX: box.x - 202,
        clientY: box.y + 112,
      }),
    )
    await expect.poll(() => placementOf('a'), { timeout: 2000 }).toBe('0,0,4,6')

    grip.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 3,
        clientX: box.x - 202,
        clientY: box.y + 112,
      }),
    )

    expect(placementOf('a')).toBe('0,0,4,6')
  })

  it('offers no drag surfaces or grips when read-only', async () => {
    await render(<Harness mode='read-only' />)

    expect(
      page.getByTestId('board-canvas-resize-handle').elements(),
    ).toHaveLength(0)
    expect(page.getByTestId('board-canvas').element()).toHaveAttribute(
      'data-mode',
      'read-only',
    )
    const item = page.getByTestId('board-canvas-item').elements()[0]
    expect(item.getAttribute('tabindex')).toBeNull()
  })

  it('moves and resizes from the keyboard', async () => {
    await render(<Harness />)
    const items = page.getByTestId('board-canvas-item').elements()
    const itemB = items.find(
      (element) => element.getAttribute('data-item-id') === 'b',
    )
    if (!itemB) throw new Error('missing item')
    ;(itemB as HTMLElement).focus()

    await userEvent.keyboard('{ArrowDown}')
    expect(placementOf('b')).toBe('6,1,6,4')

    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(placementOf('b')).toBe('6,1,6,5')
  })
})
