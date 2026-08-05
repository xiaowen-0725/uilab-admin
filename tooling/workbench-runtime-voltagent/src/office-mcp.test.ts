import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTool } from '@voltagent/core'
import { z } from 'zod'
import {
  applyMcpNeedsApproval,
  filterProcessEnvForChild,
  forceToolNeedsApproval,
  formatMcpStatusLine,
  isSideEffectMcpToolName,
  loadOfficeMcpTools,
  resolveAllMcpConnectors,
  resolveMcpConnector,
  resolveMcpReadOnlyAllowlist,
} from './office-mcp.js'

describe('isSideEffectMcpToolName (empty default allowlist)', () => {
  it('requires approval for everything by default', () => {
    assert.equal(isSideEffectMcpToolName('docs_write_document'), true)
    assert.equal(isSideEffectMcpToolName('docs_read_document'), true)
    assert.equal(isSideEffectMcpToolName('list_calendars'), true)
    assert.equal(isSideEffectMcpToolName('calendar_get_and_set_event'), true)
    assert.equal(isSideEffectMcpToolName('docs_mark_as_read'), true)
    assert.equal(isSideEffectMcpToolName('mystery_cloud_action'), true)
  })

  it('frees only exact env allowlist names', () => {
    const allow = resolveMcpReadOnlyAllowlist({
      MCP_READ_ONLY_TOOL_NAMES: 'docs_read_document,list_calendars',
    })
    assert.equal(isSideEffectMcpToolName('docs_read_document', allow), false)
    assert.equal(isSideEffectMcpToolName('list_calendars', allow), false)
    assert.equal(isSideEffectMcpToolName('docs_read_document_extra', allow), true)
    assert.equal(isSideEffectMcpToolName('calendar_get_and_set_event', allow), true)
  })
})

describe('forceToolNeedsApproval on real createTool instances', () => {
  it('sets needsApproval=true on a real Tool', () => {
    const tool = createTool({
      name: 'docs_write_document',
      description: 'write',
      parameters: z.object({ path: z.string() }),
      execute: async () => ({ ok: true }),
    })
    assert.notEqual(tool.needsApproval, true)
    const forced = forceToolNeedsApproval(tool as any)
    assert.equal(forced.needsApproval, true)
    assert.equal(forced.name, 'docs_write_document')
  })

  it('applyMcpNeedsApproval forces real tools not on allowlist', () => {
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
    const allow = new Set(['docs_read_document'])
    const out = applyMcpNeedsApproval([read, write] as any, allow)
    assert.notEqual(out[0].needsApproval, true)
    assert.equal(out[1].needsApproval, true)
  })
})

describe('resolveMcpConnector', () => {
  it('disables when no env', () => {
    assert.equal(resolveMcpConnector('docs', {}), null)
    assert.equal(resolveMcpConnector('calendar', {}), null)
  })

  it('resolves docs http URL (and Feishu alias)', () => {
    const a = resolveMcpConnector('docs', {
      MCP_DOCS_URL: 'https://mcp.example/docs',
      MCP_DOCS_BEARER_TOKEN: 'tok',
    })
    assert.ok(a)
    assert.equal(a!.transport, 'http')
    assert.equal((a!.server as { type: string; url: string }).type, 'http')
    assert.equal((a!.server as { url: string }).url, 'https://mcp.example/docs')

    const b = resolveMcpConnector('docs', {
      FEISHU_DOCS_MCP_URL: 'https://mcp.example/feishu-docs',
    })
    assert.equal((b!.server as { url: string }).url, 'https://mcp.example/feishu-docs')
  })

  it('resolves calendar stdio command', () => {
    const c = resolveMcpConnector('calendar', {
      MCP_CALENDAR_COMMAND: 'npx',
      MCP_CALENDAR_ARGS: '-y,@example/calendar-mcp',
    })
    assert.ok(c)
    assert.equal(c!.transport, 'stdio')
    assert.equal((c!.server as { type: string }).type, 'stdio')
    assert.equal((c!.server as { command: string }).command, 'npx')
  })
})

describe('resolveAllMcpConnectors', () => {
  it('can enable both without conflict', () => {
    const all = resolveAllMcpConnectors({
      MCP_DOCS_URL: 'https://mcp.example/docs',
      MCP_CALENDAR_URL: 'https://mcp.example/cal',
    })
    assert.equal(all.length, 2)
    assert.deepEqual(
      all.map((x) => x.id).sort(),
      ['calendar', 'docs'],
    )
  })
})

