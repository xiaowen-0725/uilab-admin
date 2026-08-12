import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import {
  discoverLocalPlugins,
  parsePluginManifestJson,
  resolvePluginSearchPaths,
} from './discover.js'
import { createPluginRegistryFromEnv } from './registry.js'
import { BUILTIN_PLUGINS } from './builtins.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

function validPluginJson(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'local.demo',
    name: 'Demo Local',
    version: '0.1.0',
    kind: 'local',
    enabledByDefault: true,
    contributes: {
      mcp: [
        {
          serverId: 'demo',
          urlFromEnv: ['MCP_DEMO_URL'],
        },
      ],
    },
    ...overrides,
  }
}

describe('parsePluginManifestJson', () => {
  it('accepts valid declarative plugin', () => {
    const r = parsePluginManifestJson(validPluginJson(), '/x/plugin.json')
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.manifest.id, 'local.demo')
      assert.equal(r.manifest.kind, 'local')
      assert.equal(r.manifest.contributes?.mcp?.[0]?.serverId, 'demo')
    }
  })

  it('keeps Provider-owned default MCP URL and public tool prefix', () => {
    const r = parsePluginManifestJson(
      validPluginJson({
        contributes: {
          mcp: [
            {
              serverId: 'demo',
              url: 'https://mcp.example/default',
              urlFromEnv: ['MCP_DEMO_URL'],
              toolNamePrefix: 'demo__',
            },
          ],
        },
      }),
      '/x/plugin.json',
    )
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(
        r.manifest.contributes?.mcp?.[0]?.url,
        'https://mcp.example/default',
      )
      assert.equal(r.manifest.contributes?.mcp?.[0]?.toolNamePrefix, 'demo__')
    }
  })

  it('keeps provider-owned connector metadata from plugin.json', () => {
    const r = parsePluginManifestJson(
      validPluginJson({
        contributes: {
          connectors: [
            {
              id: 'connector.demo',
              name: 'Demo',
              description: 'Demo connector',
              authResourceId: 'account',
              authKind: 'oauth2',
              primaryChannel: 'mcp',
              capabilities: [],
              toolScope: ['demo_'],
              availability: 'sidecar',
            },
          ],
        },
      }),
      '/x/plugin.json',
    )
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(
        r.manifest.contributes?.connectors?.[0]?.id,
        'connector.demo',
      )
    }
  })

  it('rejects contributes.tools (no arbitrary JS)', () => {
    const r = parsePluginManifestJson(
      validPluginJson({
        contributes: {
          tools: { module: './evil.js', exportName: 'x' },
        },
      }),
      '/x/plugin.json',
    )
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /tools|JS/)
  })

  it('rejects host installed-Skills sources from external plugin.json', () => {
    const parsed = parsePluginManifestJson(
      {
        schemaVersion: 1,
        id: 'external.skills',
        name: 'External Skills',
        version: '1.0.0',
        contributes: {
          skills: {
            virtualRoot: '/skills',
            installedSource: {
              defaultUserRelativeDir: '.agents/skills',
              includePrefixes: ['lark-'],
              syncStrategy: 'replace-generated',
            },
          },
        },
      },
      '/tmp/external.skills/plugin.json',
    )

    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.match(parsed.reason, /installedSource.*内置插件/)
  })

  it('rejects argv passthrough from external plugin.json', () => {
    const r = parsePluginManifestJson(
      validPluginJson({
        contributes: {
          cli: [
            {
              cliId: 'unsafe',
              command: 'unsafe-cli',
              commands: [
                {
                  name: 'invoke',
                  argv: [],
                  passthroughArgvParam: 'argv',
                  parameters: [{ name: 'argv', type: 'string_array' }],
                },
              ],
            },
          ],
        },
      }),
      '/x/plugin.json',
    )

    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /passthrough|受信 builtin/)
  })

  it('rejects platform-managed OAuth ownership from external plugin.json', () => {
    const r = parsePluginManifestJson(
      validPluginJson({
        contributes: {
          auth: [
            {
              resourceId: 'mcp:demo',
              kind: 'oauth2',
              oauth: {
                strategy: 'managed_broker',
                mcpServerId: 'demo',
                providerId: 'demo',
                brokerBaseUrl: 'https://connectors.example.com',
              },
            },
          ],
        },
      }),
      '/x/plugin.json',
    )

    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /managed_broker.*builtin/)
  })

  it('rejects executable CLI auth flows from external plugin.json', () => {
    const r = parsePluginManifestJson(
      validPluginJson({
        contributes: {
          auth: [
            {
              resourceId: 'cli-session',
              kind: 'cli_session',
              cliSession: {
                strategy: 'device_flow',
                command: 'demo-cli',
                authorization: {
                  startArgv: ['auth', 'login'],
                  completeArgv: ['auth', 'login', '{{deviceCode}}'],
                  verificationUrlHosts: ['example.com'],
                },
              },
            },
          ],
        },
      }),
      '/x/plugin.json',
    )

    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /cliSession.*builtin|受信/)
  })

  it('rejects bad schemaVersion', () => {
    const r = parsePluginManifestJson(
      validPluginJson({ schemaVersion: 99 }),
      '/x/plugin.json',
    )
    assert.equal(r.ok, false)
  })
})

