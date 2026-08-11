/**
 * Capability Surface visual regression matrix (#56).
 *
 * Renders each of the 7 fixed-state snapshots through the real UI components
 * (CapabilityAddMenu + CapabilityManagementSurface) using Vitest browser mode,
 * then asserts the key DOM markers for that state (anti-regression).
 *
 * Screenshots are captured automatically by Vitest browser mode into
 * __screenshots__/ (transient) and can be promoted to the tracked baselines/
 * directory via the promote script when a UI change is intentional.
 *
 * No live sidecar is needed — the snapshots are deterministic data literals.
 * Fixtures use a consistent 1440×900 viewport, real brand assets, and
 * contain no secrets (verified by fixed-state-snapshots.ts).
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import {
  CapabilityAddMenu,
  CapabilityManagementSurface,
} from '@/modules/capabilities'
import { FIXED_STATE_SNAPSHOTS, type FixedStateKey } from './fixed-state-snapshots'
import { controllerFor } from './test-helpers'

// ---------------------------------------------------------------------------
// States 1–6: Composer「+」CapabilityAddMenu (open)
// ---------------------------------------------------------------------------

const ADD_MENU_STATES: FixedStateKey[] = [
  'new-task-default',
  'disconnected',
  'connected-not-enabled',
  'connected-enabled',
  'auth-in-progress',
  'auth-failed-recovery',
]

describe('CapabilityAddMenu visual matrix', () => {
  it.each(ADD_MENU_STATES)(
    'state "%s" renders correct DOM markers',
    async (state) => {
      const snapshot = FIXED_STATE_SNAPSHOTS[state]

      render(
        <CapabilityAddMenu
          open
          onOpenChange={vi.fn()}
          trigger={<button type='button'>添加</button>}
          snapshot={snapshot}
          onPickFiles={vi.fn()}
          onEnableGoal={vi.fn()}
          onEnablePlan={vi.fn()}
          onToggleConnector={vi.fn()}
          onToggleSkill={vi.fn()}
          onSelectExpert={vi.fn()}
          onStartAuth={vi.fn()}
          onRefreshAuth={vi.fn()}
          onManageConnectors={vi.fn()}
        />
      )

      // Universal: the panel rendered.
      await expect
        .element(page.getByTestId('composer-add-panel'))
        .toBeInTheDocument()

      // Open the connectors submenu to reveal per-connector items.
      await page.getByTestId('composer-add-connectors-nav').click()
      await expect
        .element(page.getByTestId('capability-connectors-submenu'))
        .toBeInTheDocument()

      // Per-state DOM assertions (anti-regression).
      const feishu = snapshot.connectors.find((c) => c.id === 'connector.feishu')!
      const github = snapshot.connectors.find((c) => c.id === 'connector.github')!

      if (feishu.connected && feishu.taskSelected) {
        // State: connected-enabled — checkbox checked.
        await expect
          .element(page.getByTestId('capability-connector-connector.feishu'))
          .toHaveAttribute('aria-checked', 'true')
      } else if (feishu.connected && !feishu.taskSelected) {
        // State: connected-not-enabled / new-task-default — checkbox unchecked.
        await expect
          .element(page.getByTestId('capability-connector-connector.feishu'))
          .toHaveAttribute('aria-checked', 'false')
      } else if (
        feishu.connectionState === 'expired' ||
        feishu.connectionState === 'error'
      ) {
        // State: auth-failed-recovery — recovery hint visible.
        await expect
          .element(page.getByTestId('capability-connectors-submenu'))
          .toHaveTextContent(/过期|异常|重新连接/)
      }

      if (!github.connected && github.connectionState === 'missing') {
        // Disconnected connectors show a「连接」action, not a checkbox.
        const ghItem = page.getByTestId('capability-connector-connector.github')
        await expect.element(ghItem).toBeInTheDocument()
        await expect.element(ghItem).toHaveAttribute('role', 'menuitem')
      }
    }
  )
})

// ---------------------------------------------------------------------------
// State 7: CapabilityManagementSurface (global catalog)
// ---------------------------------------------------------------------------

describe('CapabilityManagementSurface visual matrix', () => {
  it('state "management-surface" renders global catalog', async () => {
    const snapshot = FIXED_STATE_SNAPSHOTS['management-surface']
    const controller = controllerFor(snapshot)
    await controller.refresh(null)

    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId={null}
        onBack={vi.fn()}
      />
    )

    await expect
      .element(page.getByTestId('capability-management-surface'))
      .toBeInTheDocument()

    // Feishu connector card visible with connected status.
    await expect
      .element(
        page.getByTestId('capability-management-connector-connector.feishu')
      )
      .toBeInTheDocument()
  })
})
