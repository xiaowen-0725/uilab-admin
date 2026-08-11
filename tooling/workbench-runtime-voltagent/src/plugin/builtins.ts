/**
 * Builtin plugins (MCP / Skills / domain CLI).
 */

import type { PluginManifest } from './manifest.js'
import {
  projectConnectorDescriptors,
  type ConnectorDescriptor,
} from './connector-descriptor.js'

/** Provider-owned stable ids for the bundled GitHub MCP connector. */
export const CONNECTOR_GITHUB_ID = 'connector.github' as const
export const CONNECTOR_GITHUB_PLUGIN_ID = 'mcp.github' as const
export const CONNECTOR_GITHUB_AUTH_RESOURCE_ID = 'mcp:github' as const
export const GITHUB_MCP_SERVER_ID = 'github' as const
export const GITHUB_MCP_REMOTE_URL =
  'https://api.githubcopilot.com/mcp/' as const
export const GITHUB_MCP_TOOL_PREFIX = 'github__' as const

/** Provider-owned stable ids / package contract for the bundled Feishu slice. */
export const CONNECTOR_FEISHU_ID = 'connector.feishu' as const
export const CONNECTOR_FEISHU_PLUGIN_ID = 'cli.feishu' as const
export const CONNECTOR_FEISHU_AUTH_RESOURCE_ID = 'cli:feishu' as const
export const LARK_CLI_PACKAGE = '@larksuite/cli' as const
export const LARK_CLI_PIN = '1.0.85' as const
export const LARK_CLI_COMMAND = 'lark-cli' as const

/** Office O3 skill folder ids (deliverable paths stay under /output/*). */
export const OFFICE_BUILTIN_SKILL_IDS = [
  'meeting-notes',
  'weekly-report',
  'research-brief',
] as const

export const OFFICE_BUILTIN_OUTPUT_DIRS = [
  'output/meeting-notes',
  'output/weekly-report',
  'output/research-brief',
] as const

const FEISHU_DOCS_CHILD_ENV = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'LARK_APP_ID',
  'LARK_APP_SECRET',
  'FEISHU_DOCS_APP_ID',
  'FEISHU_DOCS_APP_SECRET',
]

const FEISHU_CALENDAR_CHILD_ENV = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'LARK_APP_ID',
  'LARK_APP_SECRET',
  'FEISHU_CALENDAR_APP_ID',
  'FEISHU_CALENDAR_APP_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CALENDAR_ID',
]

/**
 * GitHub official MCP Server.
 * Product channel is MCP only; it is deliberately separate from cli.feishu.
 * The official remote endpoint uses the platform-owned GitHub App via the
 * managed Connector Broker. End users never configure App credentials or PATs.
 */
export const BUILTIN_MCP_GITHUB_PLUGIN: PluginManifest = {
  schemaVersion: 1,
  id: CONNECTOR_GITHUB_PLUGIN_ID,
  name: 'GitHub MCP',
  version: '0.2.0',
  kind: 'builtin',
  enabledByDefault: true,
  contributes: {
    connectors: [
      {
        id: CONNECTOR_GITHUB_ID,
        name: 'GitHub',
        description:
          '通过 GitHub 官方 MCP Server 动态发现仓库、Issue 与 Pull Request 等能力。',
        authResourceId: CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
        authKind: 'oauth2',
        primaryChannel: 'mcp',
        capabilities: [
          {
            id: 'collaboration',
            name: '代码托管与协作',
            description: '具体工具由官方 MCP tools/list 动态发现',
            channel: 'mcp',
            toolNames: [],
            available: true,
          },
        ],
        channelAuth: [
          {
            channel: 'mcp',
            authKind: 'oauth2',
            resourceId: CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
            label: 'GitHub OAuth（官方远程 MCP）',
          },
        ],
        toolScope: [GITHUB_MCP_TOOL_PREFIX],
        availability: 'sidecar',
        packageHint: 'github/github-mcp-server（官方远程服务）',
        loginHint:
          '点击「连接」一键授权 UI Lab Connector；无需创建 GitHub App、填写 PAT 或配置 Client Secret。',
      },
    ],
    mcp: [
      {
        serverId: GITHUB_MCP_SERVER_ID,
        url: GITHUB_MCP_REMOTE_URL,
        urlFromEnv: ['MCP_GITHUB_URL'],
        bearerTokenFromEnv: [],
        toolNamePrefix: GITHUB_MCP_TOOL_PREFIX,
      },
    ],
    auth: [
      {
        resourceId: CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
        kind: 'oauth2',
        oauth: {
          strategy: 'managed_broker',
          mcpServerId: GITHUB_MCP_SERVER_ID,
          providerId: 'github',
          brokerBaseUrlFromEnv: ['UILAB_CONNECTOR_BROKER_URL'],
        },
        loginHint:
          '点击 Workbench 的 GitHub「连接」一键授权 UI Lab Connector；Provider Client Secret 只存在于平台连接服务。',
      },
    ],
  },
}

