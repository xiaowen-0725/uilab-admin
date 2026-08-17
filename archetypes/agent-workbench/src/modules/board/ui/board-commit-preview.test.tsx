import { useEffect, useMemo, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { createMemoryBoardContent } from '../adapters/memory-board-content'
import { createMemoryBoardJobRuntime } from '../adapters/memory-board-job-runtime'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import { createBoardClientToolExecutor } from '../application/board-client-tools'
import { createBoardPreviewPolicy } from '../application/board-preview-policy'
import { loadBoardView } from '../application/load-board-view'
import { hashBoardContent } from '../model/content-hash'
import type { BoardView } from '../model/board-view'
import { BoardPreviewPanel } from './board-preview-panel'

const NOW = '2026-08-17T04:00:00.000Z'
const WIDGET_HTML =
  '<!doctype html><html><body><div id="root"></div><script>widget.ready()</script></body></html>'
const JOB_CODE = 'export async function run(ctx) { return { quote: 42 } }\n'

function CommitPreviewHarness() {
  const store = useMemo(() => createMemoryBoardStore(), [])
  const [view, setView] = useState<BoardView | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const content = createMemoryBoardContent()
      const contentHash = await hashBoardContent(WIDGET_HTML)
      const codeHash = await hashBoardContent(JOB_CODE)
      content.seed({
        draftId: 'b-widget',
        kind: 'widget',
        status: 'ready',
        title: '汇率',
        widgetId: 'w-new',
        content: WIDGET_HTML,
        hash: contentHash,
        bytes: WIDGET_HTML.length,
        contentHash,
      })
      content.seed({
        draftId: 'b-job',
        kind: 'job',
        status: 'ready',
        title: '拉汇率',
        description: '公开接口',
        widgetId: 'w-new',
        jobId: 'j-new',
        content: JOB_CODE,
        hash: codeHash,
        bytes: JOB_CODE.length,
        contentHash: codeHash,
        allowedHosts: ['api.example.com'],
      })
      await store.putBoard({
        id: 'board-1',
        title: '预览板',
        isExample: false,
        placements: [],
        createdAt: NOW,
        updatedAt: NOW,
      })
      let opened = false
      const executor = createBoardClientToolExecutor({
        store,
        content,
        effects: {
          preview: createBoardPreviewPolicy(),
          jobRuntime: createMemoryBoardJobRuntime({ quote: 42 }),
          openPreview: () => {
            opened = true
          },
        },
      })
      const committed = await executor({
        toolName: 'board_commit',
        taskId: 'task-1',
        turnId: 'turn-1',
        args: {
          boardId: 'board-1',
          widgetId: 'w-new',
          draftId: 'b-widget',
          contentHash,
          jobId: 'j-new',
          jobDraftId: 'b-job',
          codeHash,
        },
      })
      if (!opened || !committed || typeof committed !== 'object') return
      if (!('ok' in committed) || committed.ok !== true) return
      const next = await loadBoardView(store, 'board-1')
      if (!cancelled) setView(next)
    })()
    return () => {
      cancelled = true
    }
  }, [store])

  if (!view) return <p data-testid='commit-pending'>正在提交…</p>
  return (
    <div style={{ width: 480, height: 640 }}>
      <BoardPreviewPanel
        view={view}
        theme='light'
        onOpenFull={() => {}}
        onClose={() => {}}
      />
    </div>
  )
}

describe('board commit preview', () => {
  it('opens the preview after commit and shows first-run data', async () => {
    await render(<CommitPreviewHarness />)
    await expect
      .element(page.getByTestId('board-preview-panel'))
      .toBeInTheDocument()
    const host = page.getByTestId('board-widget-host')
    await expect.element(host).toBeInTheDocument()
    expect(host.element()).toHaveAttribute('data-has-latest', 'true')
    expect(host.element()).toHaveAttribute('data-widget-id', 'w-new')
  })
})
