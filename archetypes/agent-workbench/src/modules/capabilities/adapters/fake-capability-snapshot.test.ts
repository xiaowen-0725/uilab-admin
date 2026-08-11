import { describe, expect, it } from 'vitest'
import { createCapabilityController } from '../application/capability-controller'
import { CONNECTOR_FEISHU_ID } from '../model/task-selection'
import type { TaskCapabilitySelectionStore } from '../model/task-selection'
import { createFakeCapabilitySnapshotPort } from './fake-capability-snapshot'

describe('createFakeCapabilitySnapshotPort', () => {
  it('reports when a Task selection cannot be persisted locally', async () => {
    const controller = createCapabilityController(
      createFakeCapabilitySnapshotPort(),
      {
        selectionStore: {
          get: () => null,
          set: () => false,
          clear: () => false,
        },
      }
    )

    await controller.setSelection('task-a', {
      connectorIds: [CONNECTOR_FEISHU_ID],
    })

    expect(controller.getError()?.message).toMatch(/持久化失败|存储/)
    controller.dispose()
  })

  it('restores and re-syncs per-Task selection after a page/runtime reload', async () => {
    const persisted = new Map()
    const selectionStore: TaskCapabilitySelectionStore = {
      get: (taskId) => persisted.get(taskId) ?? null,
      set: (taskId, selection) => {
        persisted.set(taskId, selection)
        return true
      },
      clear: (taskId) => persisted.delete(taskId),
    }
    const first = createCapabilityController(
      createFakeCapabilitySnapshotPort(),
      { selectionStore }
    )
    await first.setSelection('task-a', {
      connectorIds: [CONNECTOR_FEISHU_ID],
    })
    first.dispose()

    const reloaded = createCapabilityController(
      createFakeCapabilitySnapshotPort(),
      { selectionStore }
    )
    const restored = await reloaded.refresh('task-a')

    expect(restored.selection.connectorIds).toEqual([CONNECTOR_FEISHU_ID])
    expect(
      restored.connectors.find(
        (connector) => connector.id === CONNECTOR_FEISHU_ID
      )?.taskSelected
    ).toBe(true)
    reloaded.dispose()
  })

  it('allows catalog + selection without faking Connected outbound', async () => {
    const port = createFakeCapabilitySnapshotPort({
      nowIso: () => '2026-08-09T12:00:00.000Z',
    })
    const before = await port.getSnapshot('task-a')
    expect(before.honesty.runtime).toBe('fake')
    expect(before.honesty.authBoundary).toBe('provider_declared')
    expect(before.connectors.map((connector) => connector.id)).toEqual([
      'connector.github',
      CONNECTOR_FEISHU_ID,
    ])
    expect(before.connectors[0]?.connected).toBe(false)
    expect(before.connectors[0]?.availability).toBe('fake-catalog-only')
    expect(
      before.connectors
        .find((connector) => connector.id === CONNECTOR_FEISHU_ID)
        ?.channelAuth?.some((row) => row.channel === 'mcp')
    ).toBe(false)
    expect(
      before.connectors
        .find((connector) => connector.id === CONNECTOR_FEISHU_ID)
        ?.capabilities.find((capability) => capability.id === 'native_cli')
        ?.toolNames
    ).toEqual([])
    expect(
      before.connectors.find(
        (connector) => connector.id === CONNECTOR_FEISHU_ID
      )?.commandScopes
    ).toEqual(['lark-cli'])
    expect(before.effectiveToolNames).toEqual([])

    const after = await port.setSelection('task-a', {
      connectorIds: [CONNECTOR_FEISHU_ID],
      expertId: 'expert.office-meeting',
    })
    expect(after.selection.connectorIds).toContain(CONNECTOR_FEISHU_ID)
    const selectedFeishu = after.connectors.find(
      (connector) => connector.id === CONNECTOR_FEISHU_ID
    )
    expect(selectedFeishu?.taskSelected).toBe(true)
    expect(selectedFeishu?.capabilityEffective).toBe(false)
    expect(after.effectiveToolNames).toEqual([])

    const taskB = await port.getSnapshot('task-b')
    expect(taskB.selection.connectorIds).toEqual([])
    expect(
      taskB.connectors.find((connector) => connector.id === CONNECTOR_FEISHU_ID)
        ?.taskSelected
    ).toBe(false)

    const restoredTaskA = await port.getSnapshot('task-a')
    expect(restoredTaskA.selection.connectorIds).toEqual([CONNECTOR_FEISHU_ID])
    expect(
      restoredTaskA.connectors.find(
        (connector) => connector.id === CONNECTOR_FEISHU_ID
      )?.taskSelected
    ).toBe(true)

    const auth = await port.startAuth(CONNECTOR_FEISHU_ID)
    expect(auth.ok).toBe(false)
    if (!auth.ok) {
      expect(auth.error).toBe('fake_runtime')
      expect(auth.message).toMatch(/Fake|侧车|lark-cli/)
      expect(auth.message).not.toMatch(/宿主 OAuth 已/)
    }

    const githubAuth = await port.startAuth('connector.github')
    expect(githubAuth.ok).toBe(false)
    if (!githubAuth.ok) {
      expect(githubAuth.message).toMatch(/GitHub|MCP|平台.*连接服务/)
      expect(githubAuth.message).not.toMatch(/PAT|Client Secret/)
      expect(githubAuth.message).not.toMatch(/lark-cli/)
    }
  })
})