/** MCP docs / knowledge connector (env-gated). */
export const BUILTIN_MCP_DOCS_PLUGIN: PluginManifest = {
  schemaVersion: 1,
  id: 'mcp.docs',
  name: '文档/知识库 MCP',
  version: '0.1.0',
  kind: 'builtin',
  enabledByDefault: true,
  contributes: {
    mcp: [
      {
        serverId: 'docs',
        urlFromEnv: ['MCP_DOCS_URL', 'FEISHU_DOCS_MCP_URL'],
        commandFromEnv: ['MCP_DOCS_COMMAND', 'FEISHU_DOCS_MCP_COMMAND'],
        argsFromEnv: ['MCP_DOCS_ARGS'],
        bearerTokenFromEnv: [
          'MCP_DOCS_BEARER_TOKEN',
          'MCP_DOCS_TOKEN',
          'MCP_BEARER_TOKEN',
        ],
        childEnvKeys: FEISHU_DOCS_CHILD_ENV,
      },
    ],
    // enable ≠ login: plugin may load without bearer; doctor shows auth=missing until set
    auth: [
      {
        resourceId: 'bearer',
        kind: 'static_bearer',
        envNames: [
          'MCP_DOCS_BEARER_TOKEN',
          'MCP_DOCS_TOKEN',
          'MCP_BEARER_TOKEN',
        ],
        loginHint:
          '配置 MCP_DOCS_BEARER_TOKEN（或 MCP_DOCS_TOKEN / MCP_BEARER_TOKEN）到侧车 .env；勿提交仓库',
      },
    ],
  },
}

/** MCP calendar connector (env-gated). */
export const BUILTIN_MCP_CALENDAR_PLUGIN: PluginManifest = {
  schemaVersion: 1,
  id: 'mcp.calendar',
  name: '日历 MCP',
  version: '0.1.0',
  kind: 'builtin',
  enabledByDefault: true,
  contributes: {
    mcp: [
      {
        serverId: 'calendar',
        urlFromEnv: ['MCP_CALENDAR_URL', 'FEISHU_CALENDAR_MCP_URL'],
        commandFromEnv: ['MCP_CALENDAR_COMMAND', 'FEISHU_CALENDAR_MCP_COMMAND'],
        argsFromEnv: ['MCP_CALENDAR_ARGS'],
        bearerTokenFromEnv: [
          'MCP_CALENDAR_BEARER_TOKEN',
          'MCP_CALENDAR_TOKEN',
          'MCP_BEARER_TOKEN',
        ],
        childEnvKeys: FEISHU_CALENDAR_CHILD_ENV,
      },
    ],
    auth: [
      {
        resourceId: 'bearer',
        kind: 'static_bearer',
        envNames: [
          'MCP_CALENDAR_BEARER_TOKEN',
          'MCP_CALENDAR_TOKEN',
          'MCP_BEARER_TOKEN',
        ],
        loginHint:
          '配置 MCP_CALENDAR_BEARER_TOKEN（或 MCP_CALENDAR_TOKEN / MCP_BEARER_TOKEN）到侧车 .env；勿提交仓库',
      },
    ],
  },
}

