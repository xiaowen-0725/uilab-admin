import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  derivePrimaryChannel,
  expandConnectorToolScope,
  getConnectorDescriptor,
  projectConnectorDescriptors,
} from './connector-descriptor.js'
import {
  BUILTIN_CLI_FEISHU_PLUGIN,
  BUILTIN_CONNECTOR_DESCRIPTORS,
  BUILTIN_MCP_GITHUB_PLUGIN,
  CONNECTOR_FEISHU_DESCRIPTOR,
  CONNECTOR_FEISHU_ID,
  CONNECTOR_FEISHU_PLUGIN_ID,
  CONNECTOR_GITHUB_DESCRIPTOR,
  LARK_CLI_COMMAND,
  LARK_CLI_PACKAGE,
  LARK_CLI_PIN,
} from './builtins.js'
import type { PluginManifest } from './manifest.js'

describe('ConnectorDescriptor catalog', () => {
  it('projects connector metadata from a provider-owned plugin contribution', () => {
    const manifests: PluginManifest[] = [
      {
        schemaVersion: 1,
        id: 'provider.acme',
        name: 'Acme Provider',
        version: '1.0.0',
        kind: 'local',
        contributes: {
          connectors: [
            {
              id: 'connector.acme',
              name: 'Acme',
              description: '由 Acme plugin 声明的外部服务',
              authResourceId: 'account',
              authKind: 'oauth2',
              primaryChannel: 'mcp',
              capabilities: [
                {
                  id: 'records',
                  name: '记录',
                  channel: 'mcp',
                  toolNames: ['acme_list_records'],
                  available: true,
                },
              ],
              toolScope: ['acme_'],
              availability: 'sidecar',
            },
          ],
        },
      },
    ]

    const descriptors = projectConnectorDescriptors(manifests)
    assert.equal(descriptors.length, 1)
    assert.deepEqual(descriptors[0]?.pluginRefs, ['provider.acme'])
    assert.deepEqual(descriptors[0]?.authSummarySource, {
      pluginId: 'provider.acme',
      resourceId: 'account',
      kind: 'oauth2',
    })
    assert.deepEqual(descriptors[0]?.toolScope, ['acme_'])
  })

  it('projects connector.feishu onto cli.feishu packaging (CLI-first)', () => {
    const d = getConnectorDescriptor(
      CONNECTOR_FEISHU_ID,
      BUILTIN_CONNECTOR_DESCRIPTORS,
    )
    assert.ok(d)
    assert.equal(d, CONNECTOR_FEISHU_DESCRIPTOR)
    assert.deepEqual(d.pluginRefs, [CONNECTOR_FEISHU_PLUGIN_ID])
    assert.equal(d.authSummarySource.kind, 'cli_session')
    assert.equal(d.authSummarySource.pluginId, 'cli.feishu')
    assert.equal(d.authSummarySource.resourceId, 'cli:feishu')
    assert.ok(d.capabilities.some((c) => c.id === 'native_cli' && c.available))
    assert.equal(d.primaryChannel, 'domain_cli')
    assert.ok(
      d.channelAuth?.some(
        (r) => r.channel === 'domain_cli' && r.authKind === 'cli_session',
      ),
    )
    assert.ok(!d.channelAuth?.some((r) => r.channel === 'mcp'))
    assert.ok(!d.capabilities.some((c) => c.id === 'docs_mcp'))
    assert.match(d.description, /官方.*Skills.*Shell/)
    assert.deepEqual(d.commandScopes, ['lark-cli'])
    assert.deepEqual(d.toolScope, [])
    assert.match(d.loginHint ?? '', /不是宿主 OAuth/)
    assert.equal(d.packageHint, `${LARK_CLI_PACKAGE}@${LARK_CLI_PIN}`)
  })

  it('projects the two product-facing builtins: GitHub/MCP and Feishu/CLI', () => {
    assert.deepEqual(
      BUILTIN_CONNECTOR_DESCRIPTORS.map((connector) => ({
        id: connector.id,
        pluginRefs: connector.pluginRefs,
        primaryChannel: connector.primaryChannel,
      })),
      [
        {
          id: 'connector.github',
          pluginRefs: ['mcp.github'],
          primaryChannel: 'mcp',
        },
        {
          id: CONNECTOR_FEISHU_ID,
          pluginRefs: [CONNECTOR_FEISHU_PLUGIN_ID],
          primaryChannel: 'domain_cli',
        },
      ],
    )
  })

  it('declares GitHub remote MCP authentication as OAuth-first', () => {
    assert.equal(CONNECTOR_GITHUB_DESCRIPTOR.authSummarySource.kind, 'oauth2')
    assert.ok(
      CONNECTOR_GITHUB_DESCRIPTOR.channelAuth?.some(
        (row) =>
          row.channel === 'mcp' &&
          row.authKind === 'oauth2' &&
          /OAuth/.test(row.label),
      ),
    )
    assert.match(CONNECTOR_GITHUB_DESCRIPTOR.loginHint ?? '', /一键授权/)
    assert.match(CONNECTOR_GITHUB_DESCRIPTOR.loginHint ?? '', /无需/)

    const auth = BUILTIN_MCP_GITHUB_PLUGIN.contributes?.auth?.[0]
    assert.equal(auth?.oauth?.strategy, 'managed_broker')
    assert.equal(auth?.oauth?.providerId, 'github')
    assert.deepEqual(auth?.oauth?.brokerBaseUrlFromEnv, [
      'UILAB_CONNECTOR_BROKER_URL',
    ])
    assert.equal('clientSecretFromEnv' in (auth?.oauth ?? {}), false)
    assert.deepEqual(
      BUILTIN_MCP_GITHUB_PLUGIN.contributes?.mcp?.[0]?.bearerTokenFromEnv,
      [],
    )
  })

  it('expands MCP toolScope prefixes independently of CLI command scopes', () => {
    const names = expandConnectorToolScope(CONNECTOR_GITHUB_DESCRIPTOR, [
      'github__search_repositories',
      'github__get_issue',
      'mcp.docs.something',
    ])
    assert.deepEqual(names, [
      'github__get_issue',
      'github__search_repositories',
    ])
  })
})

