import {
  createCapabilityController,
  type CapabilitySnapshot,
  type CapabilitySnapshotPort,
} from '@/modules/capabilities'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
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

  it('shows the xhs-cover chip and forwards its instruction on the next Turn', async () => {
    const xhsInstruction =
      '你当前以「小红书封面专家」配置包工作：关注封面标题、视觉卖点与合规表述；不调用未选用的连接器，不编造外呼结果。输出中文。'
    let current: CapabilitySnapshot = {
      ...selectedSnapshot,
      connectors: [],
      selection: { connectorIds: [], skillIds: [], expertId: null },
      effectiveCommandScopes: [],
      experts: [
        {
          id: 'expert.xhs-cover',
          name: '小红书封面专家',
          description: '辅助 UX 样例专家配置包',
          taskSelected: false,
          skills: [],
          connectors: [],
          source: 'static-catalog',
          instruction: xhsInstruction,
        },
      ],
    }
    const listeners = new Set<(snapshot: CapabilitySnapshot) => void>()
    const setSelection = vi.fn<CapabilitySnapshotPort['setSelection']>(
      async (taskId, selection) => {
        const expertId =
          selection.expertId !== undefined
            ? selection.expertId
            : current.selection.expertId
        current = {
          ...current,
          version: current.version + 1,
          taskId,
          experts: current.experts.map((expert) => ({
            ...expert,
            taskSelected: expert.id === expertId,
          })),
          selection: { ...current.selection, expertId },
        }
        for (const listener of listeners) listener(current)
        return current
      },
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
    const onSubmitText = vi.fn(
      async (_text: string, _composerContext?: object) => ({
        status: 'accepted' as const,
        commandId: 'cmd-xhs',
        acceptedAt: '2026-08-13T00:00:00.000Z',
      }),
    )

    render(
      <TaskComposer
        mode='runtime'
        capabilityController={controller}
        capabilityTaskId='task-a'
        onSubmitText={onSubmitText}
      />,
    )

    await page.getByTestId('composer-add').click()
    await page.getByTestId('composer-add-experts-nav').click()
    await page.getByTestId('capability-expert-expert.xhs-cover').click()

    await expect
      .element(page.getByTestId('capability-chip-expert-expert.xhs-cover'))
      .toHaveTextContent('小红书封面专家')

    await userEvent.fill(page.getByTestId('composer-input'), '写一张封面')
    await page.getByTestId('composer-submit').click()

    await expect.poll(() => onSubmitText.mock.calls.length).toBe(1)
    expect(onSubmitText.mock.calls[0]?.[0]).toBe('写一张封面')
    expect(onSubmitText.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        expert: {
          id: 'expert.xhs-cover',
          label: '小红书封面专家',
          instruction: xhsInstruction,
        },
      }),
    )
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
    type RefreshResult = { snapshot: CapabilitySnapshot; transitions: [] }
    const pendingRefreshes: Array<(value: RefreshResult) => void> = []
    const refreshAuth = vi.fn(
      () =>
        new Promise<RefreshResult>((resolve) => {
          pendingRefreshes.push(resolve)
        })
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
    const feishuItem = page.getByTestId('capability-connector-connector.feishu')
    await feishuItem.click()

    await expect
      .element(page.getByTestId('composer-auth-waiting'))
      .toBeInTheDocument()
    await expect.poll(() => pendingRefreshes.length).toBeGreaterThanOrEqual(1)

    // Submenu stays open (closeOnClick=false); second click supersedes the wait.
    await feishuItem.click()
    await expect.poll(() => pendingRefreshes.length).toBeGreaterThanOrEqual(2)

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