/**
 * Office workspace skills (meeting-notes / weekly-report / research-brief).
 * Seed is missing-only; never overwrites user SKILL.md.
 */
export const BUILTIN_SKILLS_OFFICE_PLUGIN: PluginManifest = {
  schemaVersion: 1,
  id: 'skills.office',
  name: '办公 Skills',
  version: '0.1.0',
  kind: 'builtin',
  enabledByDefault: true,
  contributes: {
    skills: {
      virtualRoot: '/skills',
      workspaceDir: 'skills',
      skillIds: [...OFFICE_BUILTIN_SKILL_IDS],
      bundledRelativeDir: 'bundled-skills',
      outputDirs: [...OFFICE_BUILTIN_OUTPUT_DIRS],
      seedStrategy: 'missing-only',
    },
  },
}

/**
 * Feishu Provider contribution (official lark-cli / @larksuite/cli).
 * Enabled by default because this package pins and ships the compatible CLI.
 * Operators may still disable it with PLUGINS_DISABLED=cli.feishu.
 *
 * Provider-owned contribution: product connector.feishu metadata and the
 * `lark-cli` executable scope live here, not in Connector core. The Agent reads
 * installed official lark-* Skills and invokes the native binary through the
 * generic Workspace Shell. No Feishu business command is wrapped as a Runtime
 * tool.
 * Connected = cli_session via `lark-cli auth status` — NOT host OAuth inject.
 * Pin guidance: @larksuite/cli@1.0.85 (bin: lark-cli). Override path with FEISHU_CLI_PATH.
 */
