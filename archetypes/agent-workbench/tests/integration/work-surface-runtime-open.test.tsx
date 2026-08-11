/**
 * Ticket 07 — Runtime work_surface.open_requested channel (A4/A5).
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

async function bootAndNewChat() {
  await render(<WorkbenchApp persistence='memory' />)
  await expect
    .element(page.getByTestId('workbench-shell'))
    .toBeInTheDocument()
  await userEvent.click(page.getByTestId('navigator-new-chat'))
  await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
}

async function waitRunCompleted() {
  await expect
    .poll(
      () =>
        page.getByTestId('task-timeline').element().getAttribute('data-run-status'),
      { timeout: 10000 },
    )
    .toBe('completed')
}

describe('Work Surface runtime open channel (ticket 07)', () => {
  it('open_requested document opens tabs; file.changed workflow does not auto-open', async () => {
    await bootAndNewChat()

    // fixture-workflow emits file.changed but NOT open_requested
    await userEvent.fill(page.getByTestId('composer-input'), '运行工作流')
    await userEvent.click(page.getByTestId('composer-submit'))
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    await waitRunCompleted()

    // file.changed must not seed openTabs: open pane → empty notice (no document body)
    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('工作区暂无打开的标签')
    expect(
      document.querySelector('[data-testid="work-surface-document"]'),
    ).toBeNull()
    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))

    // Runtime document open request
    await userEvent.fill(page.getByTestId('composer-input'), '打开文档预览')
    await userEvent.click(page.getByTestId('composer-submit'))
    await waitRunCompleted()

    // runtime default with pane hidden: openTabs only — open chrome to inspect
    if (!document.querySelector('[data-testid="work-surface-host"]')) {
      await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    }
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expect
      .poll(() =>
        page
          .getByTestId('work-surface-document')
          .element()
          .getAttribute('data-resource-key'),
      )
      .toBe('fixture/notes/plan.txt')
  })

  it('open_requested browser creates browser surface; illegal path does not open', async () => {
    await bootAndNewChat()

    await userEvent.fill(page.getByTestId('composer-input'), '非法路径测试')
    await userEvent.click(page.getByTestId('composer-submit'))
    await waitRunCompleted()
    // Illegal open_requested must not open pane or leave browser/document body
    expect(
      document.querySelector('[data-testid="work-surface-browser"]'),
    ).toBeNull()
    expect(
      document.querySelector('[data-testid="work-surface-document"]'),
    ).toBeNull()

    await userEvent.fill(page.getByTestId('composer-input'), '打开浏览器预览')
    await userEvent.click(page.getByTestId('composer-submit'))
    await waitRunCompleted()

    // runtime may only seed openTabs; open pane to inspect
    if (!document.querySelector('[data-testid="work-surface-host"]')) {
      await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    }
    await expect
      .element(page.getByTestId('work-surface-browser'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-browser'))
      .toHaveAttribute('data-resource-key', 'https://example.com/')
  })
})
