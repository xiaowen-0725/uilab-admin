import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import {
  BUILTIN_MCP_CALENDAR_PLUGIN,
  BUILTIN_MCP_DOCS_PLUGIN,
  BUILTIN_PLUGINS,
} from './builtins.js'
import {
  applyMcpNeedsApproval,
  buildMcpChildEnv,
  forceToolNeedsApproval,
  mergeReadOnlyAllowlist,
  resolveMcpContribution,
} from './mcp-loader.js'
import { createPluginRegistry, formatRegistryMcpStatusLine } from './registry.js'
import { decideToolNeedsApproval } from './security-policy.js'

function docsContrib() {
  return BUILTIN_MCP_DOCS_PLUGIN.contributes!.mcp![0]
}

function calendarContrib() {
  return BUILTIN_MCP_CALENDAR_PLUGIN.contributes!.mcp![0]
}

describe('MCP tool approval (fail-closed)', () => {
  it('requires approval for everything by default', () => {
    const empty = new Set<string>()
    for (const name of [
      'docs_write_document',
      'docs_read_document',
      'list_calendars',
      'calendar_get_and_set_event',
      'docs_mark_as_read',
      'mystery_cloud_action',
    ]) {
      assert.equal(
        decideToolNeedsApproval({ toolName: name, readOnlyAllowlist: empty }),
        true,
      )
    }
  })

  it('frees only exact allowlist names', () => {
    const allow = mergeReadOnlyAllowlist(
      { MCP_READ_ONLY_TOOL_NAMES: 'docs_read_document,list_calendars' },
      [],
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'docs_read_document',
        readOnlyAllowlist: allow,
      }),
      false,
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'list_calendars',
        readOnlyAllowlist: allow,
      }),
      false,
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'docs_read_document_extra',
        readOnlyAllowlist: allow,
      }),
      true,
    )
  })

  it('forceToolNeedsApproval / applyMcpNeedsApproval on real Tools', () => {
    const tool = createTool({
      name: 'docs_write_document',
      description: 'write',
      parameters: z.object({ path: z.string() }),
      execute: async () => ({ ok: true }),
    })
    assert.notEqual(tool.needsApproval, true)
    assert.equal(forceToolNeedsApproval(tool as any).needsApproval, true)

    const read = createTool({
      name: 'docs_read_document',
      description: 'read',
      parameters: z.object({ path: z.string() }),
      execute: async () => ({ ok: true }),
    })
    const write = createTool({
      name: 'docs_write_document',
      description: 'write',
      parameters: z.object({ path: z.string() }),
      execute: async () => ({ ok: true }),
    })
    const out = applyMcpNeedsApproval(
      [read, write] as any,
      new Set(['docs_read_document']),
    )
    assert.notEqual(out[0].needsApproval, true)
    assert.equal(out[1].needsApproval, true)
  })
})

describe('resolveMcpContribution (builtin manifests)', () => {
  it('returns null when env empty', () => {
    assert.equal(
      resolveMcpContribution('mcp.docs', docsContrib(), {}),
      null,
    )
    assert.equal(
      resolveMcpContribution('mcp.calendar', calendarContrib(), {}),
      null,
    )
  })

  it('resolves docs http URL and Feishu alias', () => {
    const a = resolveMcpContribution('mcp.docs', docsContrib(), {
      MCP_DOCS_URL: 'https://mcp.example/docs',
      MCP_DOCS_BEARER_TOKEN: 'tok',
    })
    assert.ok(a)
    assert.equal(a!.transport, 'http')
    assert.equal((a!.server as { url: string }).url, 'https://mcp.example/docs')

    const b = resolveMcpContribution('mcp.docs', docsContrib(), {
      FEISHU_DOCS_MCP_URL: 'https://mcp.example/feishu-docs',
    })
    assert.equal(
      (b!.server as { url: string }).url,
      'https://mcp.example/feishu-docs',
    )
  })

  it('resolves calendar stdio command', () => {
    const c = resolveMcpContribution('mcp.calendar', calendarContrib(), {
      MCP_CALENDAR_COMMAND: 'npx',
      MCP_CALENDAR_ARGS: '-y,@example/calendar-mcp',
    })
    assert.ok(c)
    assert.equal(c!.transport, 'stdio')
    assert.equal((c!.server as { command: string }).command, 'npx')
  })
})

