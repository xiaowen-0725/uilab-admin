import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyMcpNeedsApproval,
  formatMcpStatusLine,
  isSideEffectMcpToolName,
  loadOfficeMcpTools,
  resolveAllMcpConnectors,
  resolveMcpConnector,
} from './office-mcp.js'

describe('isSideEffectMcpToolName', () => {
  it('marks write/create/delete as side effects', () => {
    assert.equal(isSideEffectMcpToolName('docs_write_document'), true)
    assert.equal(isSideEffectMcpToolName('create_event'), true)
    assert.equal(isSideEffectMcpToolName('calendar_delete_event'), true)
    assert.equal(isSideEffectMcpToolName('update_calendar_event'), true)
  })

  it('keeps read/list/search free', () => {
    assert.equal(isSideEffectMcpToolName('docs_read_document'), false)
    assert.equal(isSideEffectMcpToolName('list_calendars'), false)
    assert.equal(isSideEffectMcpToolName('search_wiki'), false)
    assert.equal(isSideEffectMcpToolName('get_event'), false)
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

  it('connects via host mock and marks write tools for approval', async () => {
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
              {
                name: `${id}_read_item`,
                description: 'read',
              },
              {
                name: `${id}_write_item`,
                description: 'write',
              },
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
    const write = result.tools.find((t) => t.name === 'docs_write_item') as {
      needsApproval?: boolean
    }
    const read = result.tools.find((t) => t.name === 'docs_read_item') as {
      needsApproval?: boolean
    }
    assert.equal(write?.needsApproval, true)
    assert.notEqual(read?.needsApproval, true)
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
    // calendar still reported disabled
    assert.equal(
      result.statuses.find((s) => s.id === 'calendar')?.status,
      'disabled',
    )
    await result.disconnect()
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

  it('applyMcpNeedsApproval is idempotent on free tools', () => {
    const tools = [{ name: 'list_events' }] as any[]
    applyMcpNeedsApproval(tools)
    assert.notEqual(tools[0].needsApproval, true)
  })
})
