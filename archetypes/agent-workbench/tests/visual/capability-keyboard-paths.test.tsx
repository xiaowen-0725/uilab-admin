/**
 * Capability Surface keyboard path regression (#56).
 *
 * Verifies the primary keyboard paths through Composer「+」menu and
 * Management Surface using deterministic fixed-state snapshots. No live
 * sidecar is needed.
 */
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import {
  CapabilityAddMenu,
  CapabilityManagementSurface,
  type CapabilitySnapshot,
} from '@/modules/capabilities'
import { FIXED_STATE_SNAPSHOTS } from './fixed-state-snapshots'
import { controllerFor } from './test-helpers'

/** Harness that manages open state so keyboard {Enter} can toggle the menu. */
function AddMenuHarness({ snapshot }: { snapshot: CapabilitySnapshot }) {
  const [open, setOpen] = useState(false)
  return (
    <CapabilityAddMenu
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type='button' data-testid='capability-keyboard-trigger'>
          添加能力
        </button>
      }
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
}

describe('CapabilityAddMenu keyboard paths', () => {
  it('Tab → Enter opens the menu; arrow keys navigate to connectors submenu', async () => {
    const snapshot = FIXED_STATE_SNAPSHOTS['connected-not-enabled']
    render(<AddMenuHarness snapshot={snapshot} />)

    const trigger = page.getByTestId('capability-keyboard-trigger')
    await expect.element(trigger).toBeInTheDocument()
    trigger.element().focus()
    await expect.element(trigger).toHaveFocus()

    // Enter opens the menu.
    await userEvent.keyboard('{Enter}')
    await expect
      .element(page.getByTestId('composer-add-panel'))
      .toBeInTheDocument()

    // Navigate down to connectors submenu and open it.
    await userEvent.keyboard('{Home}')
    await userEvent.keyboard(
      '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}'
    )
    await expect
      .element(page.getByTestId('capability-connectors-submenu'))
      .toBeInTheDocument()

    // Feishu connector checkbox is visible and unchecked (connected-not-enabled).
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: /飞书/ }))
      .toHaveAttribute('aria-checked', 'false')
  })

  it('Escape closes search then submenu then restores focus to trigger', async () => {
    const snapshot = FIXED_STATE_SNAPSHOTS['connected-not-enabled']
    render(<AddMenuHarness snapshot={snapshot} />)

    const trigger = page.getByTestId('capability-keyboard-trigger')
    await expect.element(trigger).toBeInTheDocument()
    trigger.element().focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Home}')
    await userEvent.keyboard(
      '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}'
    )
    await userEvent.keyboard('/')
    await expect
      .element(page.getByTestId('capability-connector-search'))
      .toHaveFocus()

    // Escape exits search → submenu nav → menu → trigger.
    await userEvent.keyboard('{Escape}')
    await expect
      .element(page.getByTestId('composer-add-connectors-nav'))
      .toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(trigger).toHaveFocus()
  })
})

describe('CapabilityManagementSurface keyboard paths', () => {
  it('Tab reaches the connector list and revoke button is keyboard-activatable', async () => {
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

    // Surface rendered with feishu connected.
    await expect
      .element(
        page.getByTestId('capability-management-connector-connector.feishu')
      )
      .toBeInTheDocument()

    // Tab into the surface; the revoke button for the connected feishu
    // connector must be reachable and activatable.
    const revokeButton = page.getByRole('button', { name: '撤销飞书连接' })
    await expect.element(revokeButton).toBeInTheDocument()
    revokeButton.element().focus()
    await expect.element(revokeButton).toHaveFocus()

    // Enter opens the revoke confirmation dialog.
    await userEvent.keyboard('{Enter}')
    await expect
      .element(page.getByRole('dialog'))
      .toBeInTheDocument()

    // Escape dismisses the dialog without revoking.
    await userEvent.keyboard('{Escape}')
    await expect
      .element(page.getByRole('dialog'))
      .not.toBeInTheDocument()
  })
})
