import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { TimelineFollowMode } from '../../projection/types'
import { MessageScroller } from './message-scroller'

function isAtBottom(el: HTMLElement, threshold = 2): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function scrollerElement(): HTMLElement {
  return page.getByTestId('task-timeline').element() as HTMLElement
}

function SwitchHarness() {
  const [taskId, setTaskId] = useState('task-a')
  return (
    <div
      style={{
        height: 240,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <button
        type='button'
        data-testid='switch-task'
        onClick={() =>
          setTaskId((id) => (id === 'task-a' ? 'task-b' : 'task-a'))
        }
      >
        切换
      </button>
      <MessageScroller taskId={taskId} followMode='follow'>
        <div style={{ height: 720 }} data-testid='old-content'>
          {taskId} oldest
        </div>
        <div data-testid='newest-content'>{taskId} newest</div>
      </MessageScroller>
    </div>
  )
}

function FollowTipHarness() {
  const [height, setHeight] = useState(480)
  const [tip, setTip] = useState('tip-a')
  const [followMode, setFollowMode] = useState<TimelineFollowMode>('follow')
  return (
    <div
      style={{
        height: 240,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <button
        type='button'
        data-testid='grow-body'
        onClick={() => setHeight((value) => value + 480)}
      >
        长高
      </button>
      <button
        type='button'
        data-testid='bump-tip'
        onClick={() => setTip((value) => `${value}-next`)}
      >
        新 tip
      </button>
      <button
        type='button'
        data-testid='force-pin'
        onClick={() => setFollowMode('user-pinned')}
      >
        钉住
      </button>
      <button
        type='button'
        data-testid='force-follow'
        onClick={() => setFollowMode('follow')}
      >
        跟底
      </button>
      <MessageScroller taskId='task-follow' followMode={followMode} followTip={tip}>
        <div style={{ height: 80 }}>oldest</div>
        <div style={{ height }} data-testid='growing-body'>
          {tip}
        </div>
      </MessageScroller>
    </div>
  )
}

describe('MessageScroller', () => {
  it('opens a switched task at the newest content, not the top', async () => {
    render(<SwitchHarness />)
    const scroller = page.getByTestId('task-timeline')
    await expect.element(scroller).toBeInTheDocument()
    expect(isAtBottom(scrollerElement())).toBe(true)

    await userEvent.click(page.getByTestId('switch-task'))
    await expect.element(page.getByTestId('newest-content')).toHaveTextContent(
      'task-b newest',
    )
    const afterSwitch = scrollerElement()
    expect(isAtBottom(afterSwitch)).toBe(true)
    expect(afterSwitch.scrollTop).toBeGreaterThan(0)
  })

  it('does not steal scroll or increment unread when the same tip grows', async () => {
    render(<FollowTipHarness />)
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const scroller = scrollerElement()
    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event('scroll'))
    await expect
      .element(page.getByTestId('task-timeline'))
      .toHaveAttribute('data-follow-mode', 'user-pinned')

    const pinnedTop = scroller.scrollTop
    await userEvent.click(page.getByTestId('grow-body'))
    expect(scroller.scrollTop).toBe(pinnedTop)
    expect(document.querySelector('[data-testid="timeline-new-content"]')).toBeNull()
  })

  it('shows 有新内容 only after the tip identity changes, then jumps via scrollTop', async () => {
    render(<FollowTipHarness />)
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const scroller = scrollerElement()
    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event('scroll'))
    await expect
      .element(page.getByTestId('task-timeline'))
      .toHaveAttribute('data-follow-mode', 'user-pinned')

    await userEvent.click(page.getByTestId('bump-tip'))
    await expect.element(page.getByTestId('timeline-new-content')).toBeInTheDocument()
    expect(isAtBottom(scroller)).toBe(false)

    await userEvent.click(page.getByTestId('timeline-new-content'))
    expect(isAtBottom(scroller)).toBe(true)
    expect(document.querySelector('[data-testid="timeline-new-content"]')).toBeNull()
    await expect
      .element(page.getByTestId('task-timeline'))
      .toHaveAttribute('data-follow-mode', 'follow')
  })

  it('syncs followMode from the parent prop', async () => {
    render(<FollowTipHarness />)
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const scroller = scrollerElement()
    await userEvent.click(page.getByTestId('force-pin'))
    await expect
      .element(page.getByTestId('task-timeline'))
      .toHaveAttribute('data-follow-mode', 'user-pinned')

    await userEvent.click(page.getByTestId('bump-tip'))
    await expect.element(page.getByTestId('timeline-new-content')).toBeInTheDocument()
    await userEvent.click(page.getByTestId('force-follow'))
    await expect
      .element(page.getByTestId('task-timeline'))
      .toHaveAttribute('data-follow-mode', 'follow')
    expect(document.querySelector('[data-testid="timeline-new-content"]')).toBeNull()
    expect(isAtBottom(scroller)).toBe(true)
  })
})