describe('discoverLocalPlugins', () => {
  it('loads plugin.json from a directory and nested packs', async () => {
    const root = await tempDir('wb-plug-disc-')
    const packA = path.join(root, 'pack-a')
    const packB = path.join(root, 'pack-b')
    await mkdir(packA, { recursive: true })
    await mkdir(packB, { recursive: true })
    await writeFile(
      path.join(packA, 'plugin.json'),
      JSON.stringify(validPluginJson({ id: 'local.a', name: 'A' })),
      'utf8',
    )
    await writeFile(
      path.join(packB, 'plugin.json'),
      JSON.stringify(
        validPluginJson({
          id: 'local.b',
          name: 'B',
          contributes: {
            cli: [
              {
                cliId: 'demo',
                command: '/bin/echo',
                commands: [
                  {
                    name: 'ping',
                    argv: ['ping'],
                    readOnly: true,
                    needsApproval: false,
                  },
                ],
              },
            ],
          },
        }),
      ),
      'utf8',
    )

    const result = await discoverLocalPlugins({ paths: [root] })
    assert.equal(result.failures.length, 0)
    assert.deepEqual(result.manifests.map((m) => m.id).sort(), [
      'local.a',
      'local.b',
    ])
  })

  it('isolates invalid JSON; does not throw', async () => {
    const root = await tempDir('wb-plug-bad-')
    const good = path.join(root, 'good')
    const bad = path.join(root, 'bad')
    await mkdir(good, { recursive: true })
    await mkdir(bad, { recursive: true })
    await writeFile(
      path.join(good, 'plugin.json'),
      JSON.stringify(validPluginJson({ id: 'local.good' })),
      'utf8',
    )
    await writeFile(path.join(bad, 'plugin.json'), '{ not json', 'utf8')

    const result = await discoverLocalPlugins({ paths: [root] })
    assert.equal(result.manifests.length, 1)
    assert.equal(result.manifests[0]?.id, 'local.good')
    assert.ok(result.failures.some((f) => /JSON|解析/.test(f.reason)))
  })

  it('rejects id conflict with builtins', async () => {
    const dir = await tempDir('wb-plug-conflict-')
    await writeFile(
      path.join(dir, 'plugin.json'),
      JSON.stringify(validPluginJson({ id: 'mcp.docs', name: 'Hijack' })),
      'utf8',
    )
    const result = await discoverLocalPlugins({
      paths: [dir],
      reservedIds: new Set(['mcp.docs']),
    })
    assert.equal(result.manifests.length, 0)
    assert.ok(result.failures.some((f) => /冲突/.test(f.reason)))
  })
})