describe('derivePrimaryChannel', () => {
  it('returns hybrid when multiple available channels', () => {
    assert.equal(
      derivePrimaryChannel([
        {
          id: 'a',
          name: 'a',
          channel: 'domain_cli',
          toolNames: [],
          available: true,
        },
        {
          id: 'b',
          name: 'b',
          channel: 'mcp',
          toolNames: [],
          available: true,
        },
      ]),
      'hybrid',
    )
  })
})

describe('cli.feishu builtin aligns to official lark-cli', () => {
  it('contributes auth, official Skills metadata, and a Shell command scope without Runtime tools', () => {
    const p = BUILTIN_CLI_FEISHU_PLUGIN
    assert.equal(p.id, 'cli.feishu')
    assert.deepEqual(p.contributes?.cli, undefined)
    assert.deepEqual(p.contributes?.skills?.installedSource, {
      rootFromEnv: ['FEISHU_SKILLS_ROOT'],
      defaultUserRelativeDir: '.agents/skills',
      includePrefixes: ['lark-'],
      syncStrategy: 'replace-generated',
    })

    const auth = p.contributes?.auth?.[0]
    assert.ok(auth)
    assert.equal(auth.kind, 'cli_session')
    assert.equal(auth.resourceId, 'cli:feishu')
    assert.equal(auth.statusCommand?.command, LARK_CLI_COMMAND)
    assert.deepEqual(auth.statusCommand?.argv, [
      'auth',
      'status',
      '--json',
      '--verify',
    ])
    assert.deepEqual(auth.statusCommand?.connectedWhen, {
      jsonPath: ['identities', 'user', 'available'],
      equals: true,
    })
    assert.equal(auth.cliSession?.minimumVersion, '1.0.85')
    assert.deepEqual(auth.cliSession?.bootstrap?.argv, [
      'config',
      'init',
      '--new',
      '--brand',
      'feishu',
    ])
    assert.deepEqual(auth.cliSession?.authorization.completeArgv, [
      'auth',
      'login',
      '--device-code',
      '{{deviceCode}}',
      '--json',
    ])
    assert.match(auth.loginHint ?? '', /点击「连接」/)

    const connector = p.contributes?.connectors?.[0]
    assert.ok(connector)
    assert.equal(connector.id, CONNECTOR_FEISHU_ID)
    assert.deepEqual(connector.toolScope, [])
    assert.deepEqual(connector.commandScopes, [LARK_CLI_COMMAND])
    assert.deepEqual(
      connector.capabilities.find((c) => c.id === 'native_cli')?.toolNames,
      [],
    )
  })
})
