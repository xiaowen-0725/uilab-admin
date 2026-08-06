/**
 * Builtin plugins (MCP / Skills / domain CLI).
 */

import type { PluginManifest } from './manifest.js'

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
        urlFromEnv: [
          'MCP_CALENDAR_URL',
          'FEISHU_CALENDAR_MCP_URL',
        ],
        commandFromEnv: [
          'MCP_CALENDAR_COMMAND',
          'FEISHU_CALENDAR_MCP_COMMAND',
        ],
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
 * Example domain CLI (feishu-cli style). Opt-in: enable via PLUGINS_ENABLED=cli.feishu
 * or set enabledByDefault when operators ship the binary. Missing binary → status missing.
 */
export const BUILTIN_CLI_FEISHU_PLUGIN: PluginManifest = {
  schemaVersion: 1,
  id: 'cli.feishu',
  name: '飞书领域 CLI',
  version: '0.1.0',
  kind: 'builtin',
  enabledByDefault: false,
  contributes: {
    cli: [
      {
        cliId: 'feishu',
        command: 'feishu-cli',
        commandFromEnv: ['FEISHU_CLI_PATH'],
        packageHint: 'feishu-cli',
        childEnvKeys: [
          'FEISHU_APP_ID',
          'FEISHU_APP_SECRET',
          'LARK_APP_ID',
          'LARK_APP_SECRET',
        ],
        defaultCwd: 'workspace',
        commands: [
          {
            name: 'docs_get',
            description: '读取飞书文档（只读示例）',
            argv: ['docs', 'get', '--id', '{{documentId}}'],
            parameters: [
              {
                name: 'documentId',
                type: 'string',
                description: '文档 ID',
                required: true,
              },
            ],
            readOnly: true,
            needsApproval: false,
          },
          {
            name: 'docs_write',
            description: '写入飞书文档（需审批）',
            argv: [
              'docs',
              'write',
              '--id',
              '{{documentId}}',
              '--content',
              '{{content}}',
            ],
            parameters: [
              {
                name: 'documentId',
                type: 'string',
                required: true,
              },
              {
                name: 'content',
                type: 'string',
                required: true,
              },
            ],
            needsApproval: true,
          },
        ],
      },
    ],
    auth: [
      {
        resourceId: 'cli:feishu',
        kind: 'cli_session',
        loginHint: '请先运行 feishu-cli auth login（领域 CLI 自有登录，非宿主 OAuth）',
        statusCommand: {
          command: 'feishu-cli',
          commandFromEnv: ['FEISHU_CLI_PATH'],
          argv: ['auth', 'status'],
          expectExitCode: 0,
        },
      },
    ],
  },
}

/** Default builtin set for Registry. */
export const BUILTIN_PLUGINS: PluginManifest[] = [
  BUILTIN_MCP_DOCS_PLUGIN,
  BUILTIN_MCP_CALENDAR_PLUGIN,
  BUILTIN_SKILLS_OFFICE_PLUGIN,
  BUILTIN_CLI_FEISHU_PLUGIN,
]
