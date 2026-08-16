import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { prototypeBoards } from '../../fixtures/prototype-boards'
import type { Board } from '../../model/board'
import { THUMBNAIL_SLOTS } from '../../model/grid'
import { BoardListPage } from './board-list-page'

function boardsWith(widgetCount: number, boardCount: number): Board[] {
  const [, dataBoard] = prototypeBoards()
  const pool = dataBoard.widgets
  return Array.from({ length: boardCount }, (_, boardIndex) => ({
    id: `b-${boardIndex}`,
    name: `看板 ${boardIndex + 1}`,
    isExample: false,
    updatedAt: Date.now(),
    widgets: Array.from({ length: widgetCount }, (_, index) => ({
      ...pool[index % pool.length],
      id: `b${boardIndex}-w${index}`,
      placement: { x: (index % 2) * 6, y: Math.floor(index / 2) * 4, w: 6, h: 4 },
    })),
  }))
}

describe('BoardListPage', () => {
  it('draws four thumbnail slots and pads short boards with placeholders', async () => {
    await render(
      <BoardListPage
        boards={boardsWith(1, 1)}
        theme='light'
        onOpenBoard={vi.fn()}
        onCreateByChat={vi.fn()}
      />,
    )

    await expect
      .poll(() => page.getByTestId('board-widget-host').elements().length)
      .toBe(1)
    expect(
      page.getByTestId('board-thumbnail-placeholder').elements(),
    ).toHaveLength(THUMBNAIL_SLOTS - 1)
  })

  it('caps live thumbnails at four widgets and says how many are hidden', async () => {
    await render(
      <BoardListPage
        boards={boardsWith(6, 1)}
        theme='light'
        onOpenBoard={vi.fn()}
        onCreateByChat={vi.fn()}
      />,
    )

    await expect
      .poll(() => page.getByTestId('board-widget-host').elements().length)
      .toBe(THUMBNAIL_SLOTS)
    await expect
      .element(page.getByTestId('board-card'))
      .toHaveTextContent('缩略图未显示 2 个')
  })

  it('marks example boards and opens a board from the keyboard', async () => {
    const onOpenBoard = vi.fn()
    await render(
      <BoardListPage
        boards={prototypeBoards()}
        theme='light'
        thumbnailMode='static'
        onOpenBoard={onOpenBoard}
        onCreateByChat={vi.fn()}
      />,
    )

    expect(page.getByTestId('board-example-badge').elements()).toHaveLength(2)
    await userEvent.click(page.getByTestId('board-card-open').first())
    expect(onOpenBoard).toHaveBeenCalledWith('b-getting-started')
  })

  it('renders no iframes at all in the degraded thumbnail mode', async () => {
    await render(
      <BoardListPage
        boards={boardsWith(4, 3)}
        theme='light'
        thumbnailMode='static'
        onOpenBoard={vi.fn()}
        onCreateByChat={vi.fn()}
      />,
    )

    expect(page.getByTestId('board-thumbnail-static').elements()).toHaveLength(
      12,
    )
    expect(page.getByTestId('board-widget-frame').elements()).toHaveLength(0)
  })

  it('offers a first board instead of an empty grid', async () => {
    const onCreateByChat = vi.fn()
    await render(
      <BoardListPage
        boards={[]}
        theme='light'
        onOpenBoard={vi.fn()}
        onCreateByChat={onCreateByChat}
      />,
    )

    await expect
      .element(page.getByTestId('board-list-empty'))
      .toHaveTextContent('还没有看板')
    await userEvent.click(page.getByTestId('board-create-by-chat'))
    expect(onCreateByChat).toHaveBeenCalledTimes(1)
  })
})

/**
 * Cost of live thumbnails, which #112's aborted stress test never produced.
 * Recorded rather than asserted against a tight budget: the numbers move with
 * the machine, and what #121 needs is the shape of the curve plus a hard ceiling
 * that would make the approach untenable.
 */
describe('live thumbnail cost', () => {
  const CASES = [
    { boards: 1, label: '1 个看板 · 4 个 iframe' },
    { boards: 2, label: '2 个看板 · 8 个 iframe' },
    { boards: 5, label: '5 个看板 · 20 个 iframe' },
  ]

  for (const testCase of CASES) {
    it(`renders ${testCase.label} within the ceiling`, async () => {
      const frames = testCase.boards * THUMBNAIL_SLOTS
      const timings: number[] = []
      const startedAt = performance.now()

      await render(
        <BoardListPage
          boards={boardsWith(4, testCase.boards)}
          theme='light'
          onOpenBoard={vi.fn()}
          onCreateByChat={vi.fn()}
          onWidgetReady={(_id, elapsed) => timings.push(elapsed)}
        />,
      )

      await expect
        .poll(() => timings.length, { timeout: 20_000 })
        .toBe(frames)
      const wallClock = performance.now() - startedAt
      const slowest = Math.max(...timings)
      const sorted = [...timings].sort((a, b) => a - b)

      // eslint-disable-next-line no-console
      console.log(
        `[thumbnail-cost] ${testCase.label}: wall ${Math.round(wallClock)}ms, ` +
          `median ${Math.round(sorted[Math.floor(sorted.length / 2)])}ms, ` +
          `slowest ${Math.round(slowest)}ms`,
      )

      // A board list that takes longer than this to become readable is a
      // product problem, not a tuning problem — fall back to `static`.
      // Measured on headless Chromium: 4 frames ≈ 68ms, 8 ≈ 86ms, 20 ≈ 127ms.
      // The ceiling is a regression guard with wide headroom, not a target.
      expect(wallClock).toBeLessThan(5000)
    })
  }
})
