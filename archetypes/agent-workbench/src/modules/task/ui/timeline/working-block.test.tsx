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

const SVG_FENCE = [
  '过程旁白里的图',
  '```svg',
  '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#dc2626"/></svg>',
  '```',
].join('\n')

function asideItem(id: string, body: string): TimelineItem {
  return {
    id,
    category: 'assistant-message',
    status: 'completed',
    body,
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
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

  it('keeps a process-aside fence as characters, not a figure', async () => {
    const block = workingBlockFromItems([asideItem('aside-1', SVG_FENCE)])
    await render(
      <WorkingBlock
        block={block}
        terminal={{
          ...toolItem('term'),
          id: 'term',
          category: 'turn-terminal',
          status: 'running',
        }}
        runActive
        primaryChrome
      />,
    )
    const aside = page.getByTestId('timeline-process-aside-aside-1')
    await expect.element(aside).toBeInTheDocument()
    const el = aside.element()
    expect(el.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(el.querySelector('[data-testid="simple-markdown"]')).toBeNull()
    expect(el.textContent ?? '').toContain('```svg')
    expect(el.textContent ?? '').toContain('fill="#dc2626"')
  })
})
