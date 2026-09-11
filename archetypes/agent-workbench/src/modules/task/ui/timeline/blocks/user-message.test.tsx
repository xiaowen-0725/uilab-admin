/**
 * User bubbles stay plaintext. Pasted svg / mermaid fences must not become figures.
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { TimelineItem } from '../../../projection/types'
import { UserMessageBlock } from './user-message'

const SVG_FENCE = [
  '帮我看看这张图',
  '',
  '```svg',
  '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#dc2626"/></svg>',
  '```',
].join('\n')

function userItem(body: string): TimelineItem {
  return {
    id: 'user-1',
    category: 'user-message',
    status: 'completed',
    body,
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
  }
}

describe('UserMessageBlock inline-figure boundary', () => {
  it('keeps a pasted svg fence as characters', async () => {
    await render(
      <UserMessageBlock item={userItem(SVG_FENCE)} runActive={false} />,
    )
    const bubble = page.getByTestId('timeline-item-user-1')
    await expect.element(bubble).toBeInTheDocument()
    const el = bubble.element()
    expect(el.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(el.querySelector('[data-testid="simple-markdown"]')).toBeNull()
    expect(el.textContent ?? '').toContain('```svg')
    expect(el.textContent ?? '').toContain('fill="#dc2626"')
  })
})
