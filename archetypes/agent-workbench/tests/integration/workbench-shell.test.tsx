import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { WorkbenchApp } from '@/app/composition/workbench-app'

const INSET = 8
const NAV_WIDTH = 272
const GEOMETRY_TOLERANCE = 2

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

  it('1440 expanded: Navigator ~272px, Workspace inset, single task top bar', async () => {
    await page.viewport(1440, 900)
    await render(<WorkbenchApp />)

    const shell = page.getByTestId('workbench-shell')
    await expect.element(shell).toHaveAttribute('data-viewport', 'wide')
    await expect.element(shell).toHaveAttribute('data-nav-open', 'true')

    const nav = page.getByTestId('navigator').element()
    const workspace = page.getByTestId('workbench-workspace').element()
    const navBox = nav.getBoundingClientRect()
    const wsBox = workspace.getBoundingClientRect()

    expect(Math.abs(navBox.width - NAV_WIDTH)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    // Workspace: 8px top/right/bottom; left sits against Navigator (no extra gap).
    expect(Math.abs(wsBox.top - INSET)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(
      Math.abs(window.innerWidth - wsBox.right - INSET)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(
      Math.abs(window.innerHeight - wsBox.bottom - INSET)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(Math.abs(wsBox.left - navBox.right)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )

    // Exactly one visible Task title/top bar (merged chrome).
    await expect
      .element(page.getByTestId('workspace-top-bar'))
      .toBeInTheDocument()
    const titles = document.querySelectorAll(
      '[data-testid="workspace-top-bar"] h1'
    )
    expect(titles.length).toBe(1)
    expect(titles[0]?.textContent).toMatch(/任务 A/)
    // TaskSurface is content-only — no second task title chrome inside the surface.
    expect(
      document.querySelectorAll('[data-testid="task-surface"] h1').length
    ).toBe(0)
  })

  it('1440 collapsed by pointer: Navigator inert, left inset, animated motion', async () => {
    await page.viewport(1440, 900)
    await render(<WorkbenchApp />)

    const shell = page.getByTestId('workbench-shell')
    await userEvent.click(page.getByTestId('toggle-navigator'))

    await expect.element(shell).toHaveAttribute('data-nav-open', 'false')
    await expect.element(shell).toHaveAttribute('data-nav-motion', 'animated')

    await expect.element(page.getByTestId('navigator')).toHaveAttribute(
      'data-open',
      'false'
    )
    const nav = page.getByTestId('navigator').element()
    expect(nav.getAttribute('aria-hidden')).toBe('true')
    expect(nav.hasAttribute('inert')).toBe(true)
    expect(page.getByTestId('navigator-filter').element().tabIndex).toBe(-1)
    expect(page.getByTestId('task-task-a').element().tabIndex).toBe(-1)

    // Wait for pointer motion / layout settle (180ms drawer curve).
    await expect
      .poll(() => {
        const wsBox = page
          .getByTestId('workbench-workspace')
          .element()
          .getBoundingClientRect()
        return Math.abs(wsBox.left - INSET) <= GEOMETRY_TOLERANCE
      })
      .toBe(true)

    const wsBox = page
      .getByTestId('workbench-workspace')
      .element()
      .getBoundingClientRect()
    // Collapsed: ~8px left inset; workspace expands into remaining viewport.
    expect(Math.abs(wsBox.left - INSET)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(wsBox.width).toBeGreaterThan(1400 - INSET * 2 - GEOMETRY_TOLERANCE)
  })

  it('keyboard Ctrl+B toggles navigator with instant motion', async () => {
    await page.viewport(1440, 900)
    await render(<WorkbenchApp />)
    const shell = page.getByTestId('workbench-shell')
    await shell.element().focus()

    await userEvent.keyboard('{Control>}b{/Control}')
    await expect.element(shell).toHaveAttribute('data-nav-open', 'false')
    await expect.element(shell).toHaveAttribute('data-nav-motion', 'instant')
    await expect
      .element(page.getByTestId('navigator'))
      .toHaveAttribute('data-open', 'false')

    await userEvent.keyboard('{Control>}b{/Control}')
    await expect.element(shell).toHaveAttribute('data-nav-open', 'true')
    await expect.element(shell).toHaveAttribute('data-nav-motion', 'instant')
    await expect
      .element(page.getByTestId('navigator'))
      .toHaveAttribute('data-open', 'true')
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

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    const host = page.getByTestId('work-surface-host')
    await expect.element(host).toBeInTheDocument()
    await expect.element(host).toHaveAttribute('data-maximized', 'false')
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('Phase 6')

    // The merged top-bar control preserves the original Shell toggle behavior.
    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    expect(document.querySelector('[data-testid="work-surface-host"]')).toBeNull()
    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect.element(host).toBeInTheDocument()

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
    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
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

    // Ctrl/Cmd+B toggles navigator (stays mounted; open=false)
    await userEvent.keyboard('{Control>}b{/Control}')
    await expect
      .element(page.getByTestId('navigator'))
      .toHaveAttribute('data-open', 'false')
    await userEvent.keyboard('{Control>}b{/Control}')
    await expect
      .element(page.getByTestId('navigator'))
      .toHaveAttribute('data-open', 'true')

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

  it('Composer does not fake Runtime submission and stays within Task Surface', async () => {
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

    // One Composer, contained by Task Surface.
    const composers = document.querySelectorAll('[data-testid="composer"]')
    expect(composers.length).toBe(1)
    const task = page.getByTestId('task-surface').element()
    expect(task.contains(composers[0]!)).toBe(true)
  })

  it('medium 1024×768: overlay nav free when closed; Task/Work containment; Context overlay', async () => {
    await page.viewport(1024, 768)
    try {
      await render(<WorkbenchApp />)

      await expect
        .element(page.getByTestId('workbench-shell'))
        .toHaveAttribute('data-viewport', 'medium')

      // Overlay Navigator closed by default after mode transition — no reserved width.
      await expect
        .element(page.getByTestId('workbench-shell'))
        .toHaveAttribute('data-nav-open', 'false')
      const workspace = page.getByTestId('workbench-workspace').element()
      const wsBox = workspace.getBoundingClientRect()
      expect(Math.abs(wsBox.left - INSET)).toBeLessThanOrEqual(
        GEOMETRY_TOLERANCE
      )
      // Overlay host stays mounted but closed must not consume reserved width.
      const overlay = page.getByTestId('navigator-overlay').element()
      expect(overlay.getAttribute('data-open')).toBe('false')
      expect(getComputedStyle(overlay).pointerEvents).toBe('none')
      const closedOverlayNav = page.getByTestId('navigator').element()
      expect(closedOverlayNav.hasAttribute('inert')).toBe(true)
      expect(page.getByTestId('navigator-filter').element().tabIndex).toBe(-1)

      await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
      await expect
        .element(page.getByTestId('work-surface-host'))
        .toBeInTheDocument()

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
      expect(workBox.right).toBeLessThanOrEqual(stageBox.right + 1)

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

  it('narrow 760×800: full-bleed Workspace; Context overlay; Work serial', async () => {
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

      // Full-bleed: no outer margin on Workspace.
      const wsBox = page
        .getByTestId('workbench-workspace')
        .element()
        .getBoundingClientRect()
      expect(Math.abs(wsBox.left)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
      expect(Math.abs(wsBox.top)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
      expect(Math.abs(wsBox.width - 760)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)

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

      await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
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
