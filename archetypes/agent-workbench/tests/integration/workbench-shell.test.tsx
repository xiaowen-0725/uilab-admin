import { WorkbenchApp } from '@/app/composition/workbench-app'
import { flushSync } from 'react-dom'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

/** Shipped Phase 3A contract: wide/medium Workspace uses an 8px inset. */
const INSET = 8
const NAV_WIDTH = 306
const TOOLBAR_HEIGHT = 44
const GEOMETRY_TOLERANCE = 2

/** Visible (non-inert ancestor) controls matching a test id. */
function visibleByTestId(testId: string): Element[] {
  return [...document.querySelectorAll(`[data-testid="${testId}"]`)].filter(
    (el) => !el.closest('[inert]')
  )
}

function workDrawerSlot(): HTMLElement {
  return document.querySelector('[data-slot="work-drawer-slot"]') as HTMLElement
}

function parseDurationMs(value: string): number {
  // Browsers report multi-property durations as "0.2s" or "0.2s, 0.2s".
  const first = value.split(',')[0]?.trim() ?? '0s'
  if (first.endsWith('ms')) return Number.parseFloat(first)
  if (first.endsWith('s')) return Number.parseFloat(first) * 1000
  return Number.parseFloat(first)
}

function expectNoScaleTransform(el: Element) {
  const transform = getComputedStyle(el).transform
  expect(transform === 'none' || transform === '').toBe(true)
}

