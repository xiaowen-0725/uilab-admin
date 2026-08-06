/**
 * Builtin plugins (ticket #19).
 * docs/calendar MCP env aliases preserved for operator compatibility.
 */

import type { PluginManifest } from './manifest.js'

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
  },
}

/** Default builtin set for Registry (MCP cutover). */
export const BUILTIN_PLUGINS: PluginManifest[] = [
  BUILTIN_MCP_DOCS_PLUGIN,
  BUILTIN_MCP_CALENDAR_PLUGIN,
]
