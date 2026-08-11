/**
 * Real Task Lifecycle — Runtime vertical slice (product default path).
 * Cold start: empty shell; new chat → Runtime empty hub → submit → Timeline.
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

async function waitBooted() {
  await expect
    .element(page.getByTestId('workbench-shell'))
    .toBeInTheDocument()
}

async function openNewChat() {
  await userEvent.click(page.getByTestId('navigator-new-chat'))
  await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
  await expect
    .element(page.getByTestId('composer'))
    .toHaveAttribute('data-composer-mode', 'runtime')
}

describe('Workbench Real Task Lifecycle — Runtime path', () => {
  it('cold start: default project, zero tasks, no capture seed (A8/A10)', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()

    await expect
      .element(page.getByTestId('project-name'))
      .toHaveTextContent('默认项目')
    await expect
      .element(page.getByTestId('workspace-empty-shell'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('navigator-tasks-empty'))
      .toBeInTheDocument()
    expect(document.querySelector('[data-testid="execution-stream"]')).toBeNull()
    expect(document.querySelector('[data-testid="navigator-utilities"]')).toBeNull()
  })

  it('new chat → 新对话 catalog + Runtime empty hub (A2)', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()
    await openNewChat()

    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-content-mode', 'empty')
    await expect
      .element(page.getByTestId('composer'))
      .toHaveAttribute('data-composer-mode', 'runtime')
    await expect
      .element(page.getByTestId('composer-model'))
      .toHaveTextContent('本地侧车模型')

    // Catalog row titled 新对话
    const taskButtons = document.querySelectorAll(
      '[data-testid^="task-task-"]',
    )
    expect(taskButtons.length).toBeGreaterThanOrEqual(1)
    expect(
      [...taskButtons].some((el) => el.textContent?.includes('新对话')),
    ).toBe(true)
  })

  it('empty task: submit shows timeline and completed status', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()
    await openNewChat()

    const input = page.getByTestId('composer-input')
    const submit = page.getByTestId('composer-submit')
    await userEvent.fill(input, 'hello fake runtime')
    await userEvent.click(submit)

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    // Honesty banner is sr-only (no visible product chrome)
    const honesty = page.getByTestId('runtime-honesty-banner').element()
    expect(honesty.classList.contains('sr-only')).toBe(true)
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-content-mode', 'runtime')

    await expect
      .element(page.getByTestId('timeline-run-status-label'))
      .toHaveTextContent('已处理')

    const timeline = page.getByTestId('task-timeline').element()
    expect(timeline.getAttribute('data-runtime-run')).toBe('completed')
    expect(timeline.getAttribute('data-run-status')).toBe('completed')
    expect(timeline.getAttribute('data-honesty-mode')).toBe('voltagent')

    expect(
      document.querySelectorAll('[data-category="user-message"]').length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      document.querySelectorAll('[data-category="assistant-message"]').length,
    ).toBeGreaterThanOrEqual(1)

    const titles = document.querySelectorAll(
      '[data-testid="workspace-top-bar"] h1',
    )
    expect(titles[0]?.textContent).toMatch(/hello fake runtime/)
  })

  it('new chat is idempotent on empty draft; creates after first turn', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()
    await openNewChat()
    const firstTaskId = page.getByTestId('task-surface').element().dataset.taskId

    // Second click while still on blank hub must not spawn another catalog row.
    await userEvent.click(page.getByTestId('navigator-new-chat'))
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    expect(page.getByTestId('task-surface').element().dataset.taskId).toBe(
      firstTaskId,
    )
    const blankRows = document.querySelectorAll(
      '[data-testid^="task-task-"]',
    )
    expect(blankRows.length).toBe(1)

    // After first submit, title leaves「新对话」→ next 新对话 creates a new task.
    await userEvent.fill(page.getByTestId('composer-input'), 'hello draft')
    await userEvent.click(page.getByTestId('composer-submit'))
    await expect
      .element(page.getByTestId('task-timeline'))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('navigator-new-chat'))
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    const secondTaskId = page.getByTestId('task-surface').element().dataset.taskId
    expect(secondTaskId).not.toBe(firstTaskId)
  })

  it('hard-deletes a task with confirm dialog (A4)', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()
    await openNewChat()
    const taskId = page.getByTestId('task-surface').element().dataset.taskId
    expect(taskId).toBeTruthy()

    await userEvent.click(page.getByTestId(`task-delete-${taskId}`))
    await expect
      .element(page.getByTestId('delete-task-dialog'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('delete-task-dialog'))
      .toHaveTextContent(/无法恢复|移除任务/)
    await userEvent.click(page.getByTestId('delete-task-confirm'))

    await expect
      .element(page.getByTestId('workspace-empty-shell'))
      .toBeInTheDocument()
    expect(document.querySelector(`[data-testid="task-${taskId}"]`)).toBeNull()
  })

  it('launch card submits Runtime prompt (not capture stream)', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()
    await openNewChat()

    await userEvent.click(page.getByTestId('empty-hub-action-explore'))
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="execution-stream"]')).toBeNull()
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-content-mode', 'runtime')
  })
})
