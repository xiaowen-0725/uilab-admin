import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
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
  snapshot?: CapabilitySnapshot
  onStartAuth?: (connectorId: string) => void
  onToggleConnector?: (connectorId: string, selected: boolean) => void
}) {
  const onStartAuth = overrides?.onStartAuth ?? vi.fn()
  const onToggleConnector = overrides?.onToggleConnector ?? vi.fn()
  render(
    <CapabilityAddMenu
      open
      onOpenChange={vi.fn()}
      trigger={<button type='button'>添加</button>}
      snapshot={overrides?.snapshot ?? snapshot}
      onPickFiles={vi.fn()}
      onEnableGoal={vi.fn()}
      onEnablePlan={vi.fn()}
      onToggleConnector={onToggleConnector}
      onToggleSkill={vi.fn()}
      onSelectExpert={vi.fn()}
      onStartAuth={onStartAuth}
      onRefreshAuth={vi.fn()}
    />
  )
  return { onStartAuth, onToggleConnector }
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
      .element(page.getByTestId('capability-honesty-note'))
      .toHaveTextContent(/不是宿主 OAuth/)
    await page.getByTestId('capability-connector-connector.feishu').click()
    expect(onStartAuth).toHaveBeenCalledWith('connector.feishu')
  })

  it('uses the official Feishu app icon and a Task selection switch when connected', async () => {
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
      '[data-brand-id="connector.feishu"]'
    )
    expect(brandIcon?.tagName).toBe('IMG')
    expect(brandIcon?.getAttribute('alt')).toBe('飞书')

    const selectionSwitch = page.getByTestId(
      'capability-connector-switch-connector.feishu'
    )
    await expect
      .element(page.getByTestId('capability-connector-status-connector.feishu'))
      .toHaveTextContent('已连接 · CLI Session')
    await expect
      .element(selectionSwitch)
      .toHaveAttribute('aria-checked', 'false')
    await expect
      .element(selectionSwitch)
      .toHaveAttribute('aria-label', '为当前任务启用飞书')
    await selectionSwitch.click()
    expect(onToggleConnector).toHaveBeenCalledTimes(1)
    expect(onToggleConnector).toHaveBeenCalledWith('connector.feishu', true)
  })

  it('shows account connection separately and only offers a connection action while disconnected', async () => {
    renderMenu()

    await page.getByTestId('composer-add-connectors-nav').click()

    await expect
      .element(page.getByTestId('capability-connector-status-connector.github'))
      .toHaveTextContent('未连接 · OAuth')
    await expect
      .element(page.getByTestId('capability-connector-login-connector.github'))
      .toHaveTextContent('连接')
    await expect
      .element(page.getByTestId('capability-connector-switch-connector.github'))
      .not.toBeInTheDocument()
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
      .toHaveTextContent('授权已过期 · OAuth')
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
      '[data-brand-id="connector.github"]'
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
})

describe('formatStartAuthNotice', () => {
  it('describes platform-managed GitHub one-click authorization', () => {
    const message = formatStartAuthNotice({
      ok: true,
      connectorId: 'connector.github',
      kind: 'oauth2',
      phase: 'login_started',
      verificationUrl: 'https://github.com/login/oauth/authorize?state=state-1',
      loginHint: 'GitHub OAuth',
      message: '已启动 GitHub OAuth。',
    })

    expect(message).toMatch(/GitHub|UI Lab Connector|一键授权/)
    expect(message).not.toMatch(/PAT|Client Secret/)
  })

  it('never implies host OAuth inject on success', () => {
    const message = formatStartAuthNotice({
      ok: true,
      connectorId: 'connector.feishu',
      kind: 'cli_session',
      phase: 'login_started',
      verificationUrl: 'https://example.test/cli',
      loginHint: 'lark-cli',
      message: '已启动飞书 CLI 登录。这不是宿主 OAuth 注入。',
    })

    expect(message).toMatch(/CLI|验证|登录|刷新/)
    expect(message).not.toMatch(/宿主 OAuth 已完成/)
  })

  it('explains that Task selection changes only affect the next Turn', () => {
    expect(formatTaskConnectorSelectionNotice('飞书', true)).toBe(
      '已为当前任务启用「飞书」，将从下一 Turn 生效。'
    )
    expect(formatTaskConnectorSelectionNotice('飞书', false)).toBe(
      '已停止为当前任务启用「飞书」；账号仍保持连接。'
    )
  })
})
