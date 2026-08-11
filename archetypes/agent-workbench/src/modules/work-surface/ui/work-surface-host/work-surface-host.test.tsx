import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createSurfaceRegistry } from '../../application/surface-registry'
import { createTestSurfaceDefinition } from '../../surfaces/test/test-surface'
import {
  WorkSurfaceHost,
  type WorkSurfaceHostCallbacks,
  type WorkSurfaceHostView,
} from './work-surface-host'

function renderHost(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

function baseCallbacks(
  overrides: Partial<WorkSurfaceHostCallbacks> = {},
): WorkSurfaceHostCallbacks {
  return {
    onClose: vi.fn(),
    onCloseTab: vi.fn(),
    onActivateTab: vi.fn(),
    onResize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onExitMaximize: vi.fn(),
    ...overrides,
  }
}

function baseView(overrides: Partial<WorkSurfaceHostView> = {}): WorkSurfaceHostView {
  return {
    visible: true,
    maximized: false,
    width: 480,
    minWidth: 320,
    maxWidth: 960,
    tabs: [],
    activeTabId: null,
    ...overrides,
  }
}

describe('WorkSurfaceHost + Registry', () => {
  it('renders test surface body for registered kind', async () => {
    const registry = createSurfaceRegistry()
    registry.register(createTestSurfaceDefinition())
    const tabId = 'tab-test-fixture-1'

    await renderHost(
      <WorkSurfaceHost
        view={baseView({
          tabs: [
            {
              tabId,
              kind: 'test',
              resourceKey: 'test:fixture-1',
              title: 'Fixture One',
            },
          ],
          activeTabId: tabId,
        })}
        callbacks={baseCallbacks()}
        registry={registry}
        taskId='task-a'
      />,
    )

    await expect
      .element(page.getByTestId('work-surface-test-body'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-test-body'))
      .toHaveTextContent('Fixture One')
    await expect
      .element(page.getByTestId('work-surface-test-body'))
      .toHaveAttribute('data-resource-key', 'test:fixture-1')
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('taskId=task-a')
  })

  it('shows Chinese unknown fallback and closes tab without crashing', async () => {
    const registry = createSurfaceRegistry()
    registry.register(createTestSurfaceDefinition())
    const onCloseTab = vi.fn()
    const unknownId = 'tab-ghost-missing'

    await renderHost(
      <WorkSurfaceHost
        view={baseView({
          tabs: [
            {
              tabId: unknownId,
              kind: 'ghost',
              resourceKey: 'missing.md',
              title: '失踪文件',
            },
          ],
          activeTabId: unknownId,
        })}
        callbacks={baseCallbacks({ onCloseTab })}
        registry={registry}
        taskId='task-a'
      />,
    )

    await expect
      .element(page.getByTestId('work-surface-unknown'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('work-surface-unknown'))
      .toHaveTextContent('未注册的类型')
    await expect
      .element(page.getByTestId('work-surface-unknown'))
      .toHaveTextContent('ghost')
    await expect
      .element(page.getByTestId('work-surface-host'))
      .toBeInTheDocument()

    await userEvent.click(page.getByTestId('work-surface-unknown-close'))
    expect(onCloseTab).toHaveBeenCalledWith(unknownId)
  })

  it('activates another tab and closes via tab chrome', async () => {
    const registry = createSurfaceRegistry()
    registry.register(createTestSurfaceDefinition())
    const onActivateTab = vi.fn()
    const onCloseTab = vi.fn()
    const aId = 'tab-test-a'
    const bId = 'tab-test-b'

    await renderHost(
      <WorkSurfaceHost
        view={baseView({
          tabs: [
            {
              tabId: aId,
              kind: 'test',
              resourceKey: 'test:a',
              title: 'A',
            },
            {
              tabId: bId,
              kind: 'test',
              resourceKey: 'test:b',
              title: 'B',
            },
          ],
          activeTabId: aId,
        })}
        callbacks={baseCallbacks({ onActivateTab, onCloseTab })}
        registry={registry}
        taskId='task-a'
      />,
    )

    await expect
      .element(page.getByTestId('work-surface-test-body'))
      .toHaveAttribute('data-resource-key', 'test:a')

    await userEvent.click(page.getByTestId(`work-tab-${bId}`))
    expect(onActivateTab).toHaveBeenCalledWith(bId)

    await userEvent.click(page.getByTestId(`work-tab-close-${aId}`))
    expect(onCloseTab).toHaveBeenCalledWith(aId)
  })

  it('empty tabs show empty notice (not a Document import)', async () => {
    const registry = createSurfaceRegistry()
    await renderHost(
      <WorkSurfaceHost
        view={baseView()}
        callbacks={baseCallbacks()}
        registry={registry}
        taskId={null}
      />,
    )
    await expect
      .element(page.getByTestId('work-surface-panel'))
      .toHaveTextContent('工作区暂无打开的标签')
    expect(
      document.querySelector('[data-testid="work-surface-test-body"]'),
    ).toBeNull()
  })
})
