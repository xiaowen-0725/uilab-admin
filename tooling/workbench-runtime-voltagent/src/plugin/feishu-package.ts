/**
 * Feishu Builtin Plugin Package (#51).
 *
 * Migrated from the flat BUILTIN_PLUGINS array to the BuiltinPluginPackage
 * seam (#49). The package owns the connector descriptor, CLI session auth,
 * domain CLI skills, brand icon key, and Fake catalog entry. Host core
 * consumes these via generic contracts — no Provider id branching.
 *
 * The manifest content is identical to the former BUILTIN_CLI_FEISHU_PLUGIN;
 * only the registration path changed.
 */
import type { BuiltinPluginPackage } from './plugin-package.js'
import type { PluginManifest } from './manifest.js'

/** Provider-owned stable ids / package contract for the bundled Feishu slice. */
export const CONNECTOR_FEISHU_ID = 'connector.feishu' as const
export const CONNECTOR_FEISHU_PLUGIN_ID = 'cli.feishu' as const
export const CONNECTOR_FEISHU_AUTH_RESOURCE_ID = 'cli:feishu' as const
export const LARK_CLI_PACKAGE = '@larksuite/cli' as const
export const LARK_CLI_PIN = '1.0.85' as const
export const LARK_CLI_COMMAND = 'lark-cli' as const

const FEISHU_PACKAGE_ID = 'feishu'

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

// Re-export env key lists for docs/calendar builtins that still reference them.
export { FEISHU_DOCS_CHILD_ENV, FEISHU_CALENDAR_CHILD_ENV }

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
const FEISHU_MANIFEST: PluginManifest = {
  schemaVersion: 1,
  id: CONNECTOR_FEISHU_PLUGIN_ID,
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
        brandIconKey: FEISHU_PACKAGE_ID,
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
          sessionStateEnv: ['LARKSUITE_CLI_CONFIG_DIR'],
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
          logoutArgv: ['auth', 'logout', '--json'],
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

/** Feishu plugin package — owns connector, CLI auth, skills, brand, Fake catalog. */
export const FEISHU_PLUGIN_PACKAGE: BuiltinPluginPackage = {
  id: FEISHU_PACKAGE_ID,
  brandIconKey: FEISHU_PACKAGE_ID,
  manifests: [FEISHU_MANIFEST],
  fakeCatalog: [
    {
      connectorId: CONNECTOR_FEISHU_ID,
      connectionState: 'missing',
      loginHint: '飞书 CLI：点击连接并完成官方 lark-cli 授权。',
    },
  ],
}

/**
 * Backward-compatible alias — existing tests import this name from builtins.ts.
 * The manifest object identity is unchanged.
 */
export { FEISHU_MANIFEST as BUILTIN_CLI_FEISHU_PLUGIN }
