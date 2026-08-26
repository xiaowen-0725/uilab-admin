import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { TimelineItem } from '../../projection/types'
import { workingBlockFromItems } from './derive-timeline-view'
import { WorkingBlock } from './working-block'

function toolItem(id: string): TimelineItem {
  return {
    id,
    category: 'tool-group',
    status: 'completed',
    title: '已读取 README',
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
    meta: { processKind: 'read' },
  }
}

describe('WorkingBlock process fold', () => {
  it('does not auto-collapse after the user opens it', async () => {
    const block = workingBlockFromItems([toolItem('r1')])
    const runningTerminal: TimelineItem = {
      ...toolItem('term'),
      id: 'term',
      category: 'turn-terminal',
      status: 'running',
    }
    const { rerender } = await render(
      <WorkingBlock
        block={block}
        terminal={runningTerminal}
        runActive
        primaryChrome
      />,
    )

    await expect
      .element(page.getByTestId('timeline-working-block'))
      .toHaveAttribute('data-fold-open', 'true')
    await userEvent.click(page.getByTestId('timeline-turn-toggle'))
    await expect
      .element(page.getByTestId('timeline-working-block'))
      .toHaveAttribute('data-fold-open', 'false')
    await userEvent.click(page.getByTestId('timeline-turn-toggle'))
    await expect
      .element(page.getByTestId('timeline-working-block'))
      .toHaveAttribute('data-fold-open', 'true')

    await rerender(
      <WorkingBlock
        block={block}
        terminal={{ ...runningTerminal, status: 'completed' }}
        runActive={false}
        primaryChrome
      />,
    )
    await expect
      .element(page.getByTestId('timeline-working-block'))
      .toHaveAttribute('data-fold-open', 'true')
  })

  it('settles the header even if a tool row is still marked running', async () => {
    const block = workingBlockFromItems([
      {
        ...toolItem('r1'),
        status: 'running',
        title: '正在列出 /',
      },
    ])
    await render(
      <WorkingBlock
        block={block}
        terminal={{
          ...toolItem('term'),
          id: 'term',
          category: 'turn-terminal',
          status: 'completed',
          meta: { durationMs: 2000 },
        }}
        runActive={false}
        primaryChrome
      />,
    )
    await expect
      .element(page.getByTestId('timeline-working-block'))
      .toHaveAttribute('data-status', 'completed')
    await expect
      .element(page.getByTestId('timeline-turn-status-label'))
      .toHaveTextContent(/已完成/)
    expect(
      page.getByTestId('timeline-turn-status-label').element().textContent ?? '',
    ).not.toMatch(/正在思考/)
    expect(
      page.getByTestId('timeline-turn-toggle').element().querySelectorAll('svg'),
    ).toHaveLength(1)
    expect(document.querySelector('[data-testid="timeline-process-rule"]')).not.toBeNull()
  })
})
