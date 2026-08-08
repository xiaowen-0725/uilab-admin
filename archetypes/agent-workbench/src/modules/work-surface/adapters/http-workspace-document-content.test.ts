import { describe, expect, it, vi } from 'vitest'
import {
  createHttpWorkspaceDocumentContent,
  fetchWorkspaceHint,
} from './http-workspace-document-content'

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

  it('coerces host absolute path before request', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('ok\n', { status: 200 }),
    )
    const port = createHttpWorkspaceDocumentContent({
      baseUrl: '/voltagent-runtime',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await port.readText('/Users/me/ws/output/report.md')
    const callArg = (fetchImpl.mock.calls as unknown as [unknown][])[0]?.[0]
    const url = typeof callArg === 'string' ? callArg : String(callArg ?? '')
    expect(url).toContain(encodeURIComponent('output/report.md'))
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
    // Client-side .. is rejected before fetch; server escape uses valid-looking key.
    const result = await port.readText('notes/secret')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('permission-denied')
      expect(result.message).toMatch(/越界|权限/)
    }
  })

  it('rejects client path escape without fetch', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 200 }))
    const port = createHttpWorkspaceDocumentContent({
      baseUrl: '/voltagent-runtime',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const result = await port.readText('../secret')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('not-found')
      expect(result.message).toMatch(/无效/)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
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

describe('fetchWorkspaceHint', () => {
  it('returns workspaceRoot on success', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          workspaceRoot: '/tmp/office-ws',
          profile: 'office',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const hint = await fetchWorkspaceHint(
      '/voltagent-runtime',
      fetchImpl as unknown as typeof fetch,
    )
    expect(hint).toBe('/tmp/office-ws')
    const callArg = (fetchImpl.mock.calls as unknown as [unknown][])[0]?.[0]
    expect(String(callArg)).toContain('/workspace/info')
  })

  it('returns null when sidecar is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const hint = await fetchWorkspaceHint(
      '/voltagent-runtime',
      fetchImpl as unknown as typeof fetch,
    )
    expect(hint).toBeNull()
  })
})