describe('createPluginRegistryFromEnv', () => {
  it('loads local MCP contrib via PLUGIN_PATHS without breaking builtins', async () => {
    const dir = await tempDir('wb-plug-reg-')
    await writeFile(
      path.join(dir, 'plugin.json'),
      JSON.stringify(
        validPluginJson({
          id: 'local.extra-mcp',
          enabledByDefault: true,
          contributes: {
            mcp: [{ serverId: 'extra', urlFromEnv: ['MCP_EXTRA_URL'] }],
          },
        }),
      ),
      'utf8',
    )

    const reg = await createPluginRegistryFromEnv({
      env: {
        PLUGIN_PATHS: dir,
        MCP_EXTRA_URL: 'https://mcp.example/extra',
      },
      builtins: BUILTIN_PLUGINS,
      persistAuthBindings: false,
      host: {
        getTools: async (servers) => {
          if (servers.extra) {
            return {
              tools: [
                createTool({
                  name: 'extra_tool',
                  description: 'e',
                  parameters: z.object({}),
                  execute: async () => ({}),
                }),
              ] as any[],
              disconnect: async () => {},
            }
          }
          return { tools: [], disconnect: async () => {} }
        },
      },
    })

    assert.ok(reg.listManifests().some((m) => m.id === 'local.extra-mcp'))
    assert.ok(reg.listManifests().some((m) => m.id === 'mcp.docs'))
    const loaded = await reg.load()
    assert.ok(loaded.toolNames.includes('extra_tool'))
    assert.equal(loaded.discoveryFailures.length, 0)
    // builtins still present even if their MCP is off
    assert.ok(loaded.plugins.some((p) => p.id === 'skills.office'))
    await loaded.disconnect()
  })

  it('discovery failure does not prevent builtin load', async () => {
    const dir = await tempDir('wb-plug-fail-')
    await writeFile(
      path.join(dir, 'plugin.json'),
      '{"schemaVersion":1}',
      'utf8',
    )

    const reg = await createPluginRegistryFromEnv({
      env: { PLUGIN_PATHS: dir },
      builtins: BUILTIN_PLUGINS,
      persistAuthBindings: false,
    })
    const loaded = await reg.load()
    assert.ok(loaded.discoveryFailures.length >= 1)
    assert.ok(loaded.plugins.some((p) => p.id === 'skills.office' && p.enabled))
    await loaded.disconnect()
  })
})

describe('resolvePluginSearchPaths', () => {
  it('parses PLUGIN_PATHS csv', () => {
    const paths = resolvePluginSearchPaths({
      PLUGIN_PATHS: '/a,/b',
    })
    assert.equal(paths.length, 2)
  })
})

describe('BuiltinPluginPackage safety boundary (#49)', () => {
  it('external plugin.json brandIconKey on connector is silently ignored (not resolved as path)', () => {
    const json = validPluginJson({
      id: 'local.demo-brand',
      contributes: {
        connectors: [
          {
            id: 'connector.demo-brand',
            name: 'Brand Demo',
            description: 'd',
            authResourceId: 'account',
            authKind: 'static_bearer',
            primaryChannel: 'mcp',
            availability: 'sidecar',
            toolScope: ['demobrand_'],
            capabilities: [],
            brandIconKey: '../../../etc/passwd',
          },
        ],
        auth: [
          {
            resourceId: 'account',
            kind: 'static_bearer',
            envNames: ['MCP_DEMO_URL'],
          },
        ],
      },
    })
    const r = parsePluginManifestJson(json, '/x/plugin.json')
    assert.equal(r.ok, true)
    if (!r.ok) return
    const connector = r.manifest.contributes?.connectors?.[0]
    // brandIconKey must NOT be parsed from external JSON — it is undefined,
    // proving the sidecar never resolves a file path from an external source.
    assert.equal(connector?.brandIconKey, undefined)
  })

  it('external plugin.json fakeCatalog field is ignored (package-only feature)', () => {
    const json = validPluginJson({
      id: 'local.demo-fake',
      fakeCatalog: [
        {
          connectorId: 'connector.evil',
          connectionState: 'connected',
          loginHint: 'fake connected',
        },
      ],
    })
    const r = parsePluginManifestJson(json, '/x/plugin.json')
    // Parsing succeeds (unknown fields are ignored), but the manifest has
    // no fakeCatalog — that field only exists on BuiltinPluginPackage, not
    // on PluginManifest.
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(
      // @ts-expect-error — fakeCatalog does not exist on PluginManifest
      r.manifest.fakeCatalog,
      undefined,
    )
  })
})
