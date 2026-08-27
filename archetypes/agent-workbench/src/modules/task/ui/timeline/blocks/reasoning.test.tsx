import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { TimelineItem } from '../../../projection/types'
import { ReasoningBlock } from './reasoning'

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'reasoning-1',
    category: 'reasoning-section',
    status: 'completed',
    body: '先确认轨道。\n倾角随机 2-7 度。',
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
    ...overrides,
  }
}

describe('ReasoningBlock', () => {
  it('stays collapsed with a one-line preview and expands the full thought', async () => {
    await render(
      <ReasoningBlock item={item()} runActive={false} />,
    )
    const row = page.getByTestId('timeline-item-reasoning-1')
    await expect.element(row).toHaveAttribute('data-expanded', 'false')
    await expect.element(row).toHaveTextContent('深度思考')
    const preview = row.element().querySelector('[data-slot="reasoning-preview"]')
    expect(preview?.textContent).toBe('倾角随机 2-7 度。')
    const collapse = row
      .element()
      .querySelector('[data-slot="reasoning-collapse"]') as HTMLElement
    expect(collapse.getBoundingClientRect().height).toBe(0)

    await userEvent.click(page.getByTestId('timeline-reasoning-trigger-reasoning-1'))
    await expect.element(row).toHaveAttribute('data-expanded', 'true')
    expect(row.element().querySelector('[data-slot="reasoning-preview"]')).toBeNull()
    await expect.element(row).toHaveTextContent('先确认轨道。')
    await expect.element(row).toHaveTextContent('倾角随机 2-7 度。')
  })

  it('lets a live reasoning row expand while the thought is still streaming', async () => {
    await render(
      <ReasoningBlock
        item={item({ status: 'streaming', body: '轨道倾角小角度随机 2-7 度。' })}
        runActive
      />,
    )
    const row = page.getByTestId('timeline-item-reasoning-1')
    await expect.element(row).toHaveTextContent('思考中…')
    await expect.element(row).toHaveAttribute('data-expanded', 'false')

    await userEvent.click(page.getByTestId('timeline-reasoning-trigger-reasoning-1'))
    await expect.element(row).toHaveAttribute('data-expanded', 'true')
    await expect
      .element(row)
      .toHaveTextContent('轨道倾角小角度随机 2-7 度。')
  })
})
