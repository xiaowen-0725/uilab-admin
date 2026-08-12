/**
 * Demo Builtin Plugin Package (#49).
 *
 * A self-contained demonstration package that registers a connector, auth
 * resource, MCP execution channel, brand icon key, and Fake catalog entry —
 * entirely through the package contribution seam, without Host branching on
 * Provider id.
 *
 * Enabled via PLUGINS_ENABLED=mcp.demo. Default off to avoid affecting the
 * production connector catalog.
 */
import type { BuiltinPluginPackage } from './plugin-package.js'
import type { PluginManifest } from './manifest.js'

const DEMO_PLUGIN_ID = 'mcp.demo'
const DEMO_CONNECTOR_ID = 'connector.demo'
const DEMO_AUTH_RESOURCE_ID = 'mcp:demo'
const DEMO_MCP_SERVER_ID = 'demo'
const DEMO_TOOL_PREFIX = 'demo__'

const DEMO_MANIFEST: PluginManifest = {
  schemaVersion: 1,
  id: DEMO_PLUGIN_ID,
  name: '示例 MCP 连接器',
  version: '0.1.0',
  kind: 'builtin',
  enabledByDefault: false,
  contributes: {
    connectors: [
      {
        id: DEMO_CONNECTOR_ID,
        name: '示例服务',
        description: '通过 Builtin Plugin Package 接缝注册的演示连接器。',
        authResourceId: DEMO_AUTH_RESOURCE_ID,
        authKind: 'static_bearer',
        primaryChannel: 'mcp',
        brandIconKey: 'demo.example',
        availability: 'sidecar',
        toolScope: [DEMO_TOOL_PREFIX],
        capabilities: [
          {
            id: 'demo',
            name: '演示能力',
            description: '具体工具由 MCP tools/list 动态发现',
            channel: 'mcp',
            available: true,
            toolNames: [],
          },
        ],
        channelAuth: [
          {
            channel: 'mcp',
            authKind: 'static_bearer',
            label: 'Static Bearer（环境变量）',
          },
        ],
        packageHint: 'demo/example-mcp-server（演示用）',
        loginHint: '设置 DEMO_MCP_URL 和 DEMO_MCP_TOKEN 环境变量以启用。',
      },
    ],
    mcp: [
      {
        serverId: DEMO_MCP_SERVER_ID,
        urlFromEnv: ['DEMO_MCP_URL'],
        bearerTokenFromEnv: ['DEMO_MCP_TOKEN'],
        toolNamePrefix: DEMO_TOOL_PREFIX,
      },
    ],
    auth: [
      {
        resourceId: DEMO_AUTH_RESOURCE_ID,
        kind: 'static_bearer',
        envNames: ['DEMO_MCP_TOKEN'],
        loginHint: '设置 DEMO_MCP_TOKEN 环境变量以启用演示连接器。',
      },
    ],
  },
}

/** Demo package — validates the BuiltinPluginPackage seam end-to-end. */
export const DEMO_EXAMPLE_PACKAGE: BuiltinPluginPackage = {
  id: 'demo.example',
  brandIconKey: 'demo.example',
  manifests: [DEMO_MANIFEST],
  fakeCatalog: [
    {
      connectorId: DEMO_CONNECTOR_ID,
      connectionState: 'missing',
      loginHint: '演示连接器：设置 DEMO_MCP_URL 和 DEMO_MCP_TOKEN 以连接。',
    },
  ],
}
