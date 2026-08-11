/**
 * Fake CapabilitySnapshotPort — honest catalog / selection only.
 * Never fakes Connected state or remote Provider context.
 */
import {
  CONNECTOR_GITHUB_ID,
  CONNECTOR_FEISHU_ID,
  emptyTaskCapabilitySelection,
  EXPERT_OFFICE_MEETING_ID,
  mergeTaskCapabilitySelection,
} from '../model/task-selection'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotPort,
  CapabilitySnapshotListener,
  StartAuthResult,
  TaskCapabilitySelection,
} from '../ports/capability-snapshot-port'

export type FakeCapabilitySnapshotOptions = {
  nowIso?: () => string
}

export function createFakeCapabilitySnapshotPort(
  options: FakeCapabilitySnapshotOptions = {}
): CapabilitySnapshotPort {
  const nowIso = options.nowIso ?? (() => new Date().toISOString())
  const byTask = new Map<string, TaskCapabilitySelection>()
  const listeners = new Set<CapabilitySnapshotListener>()
  let version = 1
  let lastTaskId: string | null = null

  const notify = (snap: CapabilitySnapshot) => {
    for (const l of listeners) l(snap)
  }

  const build = (taskId: string | null): CapabilitySnapshot => {
    const selection = taskId
      ? (byTask.get(taskId) ?? emptyTaskCapabilitySelection())
      : emptyTaskCapabilitySelection()

    return {
      version,
      generatedAt: nowIso(),
      taskId,
      honesty: {
        runtime: 'fake',
        authBoundary: 'provider_declared',
        note: 'Deterministic Fake Capability Surface：可浏览 GitHub MCP 与飞书 CLI 目录；不假登录或远程外呼成功。Connected 需本地 Runtime 侧车。',
      },
      connectors: [
        {
          id: CONNECTOR_GITHUB_ID,
          name: 'GitHub',
          description:
            '通过 GitHub 官方 MCP Server 动态发现仓库协作能力（Fake 目录项）。',
          enabled: false,
          connected: false,
          connectionState: 'unavailable',
          taskSelected: selection.connectorIds.includes(CONNECTOR_GITHUB_ID),
          capabilityEffective: false,
          reasons: ['fake_runtime', 'not_connected'],
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
          packageHint: 'github/github-mcp-server（官方远程服务）',
          loginHint:
            'Fake Runtime 不能连接 GitHub MCP。请切换本地 VoltAgent 侧车，通过平台 UI Lab Connector 一键授权。',
          primaryChannel: 'mcp',
          channelAuth: [
            {
              channel: 'mcp',
              authKind: 'oauth2',
              label: 'GitHub OAuth（官方远程 MCP）',
            },
          ],
          availability: 'fake-catalog-only',
        },
        {
          id: CONNECTOR_FEISHU_ID,
          name: '飞书',
          description:
            '通过官方 lark-* Skills + 通用 Shell 执行原生 lark-cli（Fake 目录项）。',
          enabled: false,
          connected: false,
          connectionState: 'unavailable',
          taskSelected: selection.connectorIds.includes(CONNECTOR_FEISHU_ID),
          capabilityEffective: false,
          reasons: ['fake_runtime', 'not_connected'],
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
          packageHint: '@larksuite/cli@1.0.85',
          loginHint:
            'Fake Runtime 不能完成飞书 CLI 登录。请切换本地 VoltAgent 侧车并运行 lark-cli auth login（不是宿主 OAuth）。',
          primaryChannel: 'domain_cli',
          channelAuth: [
            {
              channel: 'domain_cli',
              authKind: 'cli_session',
              label: 'CLI session（lark-cli）',
            },
          ],
          availability: 'fake-catalog-only',
        },
      ],
      skills: [
        {
          id: 'meeting-notes',
          name: 'meeting-notes',
          taskSelected:
            selection.skillIds.includes('meeting-notes') ||
            selection.expertId === EXPERT_OFFICE_MEETING_ID,
          discoverable: true,
          source: 'catalog',
        },
      ],
      experts: [
        {
          id: EXPERT_OFFICE_MEETING_ID,
          name: '会议纪要专家',
          description: '会议纪要配置包（临时 static catalog / Fake 标签）。',
          taskSelected: selection.expertId === EXPERT_OFFICE_MEETING_ID,
          skills: ['meeting-notes'],
          connectors: [CONNECTOR_FEISHU_ID],
          source: 'static-catalog',
          instruction:
            '你当前以「会议纪要专家」配置包工作：优先结构化会议纪要。Fake 路径不得假装已读取飞书远程内容。',
        },
      ],
      selection: {
        connectorIds: [...selection.connectorIds],
        skillIds: [...selection.skillIds],
        expertId: selection.expertId,
      },
      effectiveToolNames: [],
      effectiveCommandScopes: [],
    }
  }

  return {
    async getSnapshot(taskId) {
      lastTaskId = taskId?.trim() || null
      return build(lastTaskId)
    },

    async setSelection(taskId, patch) {
      const id = taskId.trim()
      const prev = byTask.get(id) ?? emptyTaskCapabilitySelection()
      const next = mergeTaskCapabilitySelection(prev, patch)
      byTask.set(id, next)
      lastTaskId = id
      version += 1
      const snap = build(id)
      notify(snap)
      return snap
    },

    async startAuth(connectorId) {
      const connector = build(lastTaskId).connectors.find(
        (candidate) => candidate.id === connectorId
      )
      const connectorName = connector?.name ?? connectorId
      const result: StartAuthResult = {
        ok: false,
        connectorId,
        error: 'fake_runtime',
        loginHint: connector?.loginHint,
        message: `当前为 Fake Runtime：不能启动「${connectorName}」的真实授权，也不会出现假 Connected。请切换 VITE_RUNTIME_ADAPTER=voltagent。`,
      }
      version += 1
      notify(build(lastTaskId))
      return result
    },

    async refreshAuth(taskId) {
      lastTaskId = taskId?.trim() || lastTaskId
      version += 1
      const snap = build(lastTaskId)
      notify(snap)
      return { snapshot: snap, transitions: [] }
    },

    async revokeAuth(taskId, connectorId) {
      lastTaskId = taskId?.trim() || lastTaskId
      version += 1
      const snap = build(lastTaskId)
      notify(snap)
      return {
        snapshot: snap,
        connectorId,
        message: 'Fake Runtime 没有可撤销的真实账号连接。',
        needsSidecarRestart: false,
      }
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
