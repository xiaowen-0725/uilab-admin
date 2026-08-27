import { useWorkbenchSession } from '@/modules/workbench-session'
import { createSurfaceRegistry } from '@/modules/work-surface'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

function parseDurationMs(value: string): number {
  const first = value.split(',')[0]?.trim() ?? '0s'
  if (first.endsWith('ms')) return Number.parseFloat(first)
  if (first.endsWith('s')) return Number.parseFloat(first) * 1000
  return Number.parseFloat(first)
}

function AutoOpenMotionHarness() {
  const session = useWorkbenchSession({
    selectedProjectId: null,
    selectedTaskId: 'task-1',
  })
  const [token, setToken] = useState(0)
  const [registry] = useState(() => createSurfaceRegistry())

  return (
    <ThemeProvider>
      <WorkbenchShell
        view={session.view}
        commands={session.commands}
        taskView={null}
        looseTasks={[]}
        projectGroups={[]}
        surfaceRegistry={registry}
        workSurfaceOpenMotionToken={token}
      />
      <button
        type='button'
        data-testid='simulate-auto-open'
        onClick={() => {
          session.commands.openWorkSurface()
          setToken((value) => value + 1)
        }}
      >
        自动开栏
      </button>
      <button
        type='button'
        data-testid='simulate-instant-open'
        onClick={() => {
          session.commands.openWorkSurface()
        }}
      >
        即时开栏
      </button>
    </ThemeProvider>
  )
}

describe('Workbench Shell auto-open pane motion', () => {
  it('uses the pointer open transition when the motion token arrives with width', async () => {
    await page.viewport(1440, 900)
    await render(<AutoOpenMotionHarness />)
    const shell = page.getByTestId('workbench-shell')
    await expect.element(shell).toBeInTheDocument()
    await expect.element(shell).toHaveAttribute('data-pane-motion', 'instant')

    const trigger = page.getByTestId('simulate-auto-open').element()
    if (!(trigger instanceof HTMLElement)) {
      throw new TypeError('auto-open trigger must be an HTMLElement')
    }
    flushSync(() => trigger.click())

    expect(shell.element().getAttribute('data-pane-motion')).toBe('animated')
    expect(shell.element().getAttribute('data-pane-transition')).toBe('open')
    const slot = document.querySelector(
      '[data-slot="work-drawer-slot"]',
    ) as HTMLElement
    expect(parseDurationMs(getComputedStyle(slot).transitionDuration)).toBe(200)
    expect(getComputedStyle(slot).transitionTimingFunction).toBe(
      'cubic-bezier(0.32, 0.72, 0, 1)',
    )
  })

  it('keeps keyboard-style instant open when no motion token is sent', async () => {
    await page.viewport(1440, 900)
    await render(<AutoOpenMotionHarness />)
    const shell = page.getByTestId('workbench-shell')
    const trigger = page.getByTestId('simulate-instant-open').element()
    if (!(trigger instanceof HTMLElement)) {
      throw new TypeError('instant-open trigger must be an HTMLElement')
    }
    flushSync(() => trigger.click())

    expect(shell.element().getAttribute('data-pane-motion')).toBe('instant')
    expect(shell.element().getAttribute('data-pane-transition')).toBe('instant')
    const slot = document.querySelector(
      '[data-slot="work-drawer-slot"]',
    ) as HTMLElement
    expect(parseDurationMs(getComputedStyle(slot).transitionDuration)).toBe(0)
  })
})
