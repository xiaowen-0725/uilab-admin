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
    assert.deepEqual(
      result.manifests.map((m) => m.id).sort(),
      ['local.a', 'local.b'],
    )
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
    await writeFile(path.join(dir, 'plugin.json'), '{"schemaVersion":1}', 'utf8')

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
