/**
 * GitHub Builtin Plugin Package (#50).
 *
 * Migrated from the flat BUILTIN_PLUGINS array to the BuiltinPluginPackage
 * seam (#49). The package owns the connector descriptor, OAuth Broker
 * contribution, MCP configuration, tool prefix, brand icon key, and Fake
 * catalog entry. Host core consumes these via generic contracts — no
 * Provider id branching.
 *
 * The manifest content is identical to the former BUILTIN_MCP_GITHUB_PLUGIN;
 * only the registration path changed.
 */
import type { BuiltinPluginPackage } from './plugin-package.js'
import type { PluginManifest } from './manifest.js'

/** Provider-owned stable ids for the bundled GitHub MCP connector. */
export const CONNECTOR_GITHUB_ID = 'connector.github' as const
export const CONNECTOR_GITHUB_PLUGIN_ID = 'mcp.github' as const
export const CONNECTOR_GITHUB_AUTH_RESOURCE_ID = 'mcp:github' as const
export const GITHUB_MCP_SERVER_ID = 'github' as const
export const GITHUB_MCP_REMOTE_URL =
  'https://api.githubcopilot.com/mcp/' as const
export const GITHUB_MCP_TOOL_PREFIX = 'github__' as const

const GITHUB_PACKAGE_ID = 'github'

/**
 * GitHub official MCP Server.
 * Product channel is MCP only; it is deliberately separate from cli.feishu.
 * The official remote endpoint uses the platform-owned GitHub App via the
 * managed Connector Broker. End users never configure App credentials or PATs.
 */
const GITHUB_MANIFEST: PluginManifest = {
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
        brandIconKey: GITHUB_PACKAGE_ID,
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

/** GitHub plugin package — owns connector, OAuth, MCP, brand, Fake catalog. */
export const GITHUB_PLUGIN_PACKAGE: BuiltinPluginPackage = {
  id: GITHUB_PACKAGE_ID,
  brandIconKey: GITHUB_PACKAGE_ID,
  manifests: [GITHUB_MANIFEST],
  fakeCatalog: [
    {
      connectorId: CONNECTOR_GITHUB_ID,
      connectionState: 'missing',
      loginHint: 'GitHub MCP：点击连接并通过平台一键授权。',
    },
  ],
}

/**
 * Backward-compatible alias — existing tests import this name from builtins.ts.
 * The manifest object identity is unchanged.
 */
export { GITHUB_MANIFEST as BUILTIN_MCP_GITHUB_PLUGIN }