describe('loadOfficeMcpTools', () => {
  it('returns disabled statuses and empty tools without config', async () => {
    const result = await loadOfficeMcpTools({})
    assert.equal(result.tools.length, 0)
    assert.equal(result.toolNames.length, 0)
    assert.equal(result.statuses.length, 2)
    assert.ok(result.statuses.every((s) => s.status === 'disabled'))
    await result.disconnect()
  })

  it('connects via host mock; all tools need approval without env allowlist', async () => {
    const result = await loadOfficeMcpTools(
      {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_CALENDAR_URL: 'https://mcp.example/cal',
      },
      {
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
            return {
              tools,
              disconnect: async () => {},
            }
          },
        },
      },
    )

    assert.equal(result.statuses.filter((s) => s.status === 'connected').length, 2)
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
    const result = await loadOfficeMcpTools(
      {
        MCP_DOCS_URL: 'https://mcp.example/docs',
        MCP_READ_ONLY_TOOL_NAMES: 'docs_read_item',
      },
      {
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
      },
    )
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
    const result = await loadOfficeMcpTools(
      { MCP_DOCS_URL: 'https://mcp.example/docs' },
      {
        host: {
          getTools: async () => {
            throw new Error('ECONNREFUSED mock')
          },
        },
      },
    )
    assert.equal(result.tools.length, 0)
    const docs = result.statuses.find((s) => s.id === 'docs')
    assert.equal(docs?.status, 'failed')
    assert.match(docs?.reason ?? '', /ECONNREFUSED|连接失败/)
    assert.equal(
      result.statuses.find((s) => s.id === 'calendar')?.status,
      'disabled',
    )
    await result.disconnect()
  })

  it('treats empty tool list as failed (not ok(0))', async () => {
    const result = await loadOfficeMcpTools(
      { MCP_DOCS_URL: 'https://mcp.example/docs' },
      {
        host: {
          getTools: async () => ({ tools: [], disconnect: async () => {} }),
        },
      },
    )
    assert.equal(result.statuses.find((s) => s.id === 'docs')?.status, 'failed')
    assert.equal(result.tools.length, 0)
    await result.disconnect()
  })
})

describe('filterProcessEnvForChild (connector-scoped)', () => {
  it('does not leak calendar-only secrets into docs child', () => {
    const docsEnv = filterProcessEnvForChild(
      {
        PATH: '/usr/bin',
        FEISHU_APP_ID: 'app',
        GOOGLE_APPLICATION_CREDENTIALS: '/secret/google.json',
        DEEPSEEK_API_KEY: 'sk-should-never-pass',
      },
      'docs',
    )
    assert.ok(docsEnv)
    assert.equal(docsEnv!.FEISHU_APP_ID, 'app')
    assert.equal(docsEnv!.GOOGLE_APPLICATION_CREDENTIALS, undefined)
    assert.equal(docsEnv!.DEEPSEEK_API_KEY, undefined)
  })

  it('allows google credentials for calendar only', () => {
    const calEnv = filterProcessEnvForChild(
      {
        PATH: '/usr/bin',
        GOOGLE_APPLICATION_CREDENTIALS: '/secret/google.json',
        OPENAI_API_KEY: 'sk-nope',
      },
      'calendar',
    )
    assert.ok(calEnv)
    assert.equal(calEnv!.GOOGLE_APPLICATION_CREDENTIALS, '/secret/google.json')
    assert.equal(calEnv!.OPENAI_API_KEY, undefined)
  })

  it('honors MCP_DOCS_CHILD_ENV_KEYS without granting model keys', () => {
    const docsEnv = filterProcessEnvForChild(
      {
        PATH: '/bin',
        CUSTOM_DOCS_TOKEN: 'tok',
        MCP_DOCS_CHILD_ENV_KEYS: 'CUSTOM_DOCS_TOKEN,DEEPSEEK_API_KEY,GEMINI_API_KEY',
        DEEPSEEK_API_KEY: 'sk-nope',
        GEMINI_API_KEY: 'gem-nope',
      },
      'docs',
    )
    assert.equal(docsEnv!.CUSTOM_DOCS_TOKEN, 'tok')
    assert.equal(docsEnv!.DEEPSEEK_API_KEY, undefined)
    assert.equal(docsEnv!.GEMINI_API_KEY, undefined)
  })
})

describe('applyMcpNeedsApproval + formatMcpStatusLine', () => {
  it('formats status line for logs', () => {
    const line = formatMcpStatusLine([
      { id: 'docs', status: 'connected', toolNames: ['a', 'b'] },
      { id: 'calendar', status: 'failed', toolNames: [], reason: 'x' },
    ])
    assert.equal(line, 'docs=ok(2),calendar=fail')
  })
})
