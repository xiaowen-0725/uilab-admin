import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { WorkbenchApp } from '@/app/composition/workbench-app'

const INSET = 8
const NAV_WIDTH = 272
const TOOLBAR_HEIGHT = 44
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

  it('Task-only: 44px Task toolbar, single title, no subtitle, icon controls', async () => {
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

    // Exactly one Task pane toolbar (compat testid + slot).
    const topBar = page.getByTestId('workspace-top-bar').element()
    await expect.element(page.getByTestId('workspace-top-bar')).toBeInTheDocument()
    expect(topBar.getAttribute('data-slot')).toBe('task-pane-toolbar')

    const titles = document.querySelectorAll(
      '[data-testid="workspace-top-bar"] h1'
    )
    expect(titles.length).toBe(1)
    expect(titles[0]?.textContent).toMatch(/任务 A/)

    // Subtitle must not appear in Task toolbar chrome.
    expect(
      document.querySelectorAll('[data-testid="workspace-top-bar"] p').length
    ).toBe(0)
    expect(topBar.textContent).not.toMatch(/验证 Task-only/)

    // TaskSurface is content-only — no second task title chrome inside the surface.
    expect(
      document.querySelectorAll('[data-testid="task-surface"] h1').length
    ).toBe(0)

    const topBarBox = topBar.getBoundingClientRect()
    expect(Math.abs(topBarBox.height - TOOLBAR_HEIGHT)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )

    // Context / Work remain accessible icon buttons (name via aria-label).
    const contextBtn = page.getByTestId('toggle-context').element()
    const workBtn = page.getByTestId('toggle-work-surface-chrome').element()
    await expect
      .element(page.getByRole('button', { name: '切换任务上下文面板' }))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: '切换工作面' }))
      .toBeInTheDocument()
    expect(contextBtn.getAttribute('aria-pressed')).toBe('false')
    expect(workBtn.getAttribute('aria-pressed')).toBe('false')
    expect(contextBtn.getAttribute('title')).toBeTruthy()
    expect(workBtn.getAttribute('title')).toBeTruthy()
    // Icon-only: no visible text labels on the controls.
    expect(contextBtn.textContent?.trim()).toBe('')
    expect(workBtn.textContent?.trim()).toBe('')
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

  it('pointer Context open is animated; keyboard Context is instant', async () => {
    await render(<WorkbenchApp />)
    const shell = page.getByTestId('workbench-shell')
    const panel = page.getByTestId('context-panel')
    await expect.element(panel).toHaveAttribute('data-open', 'false')

    await userEvent.click(page.getByTestId('toggle-context'))
    await expect.element(panel).toHaveAttribute('data-open', 'true')
    await expect.element(shell).toHaveAttribute('data-context-motion', 'animated')
    await expect.element(panel).toHaveTextContent('环境')
    await expect.element(panel).toHaveTextContent('变更')
    await expect.element(panel).toHaveTextContent('来源')
    await expect.element(panel).toHaveTextContent('子 Agent')

    await userEvent.click(page.getByTestId('toggle-context'))
    await expect.element(panel).toHaveAttribute('data-open', 'false')
    // Close is immediate.
    await expect.element(shell).toHaveAttribute('data-context-motion', 'instant')

    await shell.element().focus()
    await userEvent.keyboard('{Control>}i{/Control}')
    await expect.element(panel).toHaveAttribute('data-open', 'true')
    await expect.element(shell).toHaveAttribute('data-context-motion', 'instant')
  })

  it('pointer Work open/close/maximize sets pane-motion animated', async () => {
    await render(<WorkbenchApp />)
    const shell = page.getByTestId('workbench-shell')

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    const host = page.getByTestId('work-surface-host')
    await expect.element(host).toBeInTheDocument()
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'animated')
    await expect.element(host).toHaveAttribute('data-maximized', 'false')
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('Phase 6')

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect
      .poll(
        () => document.querySelector('[data-testid="work-surface-host"]') === null
      )
      .toBe(true)
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'animated')

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect.element(page.getByTestId('work-surface-host')).toBeInTheDocument()

    await userEvent.click(page.getByTestId('work-tab-tab-browser'))
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('浏览器预览')

    await userEvent.click(page.getByTestId('work-surface-maximize'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'true')
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'animated')

    await userEvent.click(page.getByTestId('work-surface-close'))
    await expect
      .poll(
        () => document.querySelector('[data-testid="work-surface-host"]') === null
      )
      .toBe(true)
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'animated')
  })

  it('split: Task and Work toolbars are 44px and pane-aligned without overlap', async () => {
    await page.viewport(1440, 900)
    await render(<WorkbenchApp />)

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()

    await expect
      .poll(() => {
        const taskPane = document.querySelector('[data-slot="task-pane"]')
        const workHost = document.querySelector(
          '[data-testid="work-surface-host"]'
        )
        return taskPane != null && workHost != null
      })
      .toBe(true)

    const taskPane = document.querySelector(
      '[data-slot="task-pane"]'
    ) as HTMLElement
    const taskToolbar = document.querySelector(
      '[data-slot="task-pane-toolbar"]'
    ) as HTMLElement
    const workHost = page.getByTestId('work-surface-host').element()
    const workToolbar = workHost.querySelector(
      '[data-slot="work-surface-toolbar"]'
    ) as HTMLElement

    expect(taskPane).toBeTruthy()
    expect(taskToolbar).toBeTruthy()
    expect(workToolbar).toBeTruthy()

    const taskPaneBox = taskPane.getBoundingClientRect()
    const taskToolbarBox = taskToolbar.getBoundingClientRect()
    const workHostBox = workHost.getBoundingClientRect()
    const workToolbarBox = workToolbar.getBoundingClientRect()

    expect(Math.abs(taskToolbarBox.height - TOOLBAR_HEIGHT)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    expect(Math.abs(workToolbarBox.height - TOOLBAR_HEIGHT)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )

    // Task toolbar bounds match Task pane horizontal extent.
    expect(Math.abs(taskToolbarBox.left - taskPaneBox.left)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    expect(
      Math.abs(taskToolbarBox.right - taskPaneBox.right)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)

    // Work toolbar bounds match Work pane horizontal extent.
    expect(Math.abs(workToolbarBox.left - workHostBox.left)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    expect(
      Math.abs(workToolbarBox.right - workHostBox.right)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)

    // Headers do not overlap.
    const headersOverlap =
      taskToolbarBox.left < workToolbarBox.right &&
      taskToolbarBox.right > workToolbarBox.left &&
      taskToolbarBox.top < workToolbarBox.bottom &&
      taskToolbarBox.bottom > workToolbarBox.top
    expect(headersOverlap).toBe(false)

    // Split: exactly one toggle-navigator, owned by Task toolbar (not Work).
    const navToggles = document.querySelectorAll(
      '[data-testid="toggle-navigator"]'
    )
    expect(navToggles.length).toBe(1)
    expect(taskToolbar.contains(navToggles[0]!)).toBe(true)
    expect(workToolbar.querySelector('[data-testid="toggle-navigator"]')).toBeNull()
  })

  it('wide maximized Work: unique toggle-navigator lives in Work toolbar and is clickable', async () => {
    await page.viewport(1440, 900)
    await render(<WorkbenchApp />)
    const shell = page.getByTestId('workbench-shell')

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('work-surface-maximize'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'true')

    // Task pane unmounted; Work toolbar hosts the sole Navigator control.
    expect(document.querySelector('[data-slot="task-pane"]')).toBeNull()
    const navToggles = document.querySelectorAll(
      '[data-testid="toggle-navigator"]'
    )
    expect(navToggles.length).toBe(1)

    const workToolbar = document.querySelector(
      '[data-slot="work-surface-toolbar"]'
    ) as HTMLElement
    expect(workToolbar).toBeTruthy()
    expect(workToolbar.contains(navToggles[0]!)).toBe(true)

    // Full-stage Work has no internal left divider (Workspace outer frame unchanged).
    const workHost = page.getByTestId('work-surface-host').element()
    expect(getComputedStyle(workHost).borderLeftWidth).toBe('0px')

    await expect.element(shell).toHaveAttribute('data-nav-open', 'true')
    await userEvent.click(page.getByTestId('toggle-navigator'))
    await expect.element(shell).toHaveAttribute('data-nav-open', 'false')
    await expect.element(shell).toHaveAttribute('data-nav-motion', 'animated')
  })

  it('760 serial Work: unique toggle-navigator lives in Work toolbar and is clickable', async () => {
    try {
      await page.viewport(760, 800)
      await render(<WorkbenchApp />)
      const shell = page.getByTestId('workbench-shell')
      await expect.element(shell).toHaveAttribute('data-viewport', 'narrow')

      await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
      await expect
        .element(page.getByTestId('work-surface-host'))
        .toBeInTheDocument()
      expect(document.querySelector('[data-testid="task-surface"]')).toBeNull()

      const navToggles = document.querySelectorAll(
        '[data-testid="toggle-navigator"]'
      )
      expect(navToggles.length).toBe(1)

      const workToolbar = document.querySelector(
        '[data-slot="work-surface-toolbar"]'
      ) as HTMLElement
      expect(workToolbar).toBeTruthy()
      expect(workToolbar.contains(navToggles[0]!)).toBe(true)

      // Narrow starts with Navigator auto-closed; open via Work toolbar control.
      await expect.element(shell).toHaveAttribute('data-nav-open', 'false')
      await userEvent.click(page.getByTestId('toggle-navigator'))
      await expect.element(shell).toHaveAttribute('data-nav-open', 'true')
      await expect.element(shell).toHaveAttribute('data-nav-motion', 'animated')
    } finally {
      await page.viewport(1440, 900)
    }
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

    // Task switch marks context/pane motion instant (no restored entry animation).
    const shell = page.getByTestId('workbench-shell')
    await expect.element(shell).toHaveAttribute('data-context-motion', 'instant')
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')
  })

  it('keyboard Work/Context are instant; Escape exits maximize instantly', async () => {
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

    // Ctrl/Cmd+I toggles context — instant
    await userEvent.keyboard('{Control>}i{/Control}')
    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'true')
    await expect.element(shell).toHaveAttribute('data-context-motion', 'instant')

    // Ctrl/Cmd+Shift+W toggles work surface — instant
    await userEvent.keyboard('{Control>}{Shift>}w{/Shift}{/Control}')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')

    // Maximize via pointer (animated), Escape restores instantly
    await userEvent.click(page.getByTestId('work-surface-maximize'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'true')

    await userEvent.keyboard('{Escape}')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'false')
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')
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

      // At 1024 split: Task toolbar only on Task; Work toolbar only on Work.
      const taskToolbar = document.querySelector(
        '[data-slot="task-pane-toolbar"]'
      ) as HTMLElement
      const workToolbar = document.querySelector(
        '[data-slot="work-surface-toolbar"]'
      ) as HTMLElement
      const taskPane = document.querySelector(
        '[data-slot="task-pane"]'
      ) as HTMLElement
      expect(taskPane.contains(taskToolbar)).toBe(true)
      expect(workBox.left).toBeGreaterThanOrEqual(
        taskToolbar.getBoundingClientRect().right - GEOMETRY_TOLERANCE
      )
      expect(
        Math.abs(workToolbar.getBoundingClientRect().height - TOOLBAR_HEIGHT)
      ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)

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

  it('narrow 760×800: full-bleed Workspace; Context overlay; Work serial with operable toolbar', async () => {
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

      // Work toolbar remains operable when serial/full-stage.
      const workToolbar = document.querySelector(
        '[data-slot="work-surface-toolbar"]'
      ) as HTMLElement
      expect(workToolbar).toBeTruthy()
      expect(
        Math.abs(workToolbar.getBoundingClientRect().height - TOOLBAR_HEIGHT)
      ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
      await userEvent.click(page.getByTestId('work-surface-maximize'))
      await expect
        .element(page.getByTestId('work-surface-host'))
        .toHaveAttribute('data-maximized', 'true')
      await userEvent.click(page.getByTestId('work-surface-close'))
      await expect
        .poll(
          () =>
            document.querySelector('[data-testid="work-surface-host"]') === null
        )
        .toBe(true)

      // Re-open for restore path used by medium viewport check below.
      await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
      await expect
        .element(page.getByTestId('work-surface-host'))
        .toBeInTheDocument()

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
