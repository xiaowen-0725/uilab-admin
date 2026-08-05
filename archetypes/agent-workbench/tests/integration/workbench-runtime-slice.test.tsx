/**
 * Phase 4C — Task Pane vertical slice (Fake Runtime dual-path).
 * Empty / new-chat path only; default capture seed stays local-sim.
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

describe('Workbench Phase 4C Fake Runtime vertical slice', () => {
  it('empty task: submit shows timeline, honesty banner, completed status', async () => {
    await render(<WorkbenchApp />)

    // Default seed is capture — leave local-sim path.
    await expect
      .element(page.getByTestId('execution-stream'))
      .toBeInTheDocument()
    expect(document.querySelector('[data-runtime-run]')).toBeNull()

    // Enter empty / Fake Runtime path.
    await userEvent.click(page.getByTestId('task-task-empty'))
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer'))
      .toHaveAttribute('data-composer-mode', 'runtime')

    const input = page.getByTestId('composer-input')
    const submit = page.getByTestId('composer-submit')
    await userEvent.fill(input, 'hello fake runtime')
    await userEvent.click(submit)

    // Auto-flush Fake clock after submit → completed timeline.
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('runtime-honesty-banner'))
      .toHaveTextContent(/Deterministic Fake Runtime|非生产/)
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-content-mode', 'runtime')

    await expect
      .element(page.getByTestId('timeline-run-status-label'))
      .toHaveTextContent('已处理')

    const timeline = page.getByTestId('task-timeline').element()
    expect(timeline.getAttribute('data-runtime-run')).toBe('completed')
    expect(timeline.getAttribute('data-run-status')).toBe('completed')

    // User + assistant projected.
    expect(
      document.querySelectorAll('[data-category="user-message"]').length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      document.querySelectorAll('[data-category="assistant-message"]').length,
    ).toBeGreaterThanOrEqual(1)

    await expect
      .element(page.getByTestId('composer-notice'))
      .toHaveTextContent(/非生产|不会调用远程/)

    // Toolbar title follows local title policy from first message.
    const titles = document.querySelectorAll(
      '[data-testid="workspace-top-bar"] h1',
    )
    expect(titles[0]?.textContent).toMatch(/hello fake runtime/)
  })

  it('new chat navigates to empty runtime path', async () => {
    await render(<WorkbenchApp />)
    await userEvent.click(page.getByTestId('navigator-new-chat'))
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-task-id', 'task-empty')
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer'))
      .toHaveAttribute('data-composer-mode', 'runtime')
  })

  it('waiting_for_input: Composer Send submits clarification (not cancel)', async () => {
    await render(<WorkbenchApp />)
    await userEvent.click(page.getByTestId('task-task-empty'))

    const input = page.getByTestId('composer-input')
    const submit = page.getByTestId('composer-submit')

    // Keyword routes Fake scenario → waiting-input.
    await userEvent.fill(input, '请澄清一下需求')
    await userEvent.click(submit)

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('task-timeline'))
      .toHaveAttribute('data-run-status', 'waiting_for_input')
    await expect
      .element(page.getByTestId('runtime-input-notice'))
      .toBeInTheDocument()

    // Send must stay in send mode (not Stop) while waiting for input.
    await expect
      .element(page.getByTestId('composer-submit'))
      .toHaveAttribute('data-send-mode', 'send')
    await expect
      .element(page.getByTestId('composer-submit'))
      .toHaveAttribute('aria-label', '发送')

    await userEvent.fill(input, '补充：用中文单文件')
    await userEvent.click(submit)

    // Clarification resumes Fake run → completed (cancel would leave cancelled).
    await expect
      .element(page.getByTestId('timeline-run-status-label'))
      .toHaveTextContent('已处理')
    const timeline = page.getByTestId('task-timeline').element()
    expect(timeline.getAttribute('data-run-status')).toBe('completed')
    await expect
      .element(page.getByTestId('composer-notice'))
      .toHaveTextContent(/澄清|非生产/)
  })
})
