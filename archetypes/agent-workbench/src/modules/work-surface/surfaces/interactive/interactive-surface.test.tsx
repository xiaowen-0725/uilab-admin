import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { createMemoryInteractiveArtifactStore } from '@/modules/task'
import { InteractiveSurfacePanel } from './interactive-surface'

const HTML =
  '<!doctype html><html><body><button>筛选</button></body></html>'

describe('InteractiveSurfacePanel', () => {
  it('loads HTML from the Task library by id and has no edit or export chrome', async () => {
    const store = createMemoryInteractiveArtifactStore()
    await store.put({
      id: 'ia_table',
      taskId: 'task-a',
      title: '对比清单',
      html: HTML,
      contentHash: 'hash-1',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    })

    await render(
      <InteractiveSurfacePanel
        taskId='task-a'
        artifactId='ia_table'
        title='对比清单'
        lookup={{ get: (taskId, id) => store.get(taskId, id) }}
      />,
    )

    const panel = page.getByTestId('work-surface-interactive')
    await expect.element(panel).toBeInTheDocument()
    await expect.element(panel).toHaveAttribute('data-artifact-id', 'ia_table')
    await expect.element(panel).toHaveTextContent('对比清单')
    await expect.element(panel).toHaveTextContent('交互产物')
    await expect
      .element(page.getByTestId('interactive-island-frame'))
      .toBeInTheDocument()
    expect(panel.element().textContent).not.toMatch(/导出|分享|编辑源码|新建/)
    expect(
      document.querySelector('[data-testid="board-widget-host"]'),
    ).toBeNull()
    expect(
      document.querySelector('[data-testid="work-surface-document"]'),
    ).toBeNull()
  })

  it('treats another Task id as missing instead of opening a document', async () => {
    const store = createMemoryInteractiveArtifactStore()
    await store.put({
      id: 'ia_table',
      taskId: 'task-a',
      title: '对比清单',
      html: HTML,
      contentHash: 'hash-1',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    })

    await render(
      <InteractiveSurfacePanel
        taskId='task-b'
        artifactId='ia_table'
        title='对比清单'
        lookup={{ get: (taskId, id) => store.get(taskId, id) }}
      />,
    )

    await expect
      .element(page.getByTestId('interactive-surface-state'))
      .toHaveTextContent('找不到这份交互产物')
    expect(
      document.querySelector('[data-testid="interactive-island-frame"]'),
    ).toBeNull()
    expect(
      document.querySelector('[data-testid="work-surface-document"]'),
    ).toBeNull()
  })
})
