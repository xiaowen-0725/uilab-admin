/**
 * Deterministic CapabilitySnapshot fixtures for the visual regression matrix (#56).
 *
 * Every snapshot is a pure data literal with a fixed generatedAt, deterministic
 * connector/expert/skill catalog, and NO secrets (no tokens, device codes, or
 * client secrets). The 7 states cover the full CapabilityConnectionState
 * lifecycle + the task-selected dimension.
 *
 * These fixtures are consumed by capability-visual-matrix.test.tsx and
 * capability-keyboard-paths.test.tsx to render each state without a live
 * sidecar, proving the Capability Surface is reproducible from a clean checkout.
 */
import {
  CONNECTOR_FEISHU_ID,
  CONNECTOR_GITHUB_ID,
  type CapabilitySnapshot,
} from '@/modules/capabilities'

const FIXED_GENERATED_AT = '2026-08-11T00:00:00.000Z'

/** Shared honesty block — local sidecar boundary, no Fake runtime claims. */
const HONESTY = {
  runtime: 'local-sidecar' as const,
  authBoundary: 'provider_declared' as const,
  note: '视觉矩阵测试快照：确定性 fixture，不含真实凭证。',
}

/** Shared skill catalog (workspace-seeded lark skills). */
const SKILL_SOURCE_WORKSPACE = 'workspace' as const
const SKILLS: CapabilitySnapshot['skills'] = [
  {
    id: 'lark-doc',
    name: '飞书文档',
    taskSelected: false,
    discoverable: true,
    source: SKILL_SOURCE_WORKSPACE,
  },
  {
    id: 'lark-calendar',
    name: '飞书日历',
    taskSelected: false,
    discoverable: true,
    source: SKILL_SOURCE_WORKSPACE,
  },
]

/** Shared expert catalog. */
const EXPERTS: CapabilitySnapshot['experts'] = [
  {
    id: 'expert.office-meeting',
    name: '会议助理',
    description: '整理会议纪要、提取待办、生成飞书文档。',
    taskSelected: false,
    skills: ['lark-doc', 'lark-calendar'],
    connectors: [CONNECTOR_FEISHU_ID],
    source: 'static-catalog',
  },
]

export type FixedStateKey =
  | 'new-task-default'
  | 'disconnected'
  | 'connected-not-enabled'
  | 'connected-enabled'
  | 'auth-in-progress'
  | 'auth-failed-recovery'
  | 'management-surface'

/** Connector shape helpers (keep field set complete to avoid partial-type drift). */
function feishuConnector(overrides: Partial<CapabilitySnapshot['connectors'][number]>): CapabilitySnapshot['connectors'][number] {
  return {
    id: CONNECTOR_FEISHU_ID,
    name: '飞书',
    description: '通过官方 lark-cli 访问飞书文档、日历与多维表格。',
    enabled: true,
    connected: false,
    connectionState: 'missing',
    taskSelected: false,
    capabilityEffective: false,
    reasons: ['not_connected'],
    capabilities: [
      { id: 'native_cli', name: '原生 CLI / 官方 Skills', available: true, toolNames: [] },
    ],
    toolScope: [],
    commandScopes: ['lark-cli'],
    effectiveToolNames: [],
    effectiveCommandScopes: [],
    loginHint: '运行 lark-cli auth login 完成账号授权。',
    primaryChannel: 'domain_cli',
    channelAuth: [{ channel: 'domain_cli', authKind: 'cli_session', label: 'CLI session（lark-cli）' }],
    availability: 'sidecar',
    brandIconKey: 'feishu',
    ...overrides,
  }
}

function githubConnector(overrides: Partial<CapabilitySnapshot['connectors'][number]>): CapabilitySnapshot['connectors'][number] {
  return {
    id: CONNECTOR_GITHUB_ID,
    name: 'GitHub',
    description: '通过 GitHub 官方 MCP Server 动态发现仓库协作能力。',
    enabled: true,
    connected: false,
    connectionState: 'missing',
    taskSelected: false,
    capabilityEffective: false,
    reasons: ['not_connected'],
    capabilities: [
      { id: 'collaboration', name: '代码托管与协作', available: true, toolNames: [] },
    ],
    toolScope: ['github__'],
    commandScopes: [],
    effectiveToolNames: [],
    effectiveCommandScopes: [],
    loginHint: '点击连接并完成 GitHub OAuth 授权。',
    primaryChannel: 'mcp',
    channelAuth: [{ channel: 'mcp', authKind: 'oauth2', label: 'GitHub OAuth（官方远程 MCP）' }],
    availability: 'sidecar',
    brandIconKey: 'github',
    ...overrides,
  }
}

