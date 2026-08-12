/**
 * Builtin plugins (MCP / Skills / domain CLI).
 *
 * GitHub has been migrated to the BuiltinPluginPackage seam (#50) — see
 * github-package.ts. Constants and the manifest alias are re-exported here
 * so existing imports from builtins.ts remain valid.
 */

import type { PluginManifest } from './manifest.js'
import {
  projectConnectorDescriptors,
  type ConnectorDescriptor,
} from './connector-descriptor.js'
import {
  BUILTIN_MCP_GITHUB_PLUGIN,
  CONNECTOR_GITHUB_ID,
  CONNECTOR_GITHUB_PLUGIN_ID,
  CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
  GITHUB_MCP_SERVER_ID,
  GITHUB_MCP_REMOTE_URL,
  GITHUB_MCP_TOOL_PREFIX,
  GITHUB_PLUGIN_PACKAGE,
} from './github-package.js'

// Re-export so existing consumers importing from builtins.ts remain valid.
export {
  BUILTIN_MCP_GITHUB_PLUGIN,
  CONNECTOR_GITHUB_ID,
  CONNECTOR_GITHUB_PLUGIN_ID,
  CONNECTOR_GITHUB_AUTH_RESOURCE_ID,
  GITHUB_MCP_SERVER_ID,
  GITHUB_MCP_REMOTE_URL,
  GITHUB_MCP_TOOL_PREFIX,
  GITHUB_PLUGIN_PACKAGE,
}

import {
  BUILTIN_CLI_FEISHU_PLUGIN,
  CONNECTOR_FEISHU_ID,
  CONNECTOR_FEISHU_PLUGIN_ID,
  CONNECTOR_FEISHU_AUTH_RESOURCE_ID,
  LARK_CLI_PACKAGE,
  LARK_CLI_PIN,
  LARK_CLI_COMMAND,
  FEISHU_DOCS_CHILD_ENV,
  FEISHU_CALENDAR_CHILD_ENV,
  FEISHU_PLUGIN_PACKAGE,
} from './feishu-package.js'

// Re-export so existing consumers importing from builtins.ts remain valid.
export {
  BUILTIN_CLI_FEISHU_PLUGIN,
  CONNECTOR_FEISHU_ID,
  CONNECTOR_FEISHU_PLUGIN_ID,
  CONNECTOR_FEISHU_AUTH_RESOURCE_ID,
  LARK_CLI_PACKAGE,
  LARK_CLI_PIN,
  LARK_CLI_COMMAND,
  FEISHU_PLUGIN_PACKAGE,
}

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
 * Default builtin set for Registry. GitHub is owned by GITHUB_PLUGIN_PACKAGE
 * (#50) but its manifest is still included here so createPluginRegistry
 * (without explicit packages) surfaces it. The package adds brandIconKey +
 * fakeCatalog on top via createPluginRegistryFromEnv.
 */
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
