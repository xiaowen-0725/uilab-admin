import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { THUMBNAIL_SCALE } from '../model/grid'
import type { BoardListCard } from '../model/board-view'
import type { BoardRecord, BoardWidgetRecord } from '../model/types'
import {
  BoardListPage,
  THUMBNAIL_COST_CEILING_MS,
  resolveThumbnailMode,
} from './board-list-page'

const NOW = '2026-08-16T00:00:00.000Z'

function widget(id: string, title: string): BoardWidgetRecord {
  return {
    id,
    title,
    html: '<!doctype html><html><body></body></html>',
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function card(overrides: Partial<BoardRecord> = {}, widgets: BoardWidgetRecord[] = []): BoardListCard {
  return {
    board: {
      id: 'board-1',
      title: '每日速递',
      isExample: true,
      placements: widgets.map((item, index) => ({
        mountId: `m-${item.id}`,
        widgetId: item.id,
        x: 0,
        y: index * 4,
        w: 6,
        h: 4,
      })),
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    },
    widgets,
  }
}

describe('BoardListPage', () => {
  it('fills a flex parent and lays two cards side by side', async () => {
    await render(
      <div
        className='relative flex min-h-0 min-w-0 overflow-hidden'
        style={{ width: 960, height: 720 }}
      >
        <BoardListPage
          boards={[
            card({ id: 'board-1', title: '每日速递' }, [widget('w1', '计数器')]),
            card({ id: 'board-2', title: '上手指引', isExample: true }, [
              widget('w2', '待办'),
            ]),
          ]}
          theme='light'
          onOpenBoard={() => {}}
          onCreateByChat={() => {}}
        />
      </div>,
    )

    const pageBox = page.getByTestId('board-list-page').element().getBoundingClientRect()
    expect(pageBox.width).toBeGreaterThan(900)
    expect(page.getByTestId('board-list-page')).toHaveTextContent(
      '用对话生成小组件，搭一块长期盯着的看板',
    )

    const cards = page.getByTestId('board-card').elements()
    expect(cards).toHaveLength(2)
    const first = cards[0]?.getBoundingClientRect()
    const second = cards[1]?.getBoundingClientRect()
    expect(Math.abs((first?.top ?? 0) - (second?.top ?? 0))).toBeLessThan(24)
    expect((second?.left ?? 0) - (first?.right ?? 0)).toBeGreaterThan(8)
  })

  it('scales live thumbnails instead of clipping them', async () => {
    await render(
      <BoardListPage
        boards={[card({}, [widget('w1', '计数器')])]}
        theme='light'
        onOpenBoard={() => {}}
        onCreateByChat={() => {}}
      />,
    )

    const scale = page.getByTestId('board-thumbnail-scale').element() as HTMLElement
    expect(scale.style.transform).toBe(`scale(${THUMBNAIL_SCALE})`)
    expect(Number.parseFloat(scale.style.width)).toBeCloseTo(100 / THUMBNAIL_SCALE, 2)
    expect(resolveThumbnailMode(THUMBNAIL_COST_CEILING_MS)).toBe('live')
    expect(resolveThumbnailMode(THUMBNAIL_COST_CEILING_MS + 1)).toBe('static')
  })

  it('renders static titles when the list-page switch is flipped', async () => {
    await render(
      <BoardListPage
        boards={[card({}, [widget('w1', '计数器')])]}
        theme='light'
        thumbnailMode='static'
        onOpenBoard={() => {}}
        onCreateByChat={() => {}}
      />,
    )

    expect(page.getByTestId('board-thumbnail-static')).toHaveTextContent('计数器')
    expect(page.getByTestId('board-thumbnail-scale').elements()).toHaveLength(0)
  })

  it('pads unused thumbnail slots and opens from the keyboard', async () => {
    const onOpenBoard = vi.fn()
    await render(
      <BoardListPage
        boards={[card({}, [widget('w1', '计数器')])]}
        theme='light'
        onOpenBoard={onOpenBoard}
        onCreateByChat={() => {}}
      />,
    )

    expect(page.getByTestId('board-thumbnail-placeholder').elements()).toHaveLength(3)
    expect(page.getByTestId('board-thumbnail-title')).toHaveTextContent('计数器')
    expect(page.getByTestId('board-example-badge')).toHaveTextContent('示例')
    expect(page.getByTestId('board-preset-badge').elements()).toHaveLength(0)

    const open = page.getByTestId('board-card')
    ;(open.element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpenBoard).toHaveBeenCalledWith('board-1')
  })

  it('describes overflow widgets as preview slots, not a render failure', async () => {
    await render(
      <BoardListPage
        boards={[
          card(
            {},
            [
              widget('w1', '一'),
              widget('w2', '二'),
              widget('w3', '三'),
              widget('w4', '四'),
              widget('w5', '五'),
            ],
          ),
        ]}
        theme='light'
        onOpenBoard={() => {}}
        onCreateByChat={() => {}}
      />,
    )

    expect(page.getByTestId('board-card')).toHaveTextContent('另有 1 个未放入预览')
    expect(page.getByTestId('board-card').element().textContent).not.toContain(
      '缩略图未显示',
    )
  })

  it('labels a plugin preset board as 预置, not 示例', async () => {
    await render(
      <BoardListPage
        boards={[
          card(
            { isExample: false, presetId: 'site-watch', title: '站点值班' },
            [widget('w1', '满位')],
          ),
        ]}
        theme='light'
        onOpenBoard={() => {}}
        onCreateByChat={() => {}}
      />,
    )

    expect(page.getByTestId('board-preset-badge')).toHaveTextContent('预置')
    expect(page.getByTestId('board-example-badge').elements()).toHaveLength(0)
  })
})