/**
 * The 7 fixed-state snapshots. Keys are stable identifiers used as filenames
 * for screenshot baselines (tests/visual/baselines/<key>.png).
 */
export const FIXED_STATE_SNAPSHOTS: Record<FixedStateKey, CapabilitySnapshot> = {
  /** State 1: fresh Task, feishu connected but not task-selected, github disconnected. */
  'new-task-default': {
    version: 1,
    generatedAt: FIXED_GENERATED_AT,
    taskId: 'task-fresh',
    honesty: HONESTY,
    connectors: [
      feishuConnector({
        connected: true,
        connectionState: 'connected',
        reasons: ['not_task_selected'],
      }),
      githubConnector({ reasons: ['not_connected'] }),
    ],
    skills: SKILLS,
    experts: EXPERTS,
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  },

  /** State 2: both connectors disconnected (missing). */
  disconnected: {
    version: 1,
    generatedAt: FIXED_GENERATED_AT,
    taskId: 'task-a',
    honesty: HONESTY,
    connectors: [
      feishuConnector({ reasons: ['not_connected'] }),
      githubConnector({ reasons: ['not_connected'] }),
    ],
    skills: SKILLS,
    experts: EXPERTS,
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  },

  /** State 3: both connected at account level, but not task-selected. */
  'connected-not-enabled': {
    version: 1,
    generatedAt: FIXED_GENERATED_AT,
    taskId: 'task-a',
    honesty: HONESTY,
    connectors: [
      feishuConnector({
        connected: true,
        connectionState: 'connected',
        reasons: ['not_task_selected'],
      }),
      githubConnector({
        connected: true,
        connectionState: 'connected',
        reasons: ['not_task_selected'],
      }),
    ],
    skills: SKILLS,
    experts: EXPERTS,
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  },

  /** State 4: both connected AND task-selected (fully effective). */
  'connected-enabled': {
    version: 1,
    generatedAt: FIXED_GENERATED_AT,
    taskId: 'task-a',
    honesty: HONESTY,
    connectors: [
      feishuConnector({
        connected: true,
        connectionState: 'connected',
        taskSelected: true,
        capabilityEffective: true,
        reasons: [],
        effectiveCommandScopes: ['lark-cli'],
      }),
      githubConnector({
        connected: true,
        connectionState: 'connected',
        taskSelected: true,
        capabilityEffective: true,
        reasons: [],
        effectiveToolNames: ['github__search_repositories'],
      }),
    ],
    skills: SKILLS.map((s) => ({ ...s, taskSelected: true })),
    experts: EXPERTS,
    selection: {
      connectorIds: [CONNECTOR_FEISHU_ID, CONNECTOR_GITHUB_ID],
      skillIds: ['lark-doc', 'lark-calendar'],
      expertId: null,
    },
    effectiveToolNames: ['github__search_repositories'],
    effectiveCommandScopes: ['lark-cli'],
  },

  /** State 5: feishu auth in progress (waiting for device authorization). */
  'auth-in-progress': {
    version: 1,
    generatedAt: FIXED_GENERATED_AT,
    taskId: 'task-a',
    honesty: HONESTY,
    connectors: [
      feishuConnector({
        connectionState: 'auth_in_progress',
        reasons: ['auth_in_progress'],
        loginHint: '请在浏览器中完成 lark-cli 授权…',
      }),
      githubConnector({ reasons: ['not_connected'] }),
    ],
    skills: SKILLS,
    experts: EXPERTS,
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  },

  /** State 6: feishu expired, github error — recovery / retry states. */
  'auth-failed-recovery': {
    version: 1,
    generatedAt: FIXED_GENERATED_AT,
    taskId: 'task-a',
    honesty: HONESTY,
    connectors: [
      feishuConnector({
        connectionState: 'expired',
        reasons: ['auth_expired'],
        loginHint: '授权已过期，请重新连接。',
      }),
      githubConnector({
        connectionState: 'error',
        reasons: ['auth_error'],
        loginHint: '连接异常，点击重试。',
      }),
    ],
    skills: SKILLS,
    experts: EXPERTS,
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  },

  /** State 7: global catalog (taskId=null) — Management Surface entry. */
  'management-surface': {
    version: 1,
    generatedAt: FIXED_GENERATED_AT,
    taskId: null,
    honesty: HONESTY,
    connectors: [
      feishuConnector({
        connected: true,
        connectionState: 'connected',
        reasons: [],
      }),
      githubConnector({ reasons: ['not_connected'] }),
    ],
    skills: SKILLS,
    experts: EXPERTS,
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  },
}
