import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { createCapabilityController } from '../application/capability-controller'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotPort,
} from '../ports/capability-snapshot-port'
import { CapabilityManagementSurface } from './capability-management-surface'

const snapshot: CapabilitySnapshot = {
  version: 1,
  generatedAt: '2026-08-11T00:00:00.000Z',
  taskId: 'task-a',
  honesty: {
    runtime: 'local-sidecar',
    authBoundary: 'provider_declared',
    note: '测试快照',
  },
  connectors: [
    {
      id: 'connector.feishu',
      name: '飞书',
      description: '通过官方 CLI 访问飞书服务。',
      enabled: true,
      connected: true,
      connectionState: 'connected',
      taskSelected: false,
      capabilityEffective: false,
      reasons: ['not_task_selected'],
      capabilities: [],
      toolScope: [],
      commandScopes: ['lark-cli'],
      effectiveToolNames: [],
      effectiveCommandScopes: [],
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
    {
      id: 'connector.example',
      name: '示例服务',
      description: '由插件动态贡献的未知连接器。',
      enabled: true,
      connected: false,
      connectionState: 'missing',
      taskSelected: false,
      capabilityEffective: false,
      reasons: ['not_connected'],
      capabilities: [],
      toolScope: ['example__'],
      commandScopes: [],
      effectiveToolNames: [],
      effectiveCommandScopes: [],
      primaryChannel: 'mcp',
      channelAuth: [{ channel: 'mcp', authKind: 'oauth2', label: 'OAuth' }],
      availability: 'sidecar',
    },
  ],
  skills: [],
  experts: [],
  selection: { connectorIds: [], skillIds: [], expertId: null },
  effectiveToolNames: [],
  effectiveCommandScopes: [],
}

function createController(
  nextSnapshot: CapabilitySnapshot = snapshot,
  overrides: Partial<CapabilitySnapshotPort> = {}
) {
  const port: CapabilitySnapshotPort = {
    getSnapshot: vi.fn(async () => nextSnapshot),
    setSelection: vi.fn(),
    startAuth: vi.fn(),
    refreshAuth: vi.fn(),
    revokeAuth: vi.fn(),
    subscribe: () => () => {},
    ...overrides,
  }
  return createCapabilityController(port)
}

describe('CapabilityManagementSurface', () => {
  it('shows account connection states without exposing Task selection switches', async () => {
    const controller = createController()
    await controller.refresh('task-a')

    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await expect
      .element(
        page.getByTestId('capability-management-connector-connector.feishu')
      )
      .toHaveTextContent('飞书')
    await expect
      .element(
        page.getByTestId('capability-management-status-connector.feishu')
      )
      .toHaveTextContent('已连接 · CLI Session')
    await expect
      .element(
        page.getByTestId('capability-management-status-connector.example')
      )
      .toHaveTextContent('尚未连接')
    await expect
      .element(page.getByRole('button', { name: '连接示例服务' }))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: '撤销飞书连接' }))
      .toBeInTheDocument()
    expect(document.querySelector('[role="switch"]')).toBeNull()
  })

  it('loads the global catalog when no Task is selected', async () => {
    const globalSnapshot = { ...snapshot, taskId: null }
    const controller = createController(globalSnapshot)

    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId={null}
        onBack={vi.fn()}
      />
    )

    await expect
      .element(
        page.getByTestId('capability-management-connector-connector.feishu')
      )
      .toHaveTextContent('飞书')
  })

  it('shows experts and skills from the same snapshot IA', async () => {
    const catalogSnapshot: CapabilitySnapshot = {
      ...snapshot,
      experts: [
        {
          id: 'expert.office',
          name: '办公助理',
          description: '处理会议和协作文档。',
          taskSelected: false,
          skills: ['meeting-notes'],
          connectors: ['connector.feishu'],
          source: 'static-catalog',
        },
      ],
      skills: [
        {
          id: 'meeting-notes',
          name: '会议纪要',
          taskSelected: false,
          discoverable: true,
          source: 'workspace',
        },
      ],
    }
    const controller = createController(catalogSnapshot)
    await controller.refresh('task-a')

    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await page.getByTestId('capability-management-tab-experts').click()
    await expect
      .element(page.getByTestId('capability-management-expert-expert.office'))
      .toHaveTextContent('办公助理')

    await page.getByTestId('capability-management-tab-skills').click()
    await expect
      .element(page.getByTestId('capability-management-skill-meeting-notes'))
      .toHaveTextContent('会议纪要')
  })

  it('shows an explicit empty state', async () => {
    const emptyController = createController({
      ...snapshot,
      connectors: [],
    })
    await emptyController.refresh('task-a')
    render(
      <CapabilityManagementSurface
        controller={emptyController}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await expect
      .element(page.getByTestId('capability-management-empty'))
      .toHaveTextContent('暂无可用连接器')
  })

  it('shows when a connector is waiting for authorization', async () => {
    const waitingController = createController({
      ...snapshot,
      connectors: snapshot.connectors.map((connector) =>
        connector.id === 'connector.example'
          ? { ...connector, connectionState: 'auth_in_progress' as const }
          : connector
      ),
    })
    await waitingController.refresh('task-a')
    render(
      <CapabilityManagementSurface
        controller={waitingController}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await expect
      .element(
        page.getByTestId('capability-management-status-connector.example')
      )
      .toHaveTextContent('等待授权')
  })

  it('shows a retryable error when the catalog cannot load', async () => {
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => {
        throw new Error('侧车暂时不可用')
      }),
      setSelection: vi.fn(),
      startAuth: vi.fn(),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)

    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await expect
      .element(page.getByTestId('capability-management-error'))
      .toHaveTextContent('侧车暂时不可用')
    await expect
      .element(page.getByRole('button', { name: '重试' }))
      .toBeInTheDocument()
  })

  it('confirms and delegates account revoke without changing Task selection', async () => {
    const revokedSnapshot: CapabilitySnapshot = {
      ...snapshot,
      connectors: snapshot.connectors.map((connector) =>
        connector.id === 'connector.feishu'
          ? {
              ...connector,
              connected: false,
              connectionState: 'missing' as const,
            }
          : connector
      ),
    }
    const revokeAuth = vi.fn(async () => ({
      snapshot: revokedSnapshot,
      connectorId: 'connector.feishu',
      message: '已撤销飞书账号连接',
      needsSidecarRestart: true,
    }))
    const controller = createController(snapshot, { revokeAuth })
    await controller.refresh('task-a')
    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await page.getByRole('button', { name: '撤销飞书连接' }).click()
    await expect
      .element(page.getByRole('heading', { name: '撤销飞书连接？' }))
      .toBeInTheDocument()
    await page.getByRole('button', { name: '确认撤销' }).click()

    expect(revokeAuth).toHaveBeenCalledWith('task-a', 'connector.feishu')
    await expect
      .element(
        page.getByTestId('capability-management-status-connector.feishu')
      )
      .toHaveTextContent('尚未连接')
  })

  it('releases catalog pending while waiting for login so 刷新状态 stays enabled', async () => {
    const disconnected: CapabilitySnapshot = {
      ...snapshot,
      connectors: snapshot.connectors.map((connector) =>
        connector.id === 'connector.feishu'
          ? {
              ...connector,
              connected: false,
              connectionState: 'missing' as const,
            }
          : connector
      ),
    }
    const startAuth = vi.fn(async () => ({
      ok: true as const,
      connectorId: 'connector.feishu',
      kind: 'cli_session' as const,
      phase: 'login_started' as const,
      verificationUrl: 'https://accounts.example.test/device',
      message: '已打开授权页面，完成授权后状态会自动刷新。',
      loginHint: '飞书 CLI',
    }))
    // Hang wait-for-auth refresh so we stay in the waiting UI.
    const refreshAuth = vi.fn(
      () => new Promise<never>(() => {})
    ) as CapabilitySnapshotPort['refreshAuth']
    const controller = createController(disconnected, { startAuth, refreshAuth })
    await controller.refresh('task-a')
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await page.getByRole('button', { name: '连接飞书' }).click()

    await expect
      .element(page.getByTestId('capability-management-cancel-auth'))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: '刷新状态' }))
      .not.toHaveAttribute('disabled')
    openWindow.mockRestore()
  })

  it('treats already_connected startAuth as success and refreshes card state', async () => {
    let current: CapabilitySnapshot = {
      ...snapshot,
      connectors: snapshot.connectors.map((connector) =>
        connector.id === 'connector.feishu'
          ? {
              ...connector,
              connected: false,
              connectionState: 'missing' as const,
            }
          : connector
      ),
    }
    const listeners = new Set<(snapshot: CapabilitySnapshot) => void>()
    const startAuth = vi.fn(async () => ({
      ok: true as const,
      connectorId: 'connector.feishu',
      kind: 'cli_session' as const,
      phase: 'already_connected' as const,
      step: 'connected' as const,
      message: '「飞书」CLI session 已连接。',
      loginHint: '飞书 CLI',
    }))
    const refreshAuth = vi.fn(async () => {
      current = {
        ...current,
        version: current.version + 1,
        connectors: current.connectors.map((connector) =>
          connector.id === 'connector.feishu'
            ? {
                ...connector,
                connected: true,
                connectionState: 'connected' as const,
              }
            : connector
        ),
      }
      for (const listener of listeners) listener(current)
      return { snapshot: current, transitions: [] }
    })
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => current),
      setSelection: vi.fn(),
      startAuth,
      refreshAuth,
      revokeAuth: vi.fn(),
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    render(
      <CapabilityManagementSurface
        controller={controller}
        taskId='task-a'
        onBack={vi.fn()}
      />
    )

    await page.getByRole('button', { name: '连接飞书' }).click()
    await expect
      .element(page.getByTestId('capability-management-action-notice'))
      .toHaveTextContent('「飞书」CLI session 已连接。')
    await expect
      .element(
        page.getByTestId('capability-management-status-connector.feishu')
      )
      .toHaveTextContent('已连接')
    expect(startAuth).toHaveBeenCalledWith('connector.feishu', undefined)
    expect(refreshAuth).toHaveBeenCalled()
    openWindow.mockRestore()
  })
})
