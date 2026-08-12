import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { CapabilitySnapshot } from '../ports/capability-snapshot-port'
import { CapabilityAddMenu } from './capability-add-menu'
import {
  formatStartAuthNotice,
  formatTaskConnectorSelectionNotice,
} from './start-auth-notice'

const snapshot: CapabilitySnapshot = {
  version: 3,
  generatedAt: '2026-08-09T00:00:00.000Z',
  taskId: 't1',
  honesty: {
    runtime: 'local-sidecar',
    authBoundary: 'provider_declared',
    note: '飞书 Connected = lark-cli cli_session，不是宿主 OAuth 注入。',
  },
  connectors: [
    {
      id: 'connector.github',
      name: 'GitHub',
      description: '官方 MCP 连接器',
      enabled: false,
      connected: false,
      connectionState: 'missing',
      taskSelected: false,
      capabilityEffective: false,
      reasons: ['not_enabled', 'not_connected'],
      capabilities: [
        {
          id: 'collaboration',
          name: '代码托管与协作',
          available: true,
          toolNames: [],
        },
      ],
      toolScope: ['github__'],
      commandScopes: [],
      effectiveToolNames: [],
      effectiveCommandScopes: [],
      loginHint: '点击连接并完成 GitHub OAuth',
      primaryChannel: 'mcp',
      channelAuth: [
        {
          channel: 'mcp',
          authKind: 'oauth2',
          label: 'GitHub OAuth',
        },
      ],
      availability: 'sidecar',
      brandIconKey: 'github',
    },
    {
      id: 'connector.feishu',
      name: '飞书',
      description: '命令行连接器',
      enabled: true,
      connected: false,
      connectionState: 'missing',
      taskSelected: false,
      capabilityEffective: false,
      reasons: ['not_task_selected', 'not_connected'],
      capabilities: [
        {
          id: 'native_cli',
          name: '原生 CLI / 官方 Skills',
          available: true,
          toolNames: [],
        },
      ],
      toolScope: [],
      commandScopes: ['lark-cli'],
      effectiveToolNames: [],
      effectiveCommandScopes: [],
      loginHint: '请运行 lark-cli auth login（不是宿主 OAuth）',
      primaryChannel: 'domain_cli',
      channelAuth: [
        {
          channel: 'domain_cli',
          authKind: 'cli_session',
          label: 'CLI session（lark-cli）',
        },
      ],
      availability: 'sidecar',
      brandIconKey: 'feishu',
    },
  ],
  skills: [
    {
      id: 'meeting-notes',
      name: 'meeting-notes',
      taskSelected: false,
      discoverable: true,
      source: 'workspace',
    },
  ],
  experts: [
    {
      id: 'expert.office-meeting',
      name: '会议纪要专家',
      description: '会议纪要配置包',
      taskSelected: false,
      skills: ['meeting-notes'],
      connectors: ['connector.feishu'],
      source: 'static-catalog',
    },
  ],
  selection: { connectorIds: [], skillIds: [], expertId: null },
  effectiveToolNames: [],
  effectiveCommandScopes: [],
}

function renderMenu(overrides?: {
  snapshot?: CapabilitySnapshot | null
  onStartAuth?: (connectorId: string) => void
  onCancelAuth?: () => void
  authWaitingConnectorId?: string | null
  onToggleConnector?: (connectorId: string, selected: boolean) => void
  errorMessage?: string
  onRetry?: () => void
  onManageConnectors?: () => void
}) {
  const onStartAuth = overrides?.onStartAuth ?? vi.fn()
  const onCancelAuth = overrides?.onCancelAuth ?? vi.fn()
  const onToggleConnector = overrides?.onToggleConnector ?? vi.fn()
  render(
    <CapabilityAddMenu
      open
      onOpenChange={vi.fn()}
      trigger={<button type='button'>添加</button>}
      snapshot={
        overrides && 'snapshot' in overrides
          ? (overrides.snapshot ?? null)
          : snapshot
      }
      errorMessage={overrides?.errorMessage}
      onRetry={overrides?.onRetry}
      onPickFiles={vi.fn()}
      onEnableGoal={vi.fn()}
      onEnablePlan={vi.fn()}
      onToggleConnector={onToggleConnector}
      onToggleSkill={vi.fn()}
      onSelectExpert={vi.fn()}
      onStartAuth={onStartAuth}
      onCancelAuth={onCancelAuth}
      authWaitingConnectorId={overrides?.authWaitingConnectorId}
      onRefreshAuth={vi.fn()}
      onManageConnectors={overrides?.onManageConnectors}
    />
  )
  return { onStartAuth, onCancelAuth, onToggleConnector }
}

