import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TaskComposer } from './composer'

describe('Composer stop control', () => {
  it('keeps the stop button enabled and calls cancel while a run is live', async () => {
    const onCancelRun = vi.fn(async () => undefined)
    await render(
      <TaskComposer
        mode='runtime'
        turnStatus='running'
        onCancelRun={onCancelRun}
      />,
    )
    const submit = page.getByTestId('composer-submit')
    await expect.element(submit).toHaveAttribute('data-send-mode', 'stop')
    await expect.element(submit).toHaveAttribute('aria-label', '停止')
    expect(submit.element().hasAttribute('disabled')).toBe(false)

    await userEvent.click(submit)
    expect(onCancelRun).toHaveBeenCalledTimes(1)
  })
})