describe('buildMcpChildEnv (connector-scoped)', () => {
  it('does not leak calendar-only secrets into docs child', () => {
    const docsEnv = buildMcpChildEnv(docsContrib(), {
      PATH: '/usr/bin',
      FEISHU_APP_ID: 'app',
      GOOGLE_APPLICATION_CREDENTIALS: '/secret/google.json',
      DEEPSEEK_API_KEY: 'sk-should-never-pass',
    })
    assert.equal(docsEnv.FEISHU_APP_ID, 'app')
    assert.equal(docsEnv.GOOGLE_APPLICATION_CREDENTIALS, undefined)
    assert.equal(docsEnv.DEEPSEEK_API_KEY, undefined)
  })

  it('allows google credentials for calendar only', () => {
    const calEnv = buildMcpChildEnv(calendarContrib(), {
      PATH: '/usr/bin',
      GOOGLE_APPLICATION_CREDENTIALS: '/secret/google.json',
      OPENAI_API_KEY: 'sk-nope',
    })
    assert.equal(
      calEnv.GOOGLE_APPLICATION_CREDENTIALS,
      '/secret/google.json',
    )
    assert.equal(calEnv.OPENAI_API_KEY, undefined)
  })

  it('honors MCP_DOCS_CHILD_ENV_KEYS without granting model keys', () => {
    const docsEnv = buildMcpChildEnv(docsContrib(), {
      PATH: '/bin',
      CUSTOM_DOCS_TOKEN: 'tok',
      MCP_DOCS_CHILD_ENV_KEYS: 'CUSTOM_DOCS_TOKEN,DEEPSEEK_API_KEY,GEMINI_API_KEY',
      DEEPSEEK_API_KEY: 'sk-nope',
      GEMINI_API_KEY: 'gem-nope',
    })
    assert.equal(docsEnv.CUSTOM_DOCS_TOKEN, 'tok')
    assert.equal(docsEnv.DEEPSEEK_API_KEY, undefined)
    assert.equal(docsEnv.GEMINI_API_KEY, undefined)
  })
})

describe('PluginRegistry MCP load', () => {
  it('disabled when no MCP env; both builtins report disabled', async () => {
    const reg = createPluginRegistry({ env: {}, builtins: BUILTIN_PLUGINS })
    const result = await reg.load()
    assert.equal(result.tools.length, 0)
    const mcp = result.mcpStatuses.filter((s) =>
      ['docs', 'calendar'].includes(s.serverId),
    )
    assert.equal(mcp.length, 2)
    assert.ok(mcp.every((s) => s.status === 'disabled'))
    await result.disconnect()
  })

  it('connects via mock host; tools need approval without allowlist', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_CALENDAR_URL: 'https://mcp.example/cal',
      },
      host: {
        getTools: async (servers) => {
          const ids = Object.keys(servers)
          const tools = ids.flatMap((id) => [
            createTool({
              name: `${id}_read_item`,
              description: 'read',
              parameters: z.object({ q: z.string().optional() }),
              execute: async () => ({ ok: true }),
            }),
            createTool({
              name: `${id}_write_item`,
              description: 'write',
              parameters: z.object({ q: z.string().optional() }),
              execute: async () => ({ ok: true }),
            }),
          ]) as any[]
          return { tools, disconnect: async () => {} }
        },
      },
    })
    const result = await reg.load()
    assert.equal(
      result.mcpStatuses.filter((s) => s.status === 'connected').length,
      2,
    )
    assert.ok(result.toolNames.includes('docs_read_item'))
    assert.ok(result.toolNames.includes('calendar_write_item'))
    for (const tool of result.tools) {
      assert.equal(
        (tool as { needsApproval?: boolean }).needsApproval,
        true,
        `expected approval for ${tool.name}`,
      )
    }
    await result.disconnect()
  })

  it('env allowlist frees exact read tool only', async () => {
    const reg = createPluginRegistry({
      env: {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_READ_ONLY_TOOL_NAMES: 'docs_read_item',
      },
      host: {
        getTools: async () => ({
          tools: [
            createTool({
              name: 'docs_read_item',
              description: 'read',
              parameters: z.object({}),
              execute: async () => ({ ok: true }),
            }),
            createTool({
              name: 'docs_write_item',
              description: 'write',
              parameters: z.object({}),
              execute: async () => ({ ok: true }),
            }),
          ] as any[],
          disconnect: async () => {},
        }),
      },
    })
    const result = await reg.load()
    const read = result.tools.find((t) => t.name === 'docs_read_item') as {
      needsApproval?: boolean
    }
    const write = result.tools.find((t) => t.name === 'docs_write_item') as {
      needsApproval?: boolean
    }
    assert.notEqual(read?.needsApproval, true)
    assert.equal(write?.needsApproval, true)
    await result.disconnect()
  })

  it('degrades on host failure without throwing', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_URL: 'https://mcp.example/docs' },
      host: {
        getTools: async () => {
          throw new Error('ECONNREFUSED mock')
        },
      },
    })
    const result = await reg.load()
    assert.equal(result.tools.length, 0)
    const docs = result.mcpStatuses.find((s) => s.serverId === 'docs')
    assert.equal(docs?.status, 'failed')
    assert.match(docs?.reason ?? '', /ECONNREFUSED|连接失败/)
    assert.equal(
      result.mcpStatuses.find((s) => s.serverId === 'calendar')?.status,
      'disabled',
    )
    await result.disconnect()
  })
})

describe('formatRegistryMcpStatusLine', () => {
  it('formats status line for logs', () => {
    const line = formatRegistryMcpStatusLine([
      {
        pluginId: 'mcp.docs',
        serverId: 'docs',
        status: 'connected',
        toolNames: ['a', 'b'],
      },
      {
        pluginId: 'mcp.calendar',
        serverId: 'calendar',
        status: 'failed',
        toolNames: [],
        reason: 'x',
      },
    ])
    assert.equal(line, 'docs=ok(2),calendar=fail')
  })
})
