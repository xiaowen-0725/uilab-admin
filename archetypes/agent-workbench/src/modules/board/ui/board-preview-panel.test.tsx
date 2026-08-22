import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { BoardView } from '../model/board-view'
import { BoardPreviewPanel } from './board-preview-panel'

const NOW = '2026-08-16T00:00:00.000Z'

const view: BoardView = {
  board: {
    id: 'board-1',
    title: '预览板',
    isExample: false,
    placements: [{ mountId: 'm1', widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 }],
    createdAt: NOW,
    updatedAt: NOW,
  },
  widgets: new Map([
    [
      'w1',
      {
        id: 'w1',
        title: '计数器',
        html: '<!doctype html><html><body></body></html>',
        span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
        status: 'idle',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  ]),
  jobs: new Map(),
  sources: new Map(),
  lastRunByJobId: new Map(),
}

describe('BoardPreviewPanel', () => {
  it('keeps the canvas read-only', async () => {
    await render(
      <div style={{ width: 480, height: 640 }}>
        <BoardPreviewPanel
          view={view}
          theme='light'
          onOpenFull={() => {}}
          onClose={() => {}}
        />
      </div>,
    )

    expect(page.getByTestId('board-preview-canvas').element()).toHaveAttribute(
      'data-mode',
      'read-only',
    )
    expect(page.getByTestId('board-canvas-resize-handle').elements()).toHaveLength(0)
    expect(page.getByTestId('board-preview-refresh')).toBeDisabled()
    expect(page.getByTestId('board-preview-refresh')).toHaveAccessibleName(
      '这个看板没有取数作业',
    )
  })

  it('enables refresh when the board has a query source and no job', async () => {
    await render(
      <div style={{ width: 480, height: 640 }}>
        <BoardPreviewPanel
          view={{
            ...view,
            sources: new Map([
              [
                'w1',
                {
                  id: 'source:w1',
                  widgetId: 'w1',
                  kind: 'query',
                  trigger: { kind: 'onOpen' },
                  referencableByJob: true,
                  queryName: 'site_summary',
                  parameters: {},
                  requiredPermissions: ['read'],
                  createdAt: NOW,
                  updatedAt: NOW,
                },
              ],
            ]),
          }}
          theme='light'
          onOpenFull={() => {}}
          onClose={() => {}}
        />
      </div>,
    )

    expect(page.getByTestId('board-preview-refresh')).toBeEnabled()
    expect(page.getByTestId('board-preview-refresh')).toHaveAccessibleName('刷新')
  })
})