function KeyboardMenuHarness() {
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

describe('CapabilityAddMenu WorkBuddy IA', () => {
  it('keeps the root compact and moves honesty copy out of the root', async () => {
    renderMenu()

    const root = page.getByTestId('composer-add-panel')
    await expect.element(root).toBeInTheDocument()
    expect(root.element().getBoundingClientRect().width).toBeLessThanOrEqual(
      224
    )
    await expect
      .element(page.getByTestId('composer-add-connectors-nav'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('capability-honesty-note'))
      .not.toBeInTheDocument()
  })

  it('keeps implementation diagnostics behind a named support entry', async () => {
    const diagnosticSnapshot: CapabilitySnapshot = {
      ...snapshot,
      honesty: {
        ...snapshot.honesty,
        note: 'Capability Snapshot · PluginManifest · Renderer · Fake',
      },
    }
    renderMenu({ snapshot: diagnosticSnapshot })

    await page.getByTestId('composer-add-connectors-nav').click()
    await expect
      .element(page.getByTestId('capability-connectors-submenu'))
      .not.toHaveTextContent(/Capability Snapshot|PluginManifest|Renderer|Fake/)
    await expect
      .element(page.getByTestId('capability-support-nav'))
      .toHaveAccessibleName('查看连接器支持信息')

    await page.getByTestId('capability-support-nav').click()
    await expect
      .element(page.getByTestId('capability-support-details'))
      .toHaveTextContent(
        'Capability Snapshot · PluginManifest · Renderer · Fake'
      )
  })

  it('opens connectors in a lateral submenu and starts CLI auth', async () => {
    const onStartAuth = vi.fn()
    renderMenu({ onStartAuth })

    await page.getByTestId('composer-add-connectors-nav').click()
    const root = page.getByTestId('composer-add-panel')
    const submenu = page.getByTestId('capability-connectors-submenu')
    await expect.element(submenu).toBeInTheDocument()

    const rootBox = root.element().getBoundingClientRect()
    const submenuBox = submenu.element().getBoundingClientRect()
    // Base UI overlaps the popup edge by a few pixels to preserve the hover corridor.
    expect(submenuBox.left).toBeGreaterThan(rootBox.left + rootBox.width * 0.75)

    await expect
      .element(page.getByTestId('capability-support-nav'))
      .toBeInTheDocument()
    await page.getByTestId('capability-connector-connector.feishu').click()
    expect(onStartAuth).toHaveBeenCalledWith('connector.feishu')
  })

  it('uses the official Feishu app icon and a Task selection menu item when connected', async () => {
    const onToggleConnector = vi.fn()
    const connectedSnapshot: CapabilitySnapshot = {
      ...snapshot,
      connectors: snapshot.connectors.map((connector) => ({
        ...connector,
        connected: true,
        connectionState: 'connected',
        reasons: ['not_task_selected'],
      })),
    }
    renderMenu({ snapshot: connectedSnapshot, onToggleConnector })

    await page.getByTestId('composer-add-connectors-nav').click()
    await expect
      .element(page.getByTestId('capability-connectors-submenu'))
      .toBeInTheDocument()

    const brandIcon = document.querySelector(
      '[data-brand-id="feishu"]'
    )
    expect(brandIcon?.tagName).toBe('IMG')
    expect(brandIcon?.getAttribute('alt')).toBe('飞书')

    const selectionItem = page.getByTestId(
      'capability-connector-connector.feishu'
    )
    await expect
      .element(page.getByTestId('capability-connector-status-connector.feishu'))
      .toHaveTextContent(/^已连接$/)
    await expect
      .element(selectionItem)
      .toHaveAttribute('role', 'menuitemcheckbox')
    await expect.element(selectionItem).toHaveAttribute('aria-checked', 'false')
    await expect
      .element(selectionItem)
      .toHaveAccessibleName('为当前任务启用飞书，账号已连接')
    selectionItem.element().focus()
    await userEvent.keyboard(' ')
    expect(onToggleConnector).toHaveBeenCalledTimes(1)
    expect(onToggleConnector).toHaveBeenCalledWith('connector.feishu', true)
  })

  it('shows account connection separately and only offers a connection action while disconnected', async () => {
    renderMenu()

    await page.getByTestId('composer-add-connectors-nav').click()

    await expect
      .element(page.getByTestId('capability-connector-status-connector.github'))
      .toHaveTextContent(/^未连接$/)
    await expect
      .element(page.getByTestId('capability-connector-login-connector.github'))
      .toHaveTextContent('连接')
    await expect
      .element(page.getByRole('menuitem', { name: 'GitHub 未连接 连接' }))
      .toBeVisible()
    await expect
      .element(page.getByTestId('capability-connector-switch-connector.github'))
      .not.toBeInTheDocument()
  })

  it('uses forward navigation semantics only when connector management is available', async () => {
    const onManageConnectors = vi.fn()
    renderMenu({ onManageConnectors })

    await page.getByTestId('composer-add-connectors-nav').click()
    const manage = page.getByTestId('capability-manage-connectors')
    await expect.element(manage).toHaveAccessibleName('管理连接器')
    await expect.element(manage).not.toHaveTextContent('↗')
    expect(
      manage.element().querySelector('[data-navigation-icon="forward"]')
    ).toBeTruthy()
    await manage.click()
    expect(onManageConnectors).toHaveBeenCalledTimes(1)
  })

  it('shows a clear unavailable state instead of a dead management action', async () => {
    renderMenu()

    await page.getByTestId('composer-add-connectors-nav').click()
    await expect
      .element(page.getByTestId('capability-manage-connectors'))
      .toHaveTextContent('连接器管理暂不可用')
    await expect
      .element(page.getByTestId('capability-manage-connectors'))
      .toHaveAttribute('data-disabled')
  })

  it('shows a recoverable error instead of pretending the connector catalog is empty', async () => {
    const onRetry = vi.fn()
    renderMenu({
      snapshot: null,
      errorMessage: 'Capability Snapshot sidecar unavailable',
      onRetry,
    })

    await page.getByTestId('composer-add-connectors-nav').click()
    await expect
      .element(page.getByTestId('capability-connectors-error'))
      .toHaveTextContent('暂时无法加载连接器。请重试。')
    await expect
      .element(page.getByTestId('capability-connectors-submenu'))
      .not.toHaveTextContent(/Capability Snapshot|sidecar/)
    await expect
      .element(page.getByTestId('capability-connectors-error'))
      .toHaveAttribute('role', 'alert')
    await page.getByRole('button', { name: '重试加载连接器' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers reconnection without exposing a Task switch when account authorization expired', async () => {
    const expiredSnapshot: CapabilitySnapshot = {
      ...snapshot,
      connectors: snapshot.connectors.map((connector) =>
        connector.id === 'connector.github'
          ? { ...connector, connectionState: 'expired' }
          : connector
      ),
    }
    renderMenu({ snapshot: expiredSnapshot })

    await page.getByTestId('composer-add-connectors-nav').click()

    await expect
      .element(page.getByTestId('capability-connector-status-connector.github'))
      .toHaveTextContent(/^授权已过期$/)
    await expect
      .element(page.getByTestId('capability-connector-login-connector.github'))
      .toHaveTextContent('重新连接')
    await expect
      .element(page.getByTestId('capability-connector-switch-connector.github'))
      .not.toBeInTheDocument()
  })

  it('shows a GitHub brand mark for the MCP connector', async () => {
    renderMenu()

    await page.getByTestId('composer-add-connectors-nav').click()
    await expect
      .element(page.getByTestId('capability-connector-connector.github'))
      .toBeInTheDocument()

    const githubIcon = document.querySelector(
      '[data-brand-id="github"]'
    )
    expect(githubIcon?.tagName).toBe('svg')
    expect(githubIcon?.getAttribute('aria-label')).toBe('GitHub')
  })

  it('opens experts and skills as separate lateral submenus', async () => {
    renderMenu()

    await page.getByTestId('composer-add-experts-nav').click()
    await expect
      .element(page.getByTestId('capability-expert-expert.office-meeting'))
      .toBeInTheDocument()

    await page.getByTestId('composer-add-skills-nav').click()
    await expect
      .element(page.getByTestId('capability-skill-meeting-notes'))
      .toBeInTheDocument()
  })

  it('explains expert timing without exposing configuration or Turn terminology', async () => {
    renderMenu()

    await page.getByTestId('composer-add-experts-nav').click()
    const expertsMenu = page.getByTestId('capability-experts-submenu')
    await expect.element(expertsMenu).toHaveTextContent('从下一次发送开始生效')
    await expect
      .element(expertsMenu)
      .not.toHaveTextContent(/配置包|Turn|Capability Snapshot|Renderer/)
  })

  it('supports a complete keyboard path through submenu search and restores focus', async () => {
    render(<KeyboardMenuHarness />)
    const trigger = page.getByTestId('capability-keyboard-trigger')
    await expect.element(trigger).toBeInTheDocument()
    trigger.element().focus()

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Home}')
    await expect.element(page.getByTestId('composer-add-files')).toHaveFocus()
    await userEvent.keyboard(
      '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}'
    )
    await expect
      .element(page.getByTestId('capability-connectors-submenu'))
      .toBeInTheDocument()

    await userEvent.keyboard('/')
    await expect
      .element(page.getByTestId('capability-connector-search'))
      .toHaveFocus()
    await userEvent.keyboard('飞书')
    await expect
      .element(page.getByTestId('capability-connector-connector.github'))
      .not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect
      .element(page.getByTestId('composer-add-connectors-nav'))
      .toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(trigger).toHaveFocus()
  })

  it('keeps text and interactive targets readable at the desktop accessibility baseline', async () => {
    renderMenu({ onManageConnectors: vi.fn() })

    const fileItem = page.getByTestId('composer-add-files')
    await expect.element(fileItem).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    expect(
      fileItem.element().getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(39.5)

    await page.getByTestId('composer-add-connectors-nav').click()
    await expect
      .element(page.getByTestId('capability-connectors-submenu'))
      .toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    const search = page.getByTestId('capability-connector-search').element()
    const manage = page.getByTestId('capability-manage-connectors').element()
    const status = page
      .getByTestId('capability-connector-status-connector.github')
      .element()
    const searchTarget = search.closest('label')
    expect(searchTarget).toBeTruthy()
    expect(
      searchTarget?.getBoundingClientRect().height ?? 0
    ).toBeGreaterThanOrEqual(39.5)
    expect(manage.getBoundingClientRect().height).toBeGreaterThanOrEqual(39.5)
    expect(
      Number.parseFloat(getComputedStyle(status).fontSize)
    ).toBeGreaterThanOrEqual(12)
  })

  it('keeps the root and lateral connector menu inside a 200% zoom viewport', async () => {
    await page.viewport(720, 450)
    renderMenu({ onManageConnectors: vi.fn() })

    await page.getByTestId('composer-add-connectors-nav').click()
    await expect
      .element(page.getByTestId('capability-connectors-submenu'))
      .toBeInTheDocument()
    for (const testId of [
      'composer-add-panel',
      'capability-connectors-submenu',
    ]) {
      const box = page.getByTestId(testId).element().getBoundingClientRect()
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.top).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(window.innerWidth)
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    }
    await expect
      .element(page.getByTestId('capability-manage-connectors'))
      .toBeInTheDocument()
  })
})

describe('formatStartAuthNotice', () => {
  it('describes account authorization without implementation terminology', () => {
    const message = formatStartAuthNotice({
      ok: true,
      connectorId: 'connector.github',
      kind: 'oauth2',
      phase: 'login_started',
      verificationUrl: 'https://github.com/login/oauth/authorize?state=state-1',
      loginHint: 'GitHub OAuth',
      message: '已启动 GitHub OAuth。',
    })

    expect(message).toBe('已打开账号授权页面。完成授权后，连接状态会自动刷新。')
    expect(message).not.toMatch(/OAuth|Capability|Connector|PAT|Client Secret/)
  })

  it('explains a configuration step in user-facing account language', () => {
    const message = formatStartAuthNotice({
      ok: true,
      connectorId: 'connector.feishu',
      kind: 'cli_session',
      phase: 'login_started',
      step: 'configure',
      verificationUrl: 'https://example.test/cli',
      loginHint: 'lark-cli',
      message: '已启动飞书 CLI 登录。这不是宿主 OAuth 注入。',
    })

    expect(message).toBe('已打开账号连接页面。完成设置后，将继续账号授权。')
    expect(message).not.toMatch(/CLI|OAuth|宿主|Runtime/)
  })

  it('explains that Task selection changes only affect the next Turn', () => {
    expect(formatTaskConnectorSelectionNotice('飞书', true)).toBe(
      '已为当前任务启用「飞书」，将从下次发送开始生效。'
    )
    expect(formatTaskConnectorSelectionNotice('飞书', false)).toBe(
      '已停止为当前任务启用「飞书」；账号仍保持连接。'
    )
  })

  it('offers explicit cancel-login while authorization is waiting', async () => {
    const onCancelAuth = vi.fn()
    renderMenu({
      authWaitingConnectorId: 'connector.feishu',
      onCancelAuth,
    })

    await page.getByTestId('composer-add-connectors-nav').click()
    const cancel = page.getByTestId('capability-connector-cancel-auth')
    await expect.element(cancel).toHaveTextContent('取消登录')
    await cancel.click()
    expect(onCancelAuth).toHaveBeenCalledTimes(1)
  })
})
