import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { BUILTIN_PLUGINS } from './builtins.js'
import { createPluginRegistry } from './registry.js'
import type { PluginManifest } from './manifest.js'

describe('createPluginRegistry', () => {
  it('lists builtin manifests without hard-coded connector enum in API', () => {
    const reg = createPluginRegistry({ env: {} })
    const ids = reg.listManifests().map((m) => m.id).sort()
    assert.deepEqual(ids, [
      'cli.feishu',
      'mcp.calendar',
      'mcp.docs',
      'skills.office',
    ])
    assert.ok(reg.resolveEnabledIds().includes('mcp.docs'))
    assert.ok(reg.resolveEnabledIds().includes('skills.office'))
    // domain CLI opt-in
    assert.ok(!reg.resolveEnabledIds().includes('cli.feishu'))
  })

  it('loads disabled MCP when env empty', async () => {
    const reg = createPluginRegistry({ env: {} })
    const result = await reg.load()
    assert.equal(result.tools.length, 0)
    assert.ok(result.mcpStatuses.every((s) => s.status === 'disabled'))
    await result.disconnect()
  })

  it('connects docs via mock host when MCP_DOCS_URL set; tools need approval', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_URL: 'https://mcp.example/docs' },
      host: {
        getTools: async (servers) => {
          assert.ok(servers.docs)
          return {
            tools: [
              createTool({
                name: 'docs_read_item',
                description: 'r',
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              }),
            ] as any[],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    assert.ok(result.toolNames.includes('docs_read_item'))
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'connected',
    )
    assert.equal(
      (result.tools[0] as { needsApproval?: boolean }).needsApproval,
      true,
    )
    // calendar still disabled
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'calendar')?.status,
      'disabled',
    )
    await result.disconnect()
  })

  it('isolates failure: docs fail does not block calendar connect', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_CALENDAR_URL: 'https://mcp.example/cal',
      },
      host: {
        getTools: async (servers) => {
          if (servers.docs) {
            throw new Error('docs down')
          }
          return {
            tools: [
              createTool({
                name: 'cal_list',
                description: 'c',
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              }),
            ] as any[],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'failed',
    )
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'calendar')?.status,
      'connected',
    )
    assert.ok(result.toolNames.includes('cal_list'))
    await result.disconnect()
  })

  it('treats empty tool list as failed', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_URL: 'https://x' },
      host: {
        getTools: async () => ({ tools: [], disconnect: async () => {} }),
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'failed',
    )
    await result.disconnect()
  })

  it('honors FEISHU_DOCS_MCP_URL alias', async () => {
    const reg = createPluginRegistry({
      env: { FEISHU_DOCS_MCP_URL: 'https://feishu.example/mcp' },
      host: {
        getTools: async (servers) => {
          assert.equal(
            (servers.docs as { url?: string }).url,
            'https://feishu.example/mcp',
          )
          return {
            tools: [
              createTool({
                name: 'x',
                description: 'x',
                parameters: z.object({}),
                execute: async () => ({}),
              }),
            ] as any[],
            disconnect: async () => {},
          }
        },
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'docs')?.status,
      'connected',
    )
    await result.disconnect()
  })

  it('PLUGINS_DISABLED skips a builtin', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://x',
        PLUGINS_DISABLED: 'mcp.docs',
      },
      host: {
        getTools: async () => {
          throw new Error('should not load docs')
        },
      },
    })
    assert.ok(!reg.resolveEnabledIds().includes('mcp.docs'))
    const result = await reg.load()
    assert.equal(
      result.plugins.find((p) => p.id === 'mcp.docs')?.enabled,
      false,
    )
    await result.disconnect()
  })

  it('accepts extra manifests without core enum change', async () => {
    const extra: PluginManifest = {
      schemaVersion: 1,
      id: 'mcp.custom',
      name: 'Custom',
      version: '0.0.1',
      kind: 'local',
      enabledByDefault: true,
      contributes: {
        mcp: [
          {
            serverId: 'custom',
            urlFromEnv: ['MCP_CUSTOM_URL'],
          },
        ],
      },
    }
    const reg = createPluginRegistry({
      env: { MCP_CUSTOM_URL: 'https://custom' },
      builtins: BUILTIN_PLUGINS,
      extra: [extra],
      host: {
        getTools: async (servers) => ({
          tools: servers.custom
            ? [
                createTool({
                  name: 'custom_tool',
                  description: 'c',
                  parameters: z.object({}),
                  execute: async () => ({}),
                }),
              ]
            : [],
          disconnect: async () => {},
        }),
      },
    })
    const result = await reg.load()
    assert.ok(result.toolNames.includes('custom_tool'))
    await result.disconnect()
  })
})
