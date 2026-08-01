import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { WorkbenchApp } from '@/app/composition/workbench-app'

describe('Workbench Shell integration (visible behavior)', () => {
  it('renders project, tasks, and static fixture disclosure', async () => {
    await render(<WorkbenchApp />)

    await expect
      .element(page.getByTestId('workbench-shell'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('project-name'))
      .toHaveTextContent('UI Lab 演示项目')

    await expect
      .element(page.getByRole('button', { name: /任务 A/ }))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: /任务 B/ }))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: /任务 C/ }))
      .toBeInTheDocument()

    await expect
      .element(page.getByTestId('fixture-disclosure'))
      .toHaveTextContent('静态 Phase 3 fixture')
    await expect
      .element(page.getByTestId('task-surface'))
      .toBeInTheDocument()
    // Task-only: Work Surface host not mounted
    expect(document.querySelector('[data-testid="work-surface-host"]')).toBeNull()
  })

  it('toggles Context Panel', async () => {
    await render(<WorkbenchApp />)
    const panel = page.getByTestId('context-panel')
    await expect.element(panel).toHaveAttribute('data-open', 'false')

    await userEvent.click(page.getByTestId('toggle-context'))
    await expect.element(panel).toHaveAttribute('data-open', 'true')
    await expect.element(panel).toHaveTextContent('环境')
    await expect.element(panel).toHaveTextContent('变更')
    await expect.element(panel).toHaveTextContent('来源')
    await expect.element(panel).toHaveTextContent('子 Agent')

    await userEvent.click(page.getByTestId('toggle-context'))
    await expect.element(panel).toHaveAttribute('data-open', 'false')
  })

  it('opens Work Surface, switches tabs, maximizes, and closes', async () => {
    await render(<WorkbenchApp />)

    await userEvent.click(page.getByTestId('open-work-surface'))
    const host = page.getByTestId('work-surface-host')
    await expect.element(host).toBeInTheDocument()
    await expect.element(host).toHaveAttribute('data-maximized', 'false')
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('Phase 6')

    await userEvent.click(page.getByTestId('work-tab-tab-browser'))
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('浏览器预览')

    await userEvent.click(page.getByTestId('work-surface-maximize'))
    await expect.element(host).toHaveAttribute('data-maximized', 'true')

    await userEvent.click(page.getByTestId('work-surface-close'))
    expect(document.querySelector('[data-testid="work-surface-host"]')).toBeNull()
  })

  it('restores per-Task layout when switching A → B → A', async () => {
    await render(<WorkbenchApp />)

    // Configure Task A (leave Work Surface open but not maximized so Task/Context stay mounted)
    await userEvent.click(page.getByTestId('open-work-surface'))
    await userEvent.click(page.getByTestId('toggle-context'))
    await userEvent.click(page.getByTestId('work-tab-tab-browser'))

    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'true')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('浏览器预览')

    // Task B defaults: Task-only
    await userEvent.click(page.getByRole('button', { name: /任务 B/ }))
    expect(document.querySelector('[data-testid="work-surface-host"]')).toBeNull()
    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'false')
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-task-id', 'task-b')

    // Back to A restores
    await userEvent.click(page.getByRole('button', { name: /任务 A/ }))
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-task-id', 'task-a')
    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'true')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('浏览器预览')
  })

  it('honors keyboard shortcuts for navigator, context, work surface, Escape', async () => {
    await render(<WorkbenchApp />)
    const shell = page.getByTestId('workbench-shell')
    await shell.element().focus()

    // Ctrl/Cmd+B toggles navigator
    await userEvent.keyboard('{Control>}b{/Control}')
    expect(document.querySelector('[data-testid="navigator"]')).toBeNull()
    await userEvent.keyboard('{Control>}b{/Control}')
    await expect.element(page.getByTestId('navigator')).toBeInTheDocument()

    // Ctrl/Cmd+I toggles context
    await userEvent.keyboard('{Control>}i{/Control}')
    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'true')

    // Ctrl/Cmd+Shift+W toggles work surface
    await userEvent.keyboard('{Control>}{Shift>}w{/Shift}{/Control}')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('work-surface-maximize'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'true')

    await userEvent.keyboard('{Escape}')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'false')
  })

  it('Composer does not fake Runtime submission', async () => {
    await render(<WorkbenchApp />)
    const input = page.getByTestId('composer-input')
    const submit = page.getByTestId('composer-submit')

    await expect.element(submit).toBeDisabled()
    await userEvent.fill(input, 'hello fixture')
    await expect.element(submit).toBeEnabled()

    await userEvent.click(submit)
    await expect
      .element(page.getByTestId('composer-notice'))
      .toHaveTextContent('不会调用 Agent Runtime')
    // Still local — no network / runtime status region appears
    expect(document.querySelector('[data-runtime-run]')).toBeNull()
  })

  it('medium 1024×768 keeps Task/Work on-screen without clipping; Context overlays', async () => {
    await page.viewport(1024, 768)
    try {
      await render(<WorkbenchApp />)

      await expect
        .element(page.getByTestId('workbench-shell'))
        .toHaveAttribute('data-viewport', 'medium')

      await userEvent.click(page.getByTestId('open-work-surface'))
      await expect
        .element(page.getByTestId('work-surface-host'))
        .toBeInTheDocument()

      // Wait until Stage-aware clamp leaves Work fully inside Stage.
      await expect
        .poll(() => {
          const task = page.getByTestId('task-surface').element()
          const work = page.getByTestId('work-surface-host').element()
          const stage = page.getByTestId('workbench-stage').element()
          const taskBox = task.getBoundingClientRect()
          const workBox = work.getBoundingClientRect()
          const stageBox = stage.getBoundingClientRect()
          return (
            taskBox.width >= 420 &&
            workBox.width >= 320 &&
            workBox.right <= stageBox.right + 1
          )
        })
        .toBe(true)

      const taskBox = page
        .getByTestId('task-surface')
        .element()
        .getBoundingClientRect()
      const workBox = page
        .getByTestId('work-surface-host')
        .element()
        .getBoundingClientRect()
      const stageBox = page
        .getByTestId('workbench-stage')
        .element()
        .getBoundingClientRect()

      expect(taskBox.width).toBeGreaterThanOrEqual(420)
      expect(workBox.width).toBeGreaterThanOrEqual(320)
      // Work right edge must not exceed Stage right (1px tolerance).
      expect(workBox.right).toBeLessThanOrEqual(stageBox.right + 1)

      // With side-by-side Work, Task is constrained → Context is overlay (overlaps stream).
      await userEvent.click(page.getByTestId('toggle-context'))
      await expect
        .element(page.getByTestId('context-panel'))
        .toHaveAttribute('data-open', 'true')

      const panelBox = page
        .getByTestId('context-panel')
        .element()
        .getBoundingClientRect()
      const streamBox = page
        .getByTestId('execution-stream')
        .element()
        .getBoundingClientRect()

      const overlaps =
        panelBox.left < streamBox.right &&
        panelBox.right > streamBox.left &&
        panelBox.top < streamBox.bottom &&
        panelBox.bottom > streamBox.top
      expect(overlaps).toBe(true)

      // Pointer click on resize separator focuses it so keyboard resize continues.
      const resize = page.getByTestId('work-surface-resize')
      const valueBefore = Number(resize.element().getAttribute('aria-valuenow'))
      await userEvent.click(resize)
      expect(document.activeElement).toBe(resize.element())

      await userEvent.keyboard('{ArrowLeft}')
      await expect
        .poll(() => Number(resize.element().getAttribute('aria-valuenow')))
        .toBeGreaterThan(valueBefore)

      const taskAfter = page
        .getByTestId('task-surface')
        .element()
        .getBoundingClientRect()
      const workAfter = page
        .getByTestId('work-surface-host')
        .element()
        .getBoundingClientRect()
      const stageAfter = page
        .getByTestId('workbench-stage')
        .element()
        .getBoundingClientRect()
      expect(taskAfter.left).toBeGreaterThanOrEqual(stageAfter.left - 1)
      expect(workAfter.right).toBeLessThanOrEqual(stageAfter.right + 1)
      expect(taskAfter.right).toBeLessThanOrEqual(workAfter.left + 2)
    } finally {
      await page.viewport(1440, 900)
    }
  })

  it('narrow 760×800 Context overlays Task-only; Work serial fills Stage without overflow', async () => {
    await page.viewport(760, 800)
    try {
      await render(<WorkbenchApp />)

      await expect
        .element(page.getByTestId('workbench-shell'))
        .toHaveAttribute('data-viewport', 'narrow')
      await expect
        .element(page.getByTestId('task-surface'))
        .toBeInTheDocument()
      expect(document.querySelector('[data-testid="work-surface-host"]')).toBeNull()

      // Task-only at 760: Context must overlay (panel overlaps execution stream).
      await userEvent.click(page.getByTestId('toggle-context'))
      await expect
        .element(page.getByTestId('context-panel'))
        .toHaveAttribute('data-open', 'true')

      await expect
        .poll(() => {
          const panelBox = page
            .getByTestId('context-panel')
            .element()
            .getBoundingClientRect()
          const streamBox = page
            .getByTestId('execution-stream')
            .element()
            .getBoundingClientRect()
          return (
            panelBox.left < streamBox.right &&
            panelBox.right > streamBox.left &&
            panelBox.top < streamBox.bottom &&
            panelBox.bottom > streamBox.top
          )
        })
        .toBe(true)

      expect(document.body.scrollWidth).toBeLessThanOrEqual(
        document.body.clientWidth + 1
      )

      // Open Work: serial full-stage — Task unmounts, Work matches Stage, no overflow.
      await userEvent.click(page.getByTestId('open-work-surface'))
      await expect
        .element(page.getByTestId('work-surface-host'))
        .toBeInTheDocument()
      expect(document.querySelector('[data-testid="task-surface"]')).toBeNull()

      await expect
        .poll(() => {
          const work = page.getByTestId('work-surface-host').element()
          const stage = page.getByTestId('workbench-stage').element()
          const workBox = work.getBoundingClientRect()
          const stageBox = stage.getBoundingClientRect()
          return Math.abs(workBox.width - stageBox.width) <= 2
        })
        .toBe(true)

      const workBox = page
        .getByTestId('work-surface-host')
        .element()
        .getBoundingClientRect()
      const stageBox = page
        .getByTestId('workbench-stage')
        .element()
        .getBoundingClientRect()
      expect(Math.abs(workBox.width - stageBox.width)).toBeLessThanOrEqual(2)
      expect(workBox.right).toBeLessThanOrEqual(stageBox.right + 1)
      expect(document.body.scrollWidth).toBeLessThanOrEqual(
        document.body.clientWidth + 1
      )

      // Returning to a split-capable viewport restores the Task-scoped desired width.
      // Responsive geometry may cap rendered width, but must not overwrite Session state.
      await page.viewport(1024, 768)
      await expect
        .element(page.getByTestId('workbench-shell'))
        .toHaveAttribute('data-viewport', 'medium')
      const resize = page.getByTestId('work-surface-resize')
      await expect.element(resize).toBeInTheDocument()
      await expect
        .poll(() => Number(resize.element().getAttribute('aria-valuenow')))
        .toBe(480)

      const restoredWork = page
        .getByTestId('work-surface-host')
        .element()
        .getBoundingClientRect()
      const restoredStage = page
        .getByTestId('workbench-stage')
        .element()
        .getBoundingClientRect()
      expect(restoredWork.right).toBeLessThanOrEqual(restoredStage.right + 1)
    } finally {
      await page.viewport(1440, 900)
    }
  })
})