/** Work drawer right edge must stay glued to Stage right during width motion. */
function rightEdgeDeltaPx(slot: Element, stage: Element): number {
  return Math.abs(
    slot.getBoundingClientRect().right - stage.getBoundingClientRect().right
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/** Wait until shell pane source/action settle to instant after a width transition. */
async function expectPaneSettledInstant(
  shell: ReturnType<typeof page.getByTestId>
) {
  await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')
  await expect.element(shell).toHaveAttribute('data-pane-transition', 'instant')
}

/**
 * Pane action metadata is intentionally transient and resets on transitionend.
 * Observe the discrete React click synchronously so a loaded browser suite cannot
 * miss the 160–200ms animated window while userEvent is settling.
 */
function clickAndExpectPaneAction(
  trigger: ReturnType<typeof page.getByTestId>,
  shell: ReturnType<typeof page.getByTestId>,
  action: 'open' | 'close' | 'maximize' | 'restore'
) {
  const element = trigger.element()
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('pane action trigger must be an HTMLElement')
  }
  flushSync(() => element.click())
  expect(shell.element().getAttribute('data-pane-motion')).toBe('animated')
  expect(shell.element().getAttribute('data-pane-transition')).toBe(action)
}

async function renderWorkbench() {
  const result = await render(<WorkbenchApp persistence='memory' />)
  await expect.element(page.getByTestId('workbench-shell')).toBeInTheDocument()
  return result
}

/** Product path: open one Runtime task (empty hub). */
async function renderWorkbenchWithTask() {
  await renderWorkbench()
  // Workspace CTA works when Navigator is overlay/closed (medium/narrow).
  const emptyCta = document.querySelector(
    '[data-testid="workspace-empty-new-chat"]'
  )
  if (emptyCta) {
    await userEvent.click(page.getByTestId('workspace-empty-new-chat'))
  } else {
    await userEvent.click(page.getByTestId('navigator-new-chat'))
  }
  await expect.element(page.getByTestId('task-surface')).toBeInTheDocument()
}

describe('Workbench Shell integration (visible behavior)', () => {
  it('renders project, left-rail chrome, empty shell then Runtime hub', async () => {
    await renderWorkbench()

    await expect
      .element(page.getByTestId('workbench-shell'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('project-name'))
      .toHaveTextContent('默认项目')

    // A — left rail: real catalog only (no mock utilities)
    await expect
      .element(page.getByTestId('navigator-new-chat'))
      .toHaveTextContent('新对话')
    await expect
      .element(page.getByTestId('navigator-tasks'))
      .toBeInTheDocument()
    expect(
      document.querySelector('[data-testid="navigator-utilities"]')
    ).toBeNull()
    await expect
      .element(page.getByTestId('workspace-empty-shell'))
      .toBeInTheDocument()

    // B — new chat → Runtime empty hub
    await userEvent.click(page.getByTestId('navigator-new-chat'))
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('empty-hub-title'))
      .toHaveTextContent('默认项目')
    await expect
      .element(page.getByTestId('empty-hub-action-explore'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer'))
      .toHaveAttribute('data-composer-mode', 'runtime')

    // C — Work drawer closed by default
    expect(
      document.querySelector('[data-testid="work-surface-host"]')
    ).toBeNull()
    const slot = workDrawerSlot()
    expect(slot).toBeTruthy()
    expect(slot.getBoundingClientRect().width).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
  })

  it('opens one capability management surface from Navigator and Composer, then returns to Task', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()

    await userEvent.click(page.getByTestId('navigator-menu-skills-connectors'))
    await expect
      .element(page.getByTestId('capability-management-surface'))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole('heading', { name: '专家、技能与连接器' }))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('capability-management-back'))
    await expect.element(page.getByTestId('task-surface')).toBeInTheDocument()

    await userEvent.click(page.getByTestId('composer-add'))
    await userEvent.click(page.getByTestId('composer-add-connectors-nav'))
    await userEvent.click(page.getByTestId('capability-manage-connectors'))

    await expect
      .element(page.getByTestId('capability-management-surface'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('navigator-menu-skills-connectors'))
      .toHaveAttribute('aria-current', 'page')

    await userEvent.click(page.getByTestId('navigator-new-chat'))
    await expect.element(page.getByTestId('task-surface')).toBeInTheDocument()
  })

  it('Task-only: 44px Task toolbar, single title, no subtitle, icon controls', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()

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
    // Workspace: 8px top/right/bottom; left sits against Navigator.
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
    await expect
      .element(page.getByTestId('workspace-top-bar'))
      .toBeInTheDocument()
    expect(topBar.getAttribute('data-slot')).toBe('task-pane-toolbar')

    const titles = document.querySelectorAll(
      '[data-testid="workspace-top-bar"] h1'
    )
    expect(titles.length).toBe(1)
    // New conversation title (product path).
    expect(titles[0]?.textContent).toMatch(/新对话|还没有对话/)

    // Subtitle must not appear in Task toolbar chrome.
    expect(
      document.querySelectorAll('[data-testid="workspace-top-bar"] p').length
    ).toBe(0)
    expect(topBar.textContent).not.toMatch(/golden capture|开场区/)

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
    // Semantic icons: Context = SlidersHorizontal, Work = PanelBottom.
    expect(
      contextBtn.querySelector('svg.lucide-sliders-horizontal')
    ).toBeTruthy()
    expect(workBtn.querySelector('svg.lucide-panel-bottom')).toBeTruthy()
    // 32×32 hit area.
    const contextBox = contextBtn.getBoundingClientRect()
    const workBox = workBtn.getBoundingClientRect()
    expect(Math.abs(contextBox.width - 32)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    expect(Math.abs(contextBox.height - 32)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    expect(Math.abs(workBox.width - 32)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(Math.abs(workBox.height - 32)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
  })

  it('1440 collapsed by pointer: Navigator inert, left inset, animated motion', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()

    const shell = page.getByTestId('workbench-shell')
    await userEvent.click(page.getByTestId('toggle-navigator'))

    await expect.element(shell).toHaveAttribute('data-nav-open', 'false')
    await expect.element(shell).toHaveAttribute('data-nav-motion', 'animated')

    await expect
      .element(page.getByTestId('navigator'))
      .toHaveAttribute('data-open', 'false')
    const nav = page.getByTestId('navigator').element()
    expect(nav.getAttribute('aria-hidden')).toBe('true')
    expect(nav.hasAttribute('inert')).toBe(true)
    expect(page.getByTestId('navigator-filter').element().tabIndex).toBe(-1)
    const taskRow = document.querySelector(
      '[data-testid^="task-task-"]'
    ) as HTMLElement | null
    expect(taskRow).toBeTruthy()
    expect(taskRow!.tabIndex).toBe(-1)
    expect(page.getByTestId('navigator-user-trigger').element().tabIndex).toBe(
      -1
    )

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

  it('Navigator account menu opens upward with settings and sign-out fixtures', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()

    const trigger = page.getByTestId('navigator-user-trigger')
    await expect.element(trigger).toBeInTheDocument()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect
      .element(page.getByTestId('navigator-user-menu'))
      .toHaveTextContent('演示用户')
    await expect
      .element(page.getByTestId('navigator-user-menu'))
      .toHaveTextContent('demo@uilab.dev')

    // Closed: Base UI may keep portal with data-closed after first open; before open it's absent.
    const closedPanel = document.querySelector(
      '[data-testid="navigator-user-menu-panel"]'
    )
    expect(closedPanel == null || closedPanel.hasAttribute('data-closed')).toBe(
      true
    )

    await userEvent.click(trigger)
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = page.getByTestId('navigator-user-menu-panel')
    await expect.element(panel).toBeInTheDocument()
    await expect
      .poll(() =>
        panel.element().hasAttribute('data-closed') ? 'closed' : 'open'
      )
      .toBe('open')
    await expect
      .element(page.getByTestId('navigator-user-settings'))
      .toHaveTextContent('设置')
    await expect
      .element(page.getByTestId('navigator-user-sign-out'))
      .toHaveTextContent('退出登录')

    // Menu sits above the account chip.
    const triggerBox = trigger.element().getBoundingClientRect()
    const panelBox = panel.element().getBoundingClientRect()
    expect(panelBox.bottom).toBeLessThanOrEqual(
      triggerBox.top + GEOMETRY_TOLERANCE
    )

    // Settings opens the modal dialog (profile section by default).
    await userEvent.click(page.getByTestId('navigator-user-settings'))
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect
      .poll(() => {
        const el = document.querySelector(
          '[data-testid="navigator-user-menu-panel"]'
        )
        return el == null || el.hasAttribute('data-closed') ? 'closed' : 'open'
      })
      .toBe('closed')
    await expect
      .element(page.getByTestId('settings-dialog'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('settings-profile-name'))
      .toHaveTextContent('演示用户')

    // Appearance: dark preference applies document .dark class.
    await userEvent.click(page.getByTestId('settings-nav-appearance'))
    await expect
      .element(page.getByTestId('settings-theme-group'))
      .toBeInTheDocument()
    await userEvent.click(page.getByTestId('settings-theme-dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    await expect
      .element(page.getByTestId('settings-theme-dark'))
      .toHaveAttribute('data-selected', 'true')

    // Light preference clears dark class.
    await userEvent.click(page.getByTestId('settings-theme-light'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Escape closes the settings dialog (Base UI may keep closed popup in DOM).
    await userEvent.keyboard('{Escape}')
    await expect
      .poll(() => {
        const el = document.querySelector('[data-testid="settings-dialog"]')
        return el == null || el.hasAttribute('data-closed') ? 'closed' : 'open'
      })
      .toBe('closed')

    // Sign-out is fixture-only honesty.
    await userEvent.click(trigger)
    await userEvent.click(page.getByTestId('navigator-user-sign-out'))
    await expect
      .element(page.getByTestId('navigator-user-notice'))
      .toHaveTextContent('退出登录（静态 fixture）')
  })

  it('keyboard Ctrl+B toggles navigator with instant motion', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()
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
    await renderWorkbenchWithTask()
    const shell = page.getByTestId('workbench-shell')
    const panel = page.getByTestId('context-panel')
    await expect.element(panel).toHaveAttribute('data-open', 'false')

    await userEvent.click(page.getByTestId('toggle-context'))
    await expect.element(panel).toHaveAttribute('data-open', 'true')
    await expect
      .element(shell)
      .toHaveAttribute('data-context-motion', 'animated')
    // Runtime path: no honesty chips in product chrome.
    await expect.element(panel).toHaveTextContent('任务上下文')
    expect(panel.element().textContent ?? '').not.toMatch(
      /Fake Runtime|非生产|Deterministic Fake/
    )

    await userEvent.click(page.getByTestId('toggle-context'))
    await expect.element(panel).toHaveAttribute('data-open', 'false')
    // Close is immediate.
    await expect
      .element(shell)
      .toHaveAttribute('data-context-motion', 'instant')

    await shell.element().focus()
    await userEvent.keyboard('{Control>}i{/Control}')
    await expect.element(panel).toHaveAttribute('data-open', 'true')
    await expect
      .element(shell)
      .toHaveAttribute('data-context-motion', 'instant')
  })

  it('pointer Work open/close/maximize uses drawer actions and timings', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()
    const shell = page.getByTestId('workbench-shell')
    const stage = page.getByTestId('workbench-stage').element()
    const slot = workDrawerSlot()

    // No View Transition names on panes.
    const taskPane = document.querySelector(
      '[data-slot="task-pane"]'
    ) as HTMLElement
    expect(getComputedStyle(taskPane).viewTransitionName).toBe('none')
    const hostSlot = document.querySelector(
      '[data-slot="work-surface-host"]'
    ) as HTMLElement
    expect(getComputedStyle(hostSlot).viewTransitionName).toBe('none')

    clickAndExpectPaneAction(
      page.getByTestId('toggle-work-surface-chrome'),
      shell,
      'open'
    )
    const host = page.getByTestId('work-surface-host')
    await expect.element(host).toBeInTheDocument()
    // Phase 3B: source stays animated|instant; action is separate.
    await expect.element(host).toHaveAttribute('data-maximized', 'false')
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('工作区暂无打开的标签')

    // Open: 200ms + drawer easing; only width transitions; no scale.
    const openStyle = getComputedStyle(slot)
    expect(parseDurationMs(openStyle.transitionDuration)).toBe(200)
    expect(
      openStyle.transitionProperty.split(',').map((p) => p.trim())
    ).toContain('width')
    expect(openStyle.transitionTimingFunction).toBe(
      'cubic-bezier(0.32, 0.72, 0, 1)'
    )
    expectNoScaleTransform(host.element())
    expectNoScaleTransform(slot)

    // Mid-animation samples: Work right edge stays fixed to Stage right.
    await nextFrame()
    expect(rightEdgeDeltaPx(slot, stage)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    await sleep(40)
    expect(rightEdgeDeltaPx(slot, stage)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    expectNoScaleTransform(host.element())

    // Settled geometry: right-anchored; source/action reset to instant.
    await expect
      .poll(() => {
        const workBox = host.element().getBoundingClientRect()
        const stageBox = stage.getBoundingClientRect()
        return (
          workBox.width > 300 &&
          Math.abs(workBox.right - stageBox.right) <= GEOMETRY_TOLERANCE
        )
      })
      .toBe(true)
    await expectPaneSettledInstant(shell)

    clickAndExpectPaneAction(
      page.getByTestId('toggle-work-surface-chrome'),
      shell,
      'close'
    )
    const closeStyle = getComputedStyle(slot)
    expect(parseDurationMs(closeStyle.transitionDuration)).toBe(160)
    expect(closeStyle.transitionTimingFunction).toBe(
      'cubic-bezier(0.23, 1, 0.32, 1)'
    )
    await expect
      .poll(
        () =>
          document.querySelector('[data-testid="work-surface-host"]') === null
      )
      .toBe(true)
    // Hidden host stays mounted (slot host) but inert / no compat test id.
    const hiddenHost = document.querySelector(
      '[data-slot="work-surface-host"]'
    ) as HTMLElement
    expect(hiddenHost).toBeTruthy()
    expect(hiddenHost.hasAttribute('inert')).toBe(true)
    expect(hiddenHost.getAttribute('aria-hidden')).toBe('true')
    await expectPaneSettledInstant(shell)

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expectPaneSettledInstant(shell)

    // openTabs is task-scoped (no global seed tabs); empty pane still hosts chrome.
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('工作区暂无打开的标签')

    clickAndExpectPaneAction(
      page.getByTestId('work-surface-maximize'),
      shell,
      'maximize'
    )
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'true')
    const maxStyle = getComputedStyle(slot)
    expect(parseDurationMs(maxStyle.transitionDuration)).toBe(180)
    expect(maxStyle.transitionTimingFunction).toBe(
      'cubic-bezier(0.77, 0, 0.175, 1)'
    )
    expectNoScaleTransform(page.getByTestId('work-surface-host').element())

    // Maximize mid samples: right edge fixed.
    await nextFrame()
    expect(rightEdgeDeltaPx(slot, stage)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    await sleep(40)
    expect(rightEdgeDeltaPx(slot, stage)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )

    await expect
      .poll(() => {
        const hostEl = page.getByTestId('work-surface-host').element()
        const stageBox = stage.getBoundingClientRect()
        const hostBox = hostEl.getBoundingClientRect()
        return (
          Math.abs(hostBox.width - stageBox.width) <= GEOMETRY_TOLERANCE &&
          Math.abs(hostBox.right - stageBox.right) <= GEOMETRY_TOLERANCE
        )
      })
      .toBe(true)
    await expectPaneSettledInstant(shell)

    clickAndExpectPaneAction(
      page.getByTestId('work-surface-maximize'),
      shell,
      'restore'
    )
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'false')
    const restoreStyle = getComputedStyle(slot)
    expect(parseDurationMs(restoreStyle.transitionDuration)).toBe(180)
    expect(restoreStyle.transitionTimingFunction).toBe(
      'cubic-bezier(0.77, 0, 0.175, 1)'
    )

    // Restore mid samples: right edge fixed.
    await nextFrame()
    expect(rightEdgeDeltaPx(slot, stage)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )
    await sleep(40)
    expect(rightEdgeDeltaPx(slot, stage)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )

    await expect
      .poll(() => {
        const hostBox = page
          .getByTestId('work-surface-host')
          .element()
          .getBoundingClientRect()
        const stageBox = stage.getBoundingClientRect()
        return (
          hostBox.width > 300 &&
          hostBox.width < stageBox.width - 100 &&
          Math.abs(hostBox.right - stageBox.right) <= GEOMETRY_TOLERANCE
        )
      })
      .toBe(true)
    await expectPaneSettledInstant(shell)

    clickAndExpectPaneAction(
      page.getByTestId('work-surface-close'),
      shell,
      'close'
    )
    await expect
      .poll(
        () =>
          document.querySelector('[data-testid="work-surface-host"]') === null
      )
      .toBe(true)
    await expectPaneSettledInstant(shell)
  })

  it('rapid Work toggles retarget drawer width and settle to last command', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()
    const shell = page.getByTestId('workbench-shell')
    const toggle = page.getByTestId('toggle-work-surface-chrome')

    await userEvent.click(toggle)
    await userEvent.click(toggle)
    await userEvent.click(toggle)

    await expect.element(shell).toHaveAttribute('data-pane-motion', 'animated')
    await expect.element(shell).toHaveAttribute('data-pane-transition', 'open')
    await expect
      .poll(() => {
        const host = document.querySelector('[data-testid="work-surface-host"]')
        if (!host) return false
        const slot = workDrawerSlot()
        return slot.getBoundingClientRect().width > 100
      })
      .toBe(true)
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    expect(
      page
        .getByTestId('toggle-work-surface-chrome')
        .element()
        .getAttribute('aria-pressed')
    ).toBe('true')
    await expectPaneSettledInstant(shell)
  })

  it('split: Task and Work toolbars are 44px and pane-aligned without overlap', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()

    // Wait for open drawer (200ms) to settle before geometry asserts.
    await expect
      .poll(() => {
        const slot = workDrawerSlot()
        const stage = page.getByTestId('workbench-stage').element()
        const host = document.querySelector(
          '[data-testid="work-surface-host"]'
        ) as HTMLElement | null
        if (!slot || !host) return false
        const slotBox = slot.getBoundingClientRect()
        const stageBox = stage.getBoundingClientRect()
        const hostBox = host.getBoundingClientRect()
        return (
          slotBox.width > 300 &&
          Math.abs(hostBox.right - stageBox.right) <= GEOMETRY_TOLERANCE &&
          Math.abs(slotBox.right - stageBox.right) <= GEOMETRY_TOLERANCE
        )
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
    const stageBox = page
      .getByTestId('workbench-stage')
      .element()
      .getBoundingClientRect()

    expect(
      Math.abs(taskToolbarBox.height - TOOLBAR_HEIGHT)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(
      Math.abs(workToolbarBox.height - TOOLBAR_HEIGHT)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)

    // Task toolbar bounds match Task pane horizontal extent.
    expect(
      Math.abs(taskToolbarBox.left - taskPaneBox.left)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(
      Math.abs(taskToolbarBox.right - taskPaneBox.right)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)

    // Work toolbar bounds match Work pane horizontal extent.
    expect(
      Math.abs(workToolbarBox.left - workHostBox.left)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(
      Math.abs(workToolbarBox.right - workHostBox.right)
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)

    // Work right edge fixed to Stage right (drawer anchor).
    expect(Math.abs(workHostBox.right - stageBox.right)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE
    )

    // Headers do not overlap.
    const headersOverlap =
      taskToolbarBox.left < workToolbarBox.right &&
      taskToolbarBox.right > workToolbarBox.left &&
      taskToolbarBox.top < workToolbarBox.bottom &&
      taskToolbarBox.bottom > workToolbarBox.top
    expect(headersOverlap).toBe(false)

    // Split + nav open: toggle lives on the left rail toolbar (WorkBuddy-style), not Task chrome.
    const navToggles = visibleByTestId('toggle-navigator')
    expect(navToggles.length).toBe(1)
    const navToolbar = document.querySelector(
      '[data-testid="navigator-toolbar"]'
    ) as HTMLElement
    expect(navToolbar).toBeTruthy()
    expect(navToolbar.contains(navToggles[0]!)).toBe(true)
    expect(taskToolbar.contains(navToggles[0]!)).toBe(false)
    expect(
      workToolbar.querySelector('[data-testid="toggle-navigator"]')
    ).toBeNull()
  })

  it('wide maximized Work: unique toggle-navigator lives in Work toolbar and is clickable', async () => {
    await page.viewport(1440, 900)
    await renderWorkbenchWithTask()
    const shell = page.getByTestId('workbench-shell')

    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('work-surface-maximize'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'true')

    // Task pane stays mounted but is inert when Work is full-stage.
    const taskPane = document.querySelector(
      '[data-slot="task-pane"]'
    ) as HTMLElement
    expect(taskPane).toBeTruthy()
    expect(taskPane.hasAttribute('inert')).toBe(true)
    expect(taskPane.getAttribute('aria-hidden')).toBe('true')

    // Nav open → toggle on left rail only (not Work toolbar duplicate).
    let navToggles = visibleByTestId('toggle-navigator')
    expect(navToggles.length).toBe(1)
    const navToolbar = document.querySelector(
      '[data-testid="navigator-toolbar"]'
    ) as HTMLElement
    expect(navToolbar.contains(navToggles[0]!)).toBe(true)

    // Full-stage Work has no internal left divider (Workspace outer frame unchanged).
    const workHost = page.getByTestId('work-surface-host').element()
    expect(getComputedStyle(workHost).borderLeftWidth).toBe('0px')
    expectNoScaleTransform(workHost)

    await expect.element(shell).toHaveAttribute('data-nav-open', 'true')
    await userEvent.click(page.getByTestId('toggle-navigator'))
    await expect.element(shell).toHaveAttribute('data-nav-open', 'false')
    await expect.element(shell).toHaveAttribute('data-nav-motion', 'animated')

    // After collapse, re-open control moves to Work toolbar (rail is gone).
    navToggles = visibleByTestId('toggle-navigator')
    expect(navToggles.length).toBe(1)
    const workToolbar = document.querySelector(
      '[data-slot="work-surface-toolbar"]'
    ) as HTMLElement
    expect(workToolbar.contains(navToggles[0]!)).toBe(true)
  })

  it('760 serial Work: unique toggle-navigator lives in Work toolbar and is clickable', async () => {
    try {
      await page.viewport(760, 800)
      await renderWorkbenchWithTask()
      const shell = page.getByTestId('workbench-shell')
      await expect.element(shell).toHaveAttribute('data-viewport', 'narrow')

      await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
      await expect
        .element(page.getByTestId('work-surface-host'))
        .toBeInTheDocument()
      // Task stays mounted but inert/full-stage; not operable.
      const taskSurface = document.querySelector(
        '[data-testid="task-surface"]'
      ) as HTMLElement
      expect(taskSurface).toBeTruthy()
      expect(taskSurface.closest('[inert]')).toBeTruthy()

      const navToggles = visibleByTestId('toggle-navigator')
      expect(navToggles.length).toBe(1)

      const workToolbar = document.querySelector(
        '[data-slot="work-surface-toolbar"]'
      ) as HTMLElement
      expect(workToolbar).toBeTruthy()
      expect(workToolbar.contains(navToggles[0]!)).toBe(true)

      // Narrow starts with Navigator auto-closed; open via Work toolbar control.
      // Scope to Work host so we never hit the inert Task-toolbar clone.
      await expect.element(shell).toHaveAttribute('data-nav-open', 'false')
      const workNavToggle = page
        .getByTestId('work-surface-host')
        .getByTestId('toggle-navigator')
      await expect.element(workNavToggle).toBeInTheDocument()
      // Pointer open uses animated motion; fall back to keyboard if needed.
      await userEvent.click(workNavToggle)
      try {
        await expect
          .poll(() => shell.element().getAttribute('data-nav-open'), {
            timeout: 2000,
          })
          .toBe('true')
      } catch {
        await userEvent.keyboard('{Control>}b{/Control}')
        await expect.element(shell).toHaveAttribute('data-nav-open', 'true')
      }
    } finally {
      await page.viewport(1440, 900)
    }
  })

  it('restores per-Task layout when switching A → B → A', async () => {
    await renderWorkbenchWithTask()
    const taskAId = page.getByTestId('task-surface').element().dataset.taskId!
    // Leave blank-draft state so the next 新对话 creates a distinct task.
    await userEvent.fill(page.getByTestId('composer-input'), 'seed task A')
    await userEvent.click(page.getByTestId('composer-submit'))
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()

    await userEvent.click(page.getByTestId('navigator-new-chat'))
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    const taskBId = page.getByTestId('task-surface').element().dataset.taskId!
    expect(taskBId).not.toBe(taskAId)

    // Select A and configure layout (pane chrome; openTabs covered by session unit tests)
    await userEvent.click(page.getByTestId(`task-${taskAId}`))
    await userEvent.click(page.getByTestId('toggle-work-surface-chrome'))
    await userEvent.click(page.getByTestId('toggle-context'))

    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'true')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('工作区暂无打开的标签')

    // Task B defaults: Task-only
    await userEvent.click(page.getByTestId(`task-${taskBId}`))
    expect(
      document.querySelector('[data-testid="work-surface-host"]')
    ).toBeNull()
    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'false')
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-task-id', taskBId)

    // Back to A restores pane + context visibility
    await userEvent.click(page.getByTestId(`task-${taskAId}`))
    await expect
      .element(page.getByTestId('task-surface'))
      .toHaveAttribute('data-task-id', taskAId)
    await expect
      .element(page.getByTestId('context-panel'))
      .toHaveAttribute('data-open', 'true')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()

    // Task switch marks context/pane motion instant (no restored entry animation).
    const shell = page.getByTestId('workbench-shell')
    await expect
      .element(shell)
      .toHaveAttribute('data-context-motion', 'instant')
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')
  })

  it('keyboard Work/Context are instant; Escape exits maximize instantly', async () => {
    await renderWorkbenchWithTask()
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
    await expect
      .element(shell)
      .toHaveAttribute('data-context-motion', 'instant')

    // Ctrl/Cmd+Shift+W toggles work surface — instant
    await userEvent.keyboard('{Control>}{Shift>}w{/Shift}{/Control}')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')
    await expect
      .element(shell)
      .toHaveAttribute('data-pane-transition', 'instant')
    const slot = workDrawerSlot()
    expect(parseDurationMs(getComputedStyle(slot).transitionDuration)).toBe(0)

    // Maximize via pointer (animated + maximize), Escape restores instantly
    await userEvent.click(page.getByTestId('work-surface-maximize'))
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'true')
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'animated')
    await expect
      .element(shell)
      .toHaveAttribute('data-pane-transition', 'maximize')

    await userEvent.keyboard('{Escape}')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toHaveAttribute('data-maximized', 'false')
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')
    await expect
      .element(shell)
      .toHaveAttribute('data-pane-transition', 'instant')
  })

  it('Composer uses Runtime path and stays within Task Surface', async () => {
    await renderWorkbenchWithTask()
    const input = page.getByTestId('composer-input')
    const submit = page.getByTestId('composer-submit')

    await expect
      .element(page.getByTestId('composer'))
      .toHaveAttribute('data-composer-mode', 'runtime')
    // New-task empty hub: two-layer rail + project chip for workspace selection.
    await expect
      .element(page.getByTestId('composer-context-bar'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('默认项目')
    await expect
      .element(page.getByTestId('composer-model'))
      .toHaveTextContent('Fake Runtime')

    await userEvent.fill(input, 'hello composer')
    await userEvent.click(submit)
    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    // Conversation: rail stays for depth hierarchy; project chip hides.
    await expect
      .element(page.getByTestId('composer-context-bar'))
      .toBeInTheDocument()
    expect(
      page.getByTestId('composer-context-bar').element().childElementCount
    ).toBe(0)
    expect(
      document.querySelector('[data-testid="composer-chip-project"]')
    ).toBeNull()
    // Notice is sr-only (no visible honesty chrome under Composer)
    expect(
      page
        .getByTestId('composer-notice')
        .element()
        .classList.contains('sr-only')
    ).toBe(true)

    const composers = document.querySelectorAll('[data-testid="composer"]')
    expect(composers.length).toBe(1)
    const task = page.getByTestId('task-surface').element()
    expect(task.contains(composers[0]!)).toBe(true)
  })

  it('medium 1024×768: overlay nav free when closed; Task/Work containment; Context overlay', async () => {
    await page.viewport(1024, 768)
    try {
      await renderWorkbenchWithTask()

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
      // Task content may be empty-hub or stream; both share task-surface bounds.
      const contentBox = page
        .getByTestId('task-surface')
        .element()
        .getBoundingClientRect()

      const overlaps =
        panelBox.left < contentBox.right &&
        panelBox.right > contentBox.left &&
        panelBox.top < contentBox.bottom &&
        panelBox.bottom > contentBox.top
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
      await renderWorkbenchWithTask()

      await expect
        .element(page.getByTestId('workbench-shell'))
        .toHaveAttribute('data-viewport', 'narrow')
      await expect.element(page.getByTestId('task-surface')).toBeInTheDocument()
      expect(
        document.querySelector('[data-testid="work-surface-host"]')
      ).toBeNull()

      // Full-bleed: no outer margin on Workspace.
      const wsBox = page
        .getByTestId('workbench-workspace')
        .element()
        .getBoundingClientRect()
      expect(Math.abs(wsBox.left)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
      expect(Math.abs(wsBox.top)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
      expect(Math.abs(wsBox.width - 760)).toBeLessThanOrEqual(
        GEOMETRY_TOLERANCE
      )

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
          const contentBox = page
            .getByTestId('task-surface')
            .element()
            .getBoundingClientRect()
          return (
            panelBox.left < contentBox.right &&
            panelBox.right > contentBox.left &&
            panelBox.top < contentBox.bottom &&
            panelBox.bottom > contentBox.top
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
      // Task remains mounted under inert when Work is serial full-stage.
      expect(
        document
          .querySelector('[data-testid="task-surface"]')
          ?.closest('[inert]')
      ).toBeTruthy()

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
