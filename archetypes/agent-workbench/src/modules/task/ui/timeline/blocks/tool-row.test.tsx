import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { TimelineItem } from '../../../projection/types'
import { ActivityGroup } from './activity-group'
import { ToolRow } from './tool-row'

function toolItem(partial: Partial<TimelineItem> & Pick<TimelineItem, 'id'>): TimelineItem {
  return {
    category: 'tool-group',
    title: '读取 README.md',
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
    meta: {
      processKind: 'read',
      children: ['README.md'],
      path: 'README.md',
      additions: 3,
      deletions: 0,
    },
    ...partial,
  }
}

describe('ToolRow scene icons', () => {
  it('maps write and list process kinds to replica marks', async () => {
    await render(
      <ToolRow
        item={toolItem({
          id: 'write-1',
          status: 'completed',
          title: '已写入 /pipeline-polish.md',
          meta: { processKind: 'write' },
        })}
      />,
    )
    expect(
      document
        .querySelector('[data-testid="timeline-item-write-1"] [data-activity-icon]')
        ?.getAttribute('data-activity-icon'),
    ).toBe('write')

    await render(
      <ToolRow
        item={toolItem({
          id: 'list-1',
          status: 'completed',
          title: '已列出 /',
          meta: { processKind: 'list' },
        })}
      />,
    )
    expect(
      document
        .querySelector('[data-testid="timeline-item-list-1"] [data-activity-icon]')
        ?.getAttribute('data-activity-icon'),
    ).toBe('list')
  })
})

describe('ToolRow sentence chrome', () => {
  it('hides the completed check and only reveals a trailing chevron on hover', async () => {
    await render(<ToolRow item={toolItem({ id: 't1', status: 'completed' })} />)
    const trigger = page.getByTestId('timeline-tool-trigger-t1')
    const chevron = document.querySelector('[data-slot="tool-row-chevron"]')
    expect(chevron).not.toBeNull()
    expect(getComputedStyle(chevron!).opacity).toBe('0')
    expect(
      document.querySelector(
        '[data-testid="timeline-item-t1"] [data-slot="tool-status"][data-status="completed"]',
      ),
    ).toBeNull()

    await trigger.hover()
    await expect
      .poll(() => Number(getComputedStyle(chevron!).opacity))
      .toBeGreaterThan(0)

    await userEvent.click(trigger)
    await expect
      .element(page.getByTestId('timeline-item-t1'))
      .toHaveAttribute('data-expanded', 'true')
    expect(chevron!.getAttribute('class') ?? '').toMatch(/rotate-180/)
    expect(Number(getComputedStyle(chevron!).opacity)).toBeGreaterThan(0)
    expect(getComputedStyle(trigger.element()).backgroundColor).toMatch(
      /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/,
    )
  })
})

describe('ToolRow mid-state', () => {
  it('expands running tools to show path and plus-minus, then collapses when done', async () => {
    const running = toolItem({ id: 't1', status: 'running' })
    const { rerender } = await render(<ToolRow item={running} />)
    await expect
      .element(page.getByTestId('timeline-item-t1'))
      .toHaveAttribute('data-expanded', 'true')
    await expect.element(page.getByTestId('timeline-item-t1')).toHaveTextContent('README.md')
    await expect.element(page.getByTestId('timeline-item-t1')).toHaveTextContent('+3')
    await expect.element(page.getByTestId('timeline-item-t1')).toHaveTextContent('−0')

    await rerender(<ToolRow item={toolItem({ id: 't1', status: 'completed' })} />)
    await expect
      .element(page.getByTestId('timeline-item-t1'))
      .toHaveAttribute('data-expanded', 'false')
  })

  it('does not re-collapse after the user opens a completed row', async () => {
    const completed = toolItem({ id: 't1', status: 'completed' })
    const { rerender } = await render(<ToolRow item={completed} />)
    await userEvent.click(page.getByTestId('timeline-tool-trigger-t1'))
    await expect
      .element(page.getByTestId('timeline-item-t1'))
      .toHaveAttribute('data-expanded', 'true')

    await rerender(<ToolRow item={toolItem({ id: 't1', status: 'completed' })} />)
    await expect
      .element(page.getByTestId('timeline-item-t1'))
      .toHaveAttribute('data-expanded', 'true')
  })
})

describe('ActivityGroup mid-state', () => {
  it('stays collapsed by default and does not re-close after the user opens it', async () => {
    const running = [
      toolItem({ id: 'r1', status: 'completed' }),
      toolItem({ id: 'r2', status: 'running', title: '读取 notes.md' }),
    ]
    const { rerender } = await render(
      <ActivityGroup kinds={['read']} items={running} />,
    )
    await expect
      .element(page.getByTestId('timeline-activity-group-read'))
      .toHaveAttribute('data-expanded', 'false')

    const settled = [
      toolItem({ id: 'r1', status: 'completed' }),
      toolItem({ id: 'r2', status: 'completed', title: '读取 notes.md' }),
    ]
    await rerender(<ActivityGroup kinds={['read']} items={settled} />)
    await expect
      .element(page.getByTestId('timeline-activity-group-read'))
      .toHaveAttribute('data-expanded', 'false')

    await userEvent.click(page.getByText('读取文件'))
    await expect
      .element(page.getByTestId('timeline-activity-group-read'))
      .toHaveAttribute('data-expanded', 'true')
    await rerender(<ActivityGroup kinds={['read']} items={settled} />)
    await expect
      .element(page.getByTestId('timeline-activity-group-read'))
      .toHaveAttribute('data-expanded', 'true')
  })
})
