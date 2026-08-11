import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import {
  createCapabilityController,
  type CapabilitySnapshot,
  type CapabilitySnapshotPort,
} from '@/modules/capabilities'
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
  it('uses the same Task toggle feedback when removing a toolbar connector badge', async () => {
    let current = selectedSnapshot
    const listeners = new Set<(snapshot: CapabilitySnapshot) => void>()
    const setSelection = vi.fn<CapabilitySnapshotPort['setSelection']>(
      async (taskId, selection) => {
        const connectorIds = selection.connectorIds ?? current.selection.connectorIds
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

    await page.getByRole('button', { name: '移除 飞书' }).click()

    await expect
      .element(page.getByText('已停止为当前任务启用「飞书」；账号仍保持连接。'))
      .toBeInTheDocument()
    expect(setSelection).toHaveBeenCalledTimes(1)
    expect(current.connectors[0]).toMatchObject({
      connected: true,
      taskSelected: false,
      capabilityEffective: false,
      effectiveCommandScopes: [],
    })
  })
})
