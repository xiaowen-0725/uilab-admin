/**
 * Ticket 03 — user channel open Work Surface from Timeline file-change card.
 * Path: submit Fake「工作流」→ file-change card → open → pane + test surface body.
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function bootAndNewChat() {
  await render(<WorkbenchApp persistence='memory' />)
  await expect
    .element(page.getByTestId('workbench-shell'))
    .toBeInTheDocument()
  await userEvent.click(page.getByTestId('navigator-new-chat'))
  await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
}

describe('Work Surface user open channel (ticket 03)', () => {
  it('opens Work Surface tab from Timeline file-change card via Session', async () => {
    await bootAndNewChat()

    await userEvent.fill(page.getByTestId('composer-input'), '运行工作流')
    await userEvent.click(page.getByTestId('composer-submit'))
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()

    // Wait for Fake fixture-workflow to finish (status leaves running).
    await expect
      .poll(
        () => {
          const shell = page.getByTestId('task-timeline').element()
          return shell.getAttribute('data-run-status')
        },
        { timeout: 10000 },
      )
      .toBe('completed')

    // Brief settle so process-fold auto-collapse finishes.
    await sleep(50)

    // Expand process fold if collapsed (file-change lives inside).
    const toggle = page.getByTestId('timeline-turn-toggle')
    await expect.element(toggle).toBeInTheDocument()
    if (toggle.element().getAttribute('aria-expanded') !== 'true') {
      await userEvent.click(toggle)
    }

    await expect
      .poll(
        () =>
          document.querySelector(
            '[data-kind="file-change"] [data-testid$="-open"]',
          ) != null,
        { timeout: 3000 },
      )
      .toBe(true)

    const openEl = document.querySelector(
      '[data-kind="file-change"] [data-testid$="-open"]',
    ) as HTMLElement
    const openTestId = openEl.getAttribute('data-testid')
    expect(openTestId).toBeTruthy()

    await userEvent.click(page.getByTestId(openTestId!))

    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-visible', 'true')
    await expect
      .element(page.getByTestId('work-surface-test-body'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-test-body'))
      .toHaveAttribute(
        'data-resource-key',
        'fixture/notes/workflow-result.md',
      )
    // Pane open, not maximized (user focus default).
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'false')
  })
})
