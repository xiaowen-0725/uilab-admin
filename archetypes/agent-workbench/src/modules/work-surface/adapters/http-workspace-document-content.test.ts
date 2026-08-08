import { describe, expect, it, vi } from 'vitest'
import { createHttpWorkspaceDocumentContent } from './http-workspace-document-content'

describe('createHttpWorkspaceDocumentContent', () => {
  it('maps 200 body to text', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('hello real workspace\n', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
    )
    const port = createHttpWorkspaceDocumentContent({
      baseUrl: '/voltagent-runtime',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const result = await port.readText('notes/a.md')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toContain('hello real workspace')
    expect(fetchImpl).toHaveBeenCalled()
    const calls = fetchImpl.mock.calls as unknown as [unknown, ...unknown[]][]
    const callArg = calls[0]?.[0]
    const url = typeof callArg === 'string' ? callArg : String(callArg ?? '')
    expect(url).toContain('/workspace/file')
    expect(url).toContain(encodeURIComponent('notes/a.md'))
  })

  it('maps 403 path-escape to permission-denied', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          reason: 'path-escape',
          message: '路径越界',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const port = createHttpWorkspaceDocumentContent({
      baseUrl: 'http://127.0.0.1:3141',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const result = await port.readText('../secret')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('permission-denied')
      expect(result.message).toMatch(/越界|权限/)
    }
  })

  it('maps 404 to not-found', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ reason: 'not-found', message: '文件不存在' }), {
        status: 404,
      }),
    )
    const port = createHttpWorkspaceDocumentContent({
      baseUrl: '/voltagent-runtime',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const readBinary = port.readBinary
    expect(readBinary).toBeTypeOf('function')
    const result = await readBinary!('missing.bin')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-found')
  })

  it('maps network failure to read-failed with sidecar message', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const port = createHttpWorkspaceDocumentContent({
      baseUrl: '/voltagent-runtime',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const result = await port.readText('a.md')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('read-failed')
      expect(result.message).toMatch(/侧车/)
    }
  })
})
