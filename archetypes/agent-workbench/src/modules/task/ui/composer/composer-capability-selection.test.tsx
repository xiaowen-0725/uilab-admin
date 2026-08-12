import {
  createCapabilityController,
  type CapabilitySnapshot,
  type CapabilitySnapshotPort,
} from '@/modules/capabilities'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { TaskComposer } from './composer'

const selectedSnapshot: CapabilitySnapshot = {
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
      description: '官方 CLI',
      enabled: true,
      connected: true,
      connectionState: 'connected',
      taskSelected: true,
      capabilityEffective: true,
      reasons: [],
      capabilities: [],
      toolScope: [],
      commandScopes: ['lark-cli'],
      effectiveToolNames: [],
      effectiveCommandScopes: ['lark-cli'],
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
  skills: [],
  experts: [],
  selection: {
    connectorIds: ['connector.feishu'],
    skillIds: [],
    expertId: null,
  },
  effectiveToolNames: [],
  effectiveCommandScopes: ['lark-cli'],
}

describe('TaskComposer connector selection', () => {
  it('names the add menu by every capability it actually opens', async () => {
    render(<TaskComposer mode='runtime' />)

    await expect
      .element(
        page.getByRole('button', {
          name: '添加文件、模式、专家、技能或连接器',
        })
      )
      .toBeInTheDocument()
  })

  it('uses the same Task toggle feedback when removing a toolbar connector badge', async () => {
    let current = selectedSnapshot
    const listeners = new Set<(snapshot: CapabilitySnapshot) => void>()
    const setSelection = vi.fn<CapabilitySnapshotPort['setSelection']>(
      async (taskId, selection) => {
        const connectorIds =
          selection.connectorIds ?? current.selection.connectorIds
        current = {
          ...current,
          version: current.version + 1,
          taskId,
          connectors: current.connectors.map((connector) => ({
            ...connector,
            taskSelected: connectorIds.includes(connector.id),
            capabilityEffective: connectorIds.includes(connector.id),
            effectiveCommandScopes: connectorIds.includes(connector.id)
              ? connector.commandScopes
              : [],
          })),
          selection: { ...current.selection, connectorIds },
          effectiveCommandScopes: connectorIds.length > 0 ? ['lark-cli'] : [],
        }
        for (const listener of listeners) listener(current)
        return current
      }
    )
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => current),
      setSelection,
      startAuth: vi.fn(),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')

    render(
      <TaskComposer
        mode='runtime'
        runtimeNotice='已从本地存储恢复时间线'
        capabilityController={controller}
        capabilityTaskId='task-a'
      />
    )

    const liveNotice = page.getByTestId('composer-notice')
    await expect.element(liveNotice).toHaveAttribute('role', 'status')
    await expect.element(liveNotice).toHaveAttribute('aria-live', 'polite')

    await page.getByRole('button', { name: '移除 飞书' }).click()

    await expect
      .element(liveNotice)
      .toHaveTextContent('已停止为当前任务启用「飞书」；账号仍保持连接。')
    expect(setSelection).toHaveBeenCalledTimes(1)
    expect(current.connectors[0]).toMatchObject({
      connected: true,
      taskSelected: false,
      capabilityEffective: false,
      effectiveCommandScopes: [],
    })
  })

  it('announces a recoverable product error without exposing adapter diagnostics', async () => {
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => selectedSnapshot),
      setSelection: vi.fn(async () => {
        throw new Error('Capability Snapshot sidecar request failed')
      }),
      startAuth: vi.fn(),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')
    render(
      <TaskComposer
        mode='runtime'
        capabilityController={controller}
        capabilityTaskId='task-a'
      />
    )

    await page.getByTestId('composer-add').click()
    await page.getByTestId('composer-add-connectors-nav').click()
    await page.getByTestId('capability-connector-connector.feishu').click()

    const notice = page.getByTestId('composer-notice')
    await expect
      .element(notice)
      .toHaveTextContent('暂时无法更新当前任务的连接器。请重试。')
    await expect
      .element(notice)
      .not.toHaveTextContent(/Capability Snapshot|sidecar/)
  })

  it('announces when a skill will begin affecting the current Task', async () => {
    const skillSnapshot: CapabilitySnapshot = {
      ...selectedSnapshot,
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
    const setSelection = vi.fn(async () => skillSnapshot)
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => skillSnapshot),
      setSelection,
      startAuth: vi.fn(),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')
    render(
      <TaskComposer
        mode='runtime'
        capabilityController={controller}
        capabilityTaskId='task-a'
      />
    )

    await page.getByTestId('composer-add').click()
    await page.getByTestId('composer-add-skills-nav').click()
    await page.getByTestId('capability-skill-meeting-notes').click()

    expect(setSelection).toHaveBeenCalledWith('task-a', {
      skillIds: ['meeting-notes'],
    })
    await expect
      .element(page.getByTestId('composer-notice'))
      .toHaveTextContent(
        '已为当前任务启用技能「会议纪要」，将从下次发送开始生效。'
      )
  })

  it('announces the selected expert in plain user language', async () => {
    const expertSnapshot: CapabilitySnapshot = {
      ...selectedSnapshot,
      experts: [
        {
          id: 'expert.office-meeting',
          name: '会议纪要专家',
          description: '整理会议内容',
          taskSelected: false,
          skills: [],
          connectors: [],
          source: 'static-catalog',
        },
      ],
    }
    const setSelection = vi.fn(async () => expertSnapshot)
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => expertSnapshot),
      setSelection,
      startAuth: vi.fn(),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')
    render(
      <TaskComposer
        mode='runtime'
        capabilityController={controller}
        capabilityTaskId='task-a'
      />
    )

    await page.getByTestId('composer-add').click()
    await page.getByTestId('composer-add-experts-nav').click()
    await page.getByTestId('capability-expert-expert.office-meeting').click()

    expect(setSelection).toHaveBeenCalledWith('task-a', {
      expertId: 'expert.office-meeting',
    })
    await expect
      .element(page.getByTestId('composer-notice'))
      .toHaveTextContent('已选用专家「会议纪要专家」，将从下次发送开始生效。')
  })

  it('announces account connection failures without adapter diagnostics', async () => {
    const disconnectedSnapshot: CapabilitySnapshot = {
      ...selectedSnapshot,
      connectors: selectedSnapshot.connectors.map((connector) => ({
        ...connector,
        connected: false,
        connectionState: 'missing',
        taskSelected: false,
      })),
      selection: {
        ...selectedSnapshot.selection,
        connectorIds: [],
      },
    }
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => disconnectedSnapshot),
      setSelection: vi.fn(),
      startAuth: vi.fn(async () => {
        throw new Error('Runtime adapter unavailable')
      }),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    render(
      <TaskComposer
        mode='runtime'
        capabilityController={controller}
        capabilityTaskId='task-a'
      />
    )

    await page.getByTestId('composer-add').click()
    await page.getByTestId('composer-add-connectors-nav').click()
    await page.getByTestId('capability-connector-connector.feishu').click()

    const notice = page.getByTestId('composer-notice')
    await expect
      .element(notice)
      .toHaveTextContent('暂时无法打开账号连接。请重试。')
    await expect.element(notice).not.toHaveTextContent(/Runtime|adapter/)
    openWindow.mockRestore()
  })

  it('cancels an in-flight login wait with an explicit 取消登录 control', async () => {
    const disconnectedSnapshot: CapabilitySnapshot = {
      ...selectedSnapshot,
      connectors: selectedSnapshot.connectors.map((connector) => ({
        ...connector,
        connected: false,
        connectionState: 'missing',
        taskSelected: false,
        capabilityEffective: false,
        effectiveCommandScopes: [],
      })),
      selection: {
        ...selectedSnapshot.selection,
        connectorIds: [],
      },
      effectiveCommandScopes: [],
    }
    const refreshAuth = vi.fn(async () => ({
      snapshot: disconnectedSnapshot,
      transitions: [],
    }))
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => disconnectedSnapshot),
      setSelection: vi.fn(),
      startAuth: vi.fn(async () => ({
        ok: true as const,
        connectorId: 'connector.feishu',
        kind: 'cli_session' as const,
        phase: 'login_started' as const,
        verificationUrl: 'https://accounts.example.test/device',
        message: '请在浏览器完成授权',
        loginHint: '请完成授权',
      })),
      refreshAuth,
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')
    const fakeWindow = {
      closed: false,
      opener: null as Window | null,
      location: { replace: vi.fn() },
      close: vi.fn(),
    }
    const openWindow = vi
      .spyOn(window, 'open')
      .mockReturnValue(fakeWindow as unknown as Window)

    render(
      <TaskComposer
        mode='runtime'
        capabilityController={controller}
        capabilityTaskId='task-a'
      />
    )

    await page.getByTestId('composer-add').click()
    await page.getByTestId('composer-add-connectors-nav').click()
    await page.getByTestId('capability-connector-connector.feishu').click()

    await expect
      .element(page.getByTestId('composer-auth-waiting'))
      .toBeInTheDocument()
    await page.getByTestId('composer-cancel-auth').click()

    await expect
      .element(page.getByTestId('composer-notice'))
      .toHaveTextContent('已取消登录')
    await expect
      .element(page.getByTestId('composer-auth-waiting'))
      .not.toBeInTheDocument()
    // Cancel must not invent Connected.
    expect(controller.getCached()?.connectors[0]?.connected).toBe(false)
    openWindow.mockRestore()
  })

  it('keeps waiting UI when a superseded wait finishes after a second connect', async () => {
    const disconnectedSnapshot: CapabilitySnapshot = {
      ...selectedSnapshot,
      connectors: selectedSnapshot.connectors.map((connector) => ({
        ...connector,
        connected: false,
        connectionState: 'missing',
        taskSelected: false,
        capabilityEffective: false,
        effectiveCommandScopes: [],
      })),
      selection: {
        ...selectedSnapshot.selection,
        connectorIds: [],
      },
      effectiveCommandScopes: [],
    }
    const pendingRefreshes: Array<
      (value: { snapshot: CapabilitySnapshot; transitions: [] }) => void
    > = []
    const refreshAuth = vi.fn(
      () =>
        new Promise<{ snapshot: CapabilitySnapshot; transitions: [] }>(
          (resolve) => {
            pendingRefreshes.push(resolve)
          }
        )
    )
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async () => disconnectedSnapshot),
      setSelection: vi.fn(),
      startAuth: vi.fn(async () => ({
        ok: true as const,
        connectorId: 'connector.feishu',
        kind: 'cli_session' as const,
        phase: 'login_started' as const,
        verificationUrl: 'https://accounts.example.test/device',
        message: '请在浏览器完成授权',
        loginHint: '请完成授权',
      })),
      refreshAuth,
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')
    const fakeWindow = {
      closed: false,
      opener: null as Window | null,
      location: { replace: vi.fn() },
      close: vi.fn(),
    }
    const openWindow = vi
      .spyOn(window, 'open')
      .mockReturnValue(fakeWindow as unknown as Window)

    render(
      <TaskComposer
        mode='runtime'
        capabilityController={controller}
        capabilityTaskId='task-a'
      />
    )

    await page.getByTestId('composer-add').click()
    await page.getByTestId('composer-add-connectors-nav').click()
    await page.getByTestId('capability-connector-connector.feishu').click()

    await expect
      .element(page.getByTestId('composer-auth-waiting'))
      .toBeInTheDocument()
    await expect.poll(() => pendingRefreshes.length).toBeGreaterThanOrEqual(1)

    // Submenu keeps the connector item (closeOnClick=false) — click again while
    // the first wait's refresh is still pending to supersede that wait.
    await page.getByTestId('capability-connector-connector.feishu').click()

    await expect.poll(() => pendingRefreshes.length).toBeGreaterThanOrEqual(2)

    // Finish the superseded wait's in-flight refresh — must not clear the new wait UI.
    pendingRefreshes[0]!({
      snapshot: disconnectedSnapshot,
      transitions: [],
    })

    await expect
      .element(page.getByTestId('composer-auth-waiting'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer-cancel-auth'))
      .toBeInTheDocument()
    openWindow.mockRestore()
  })
})