export const BUILTIN_CLI_FEISHU_PLUGIN: PluginManifest = {
  schemaVersion: 1,
  id: 'cli.feishu',
  name: '飞书领域 CLI',
  version: '0.5.0',
  kind: 'builtin',
  enabledByDefault: true,
  contributes: {
    skills: {
      virtualRoot: '/.runtime-skills/feishu',
      workspaceDir: '.runtime-skills/feishu',
      installedSource: {
        rootFromEnv: ['FEISHU_SKILLS_ROOT'],
        defaultUserRelativeDir: '.agents/skills',
        includePrefixes: ['lark-'],
        syncStrategy: 'replace-generated',
      },
    },
    connectors: [
      {
        id: CONNECTOR_FEISHU_ID,
        name: '飞书',
        description:
          '官方 lark-* Skills + 通用 Workspace Shell 执行原生 lark-cli；不再封装飞书业务工具。',
        authResourceId: CONNECTOR_FEISHU_AUTH_RESOURCE_ID,
        authKind: 'cli_session',
        primaryChannel: 'domain_cli',
        capabilities: [
          {
            id: 'native_cli',
            name: '原生 CLI / 官方 Skills',
            description:
              '读取已安装的官方 lark-* Skills，再通过通用 execute_command 执行原生 lark-cli；所有 Shell 调用均需 Host 审批',
            channel: 'domain_cli',
            toolNames: [],
            available: true,
          },
        ],
        channelAuth: [
          {
            channel: 'domain_cli',
            authKind: 'cli_session',
            resourceId: CONNECTOR_FEISHU_AUTH_RESOURCE_ID,
            label: 'CLI session（lark-cli）',
          },
        ],
        commandScopes: [LARK_CLI_COMMAND],
        toolScope: [],
        availability: 'sidecar',
        packageHint: `${LARK_CLI_PACKAGE}@${LARK_CLI_PIN}`,
        loginHint:
          '点击「连接」一键启动官方 lark-cli 授权；首次会先配置 CLI 应用，再授权飞书账号。这是 CLI session，不是宿主 OAuth，无需手工安装或粘贴凭据。',
      },
    ],
    auth: [
      {
        resourceId: CONNECTOR_FEISHU_AUTH_RESOURCE_ID,
        kind: 'cli_session',
        cliSession: {
          strategy: 'device_flow',
          command: LARK_CLI_COMMAND,
          commandFromEnv: ['FEISHU_CLI_PATH'],
          childEnvKeys: [
            'USER',
            'TMPDIR',
            'HTTP_PROXY',
            'HTTPS_PROXY',
            'NO_PROXY',
            'http_proxy',
            'https_proxy',
            'no_proxy',
            'LARKSUITE_CLI_CONFIG_DIR',
            'LARKSUITE_CLI_PROFILE',
            'LARKSUITE_CLI_PROXY_ENABLE',
            'LARKSUITE_CLI_PROXY_ADDRESS',
            'LARKSUITE_CLI_CA_PATH',
          ],
          minimumVersion: LARK_CLI_PIN,
          versionArgv: ['--version'],
          bootstrap: {
            whenErrorSubtypes: ['not_configured'],
            argv: ['config', 'init', '--new', '--brand', 'feishu'],
            verificationUrlHosts: ['open.feishu.cn', 'open.larksuite.com'],
            timeoutMs: 10 * 60_000,
          },
          authorization: {
            startArgv: ['auth', 'login', '--no-wait', '--json'],
            completeArgv: [
              'auth',
              'login',
              '--device-code',
              '{{deviceCode}}',
              '--json',
            ],
            verificationUrlHosts: [
              'accounts.feishu.cn',
              'accounts.larksuite.com',
              'open.feishu.cn',
              'open.larksuite.com',
            ],
            defaultDomains: ['docs'],
            domainFlag: '--domain',
            timeoutMs: 10 * 60_000,
          },
        },
        loginHint:
          '点击「连接」后先完成 CLI 应用配置（仅首次），再授权飞书账号；凭据由官方 lark-cli 自己保存，宿主不接触 device_code 或 token。',
        statusCommand: {
          command: LARK_CLI_COMMAND,
          commandFromEnv: ['FEISHU_CLI_PATH'],
          argv: ['auth', 'status', '--json', '--verify'],
          expectExitCode: 0,
          connectedWhen: {
            jsonPath: ['identities', 'user', 'available'],
            equals: true,
          },
        },
      },
    ],
  },
}

/** Default builtin set for Registry. */
export const BUILTIN_PLUGINS: PluginManifest[] = [
  BUILTIN_MCP_GITHUB_PLUGIN,
  BUILTIN_MCP_DOCS_PLUGIN,
  BUILTIN_MCP_CALENDAR_PLUGIN,
  BUILTIN_SKILLS_OFFICE_PLUGIN,
  BUILTIN_CLI_FEISHU_PLUGIN,
]

/** Product catalog is projected from Provider-owned contributions. */
export const BUILTIN_CONNECTOR_DESCRIPTORS: readonly ConnectorDescriptor[] =
  projectConnectorDescriptors(BUILTIN_PLUGINS)

function requireBuiltinConnector(id: string): ConnectorDescriptor {
  const descriptor = BUILTIN_CONNECTOR_DESCRIPTORS.find(
    (connector) => connector.id === id,
  )
  if (!descriptor) {
    throw new Error(`builtin 缺少 Connector contribution：${id}`)
  }
  return descriptor
}

export const CONNECTOR_FEISHU_DESCRIPTOR: ConnectorDescriptor =
  requireBuiltinConnector(CONNECTOR_FEISHU_ID)

export const CONNECTOR_GITHUB_DESCRIPTOR: ConnectorDescriptor =
  requireBuiltinConnector(CONNECTOR_GITHUB_ID)
