import { describe, expect, it, vi } from 'vitest'
import { createHttpInteractiveArtifactContent } from './http-interactive-artifact-content'

const HTML =
  '<!doctype html><html><body><table><tr><td>可筛选</td></tr></table></body></html>'

describe('createHttpInteractiveArtifactContent', () => {
  it('pulls a ready draft from /interactive/staging, not /board/staging', async () => {
    let requestInit: RequestInit | undefined
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      requestInit = init
      expect(url).toBe('/voltagent-runtime/interactive/staging/d-1/content')
      expect(url).not.toContain('/board/')
      return new Response(HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Hash': 'abc123',
          'X-Byte-Length': String(HTML.length),
          'X-Draft-Title': encodeURIComponent('筛选表'),
        },
      })
    })
    const port = createHttpInteractiveArtifactContent({
      baseUrl: '/voltagent-runtime',
      token: 'sidecar-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const result = await port.pullReady('d-1')
    expect(result).toEqual({
      ok: true,
      content: HTML,
      hash: 'abc123',
      bytes: HTML.length,
      title: '筛选表',
    })
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer sidecar-token',
    })
  })

  it('maps 401 / 404 / 410 without leaking HTML', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: 'not_authorized', hint: '缺凭据' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const port = createHttpInteractiveArtifactContent({
      baseUrl: 'http://127.0.0.1:3141',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const denied = await port.pullReady('d-1')
    expect(denied).toMatchObject({ ok: false, error: 'not_authorized' })
    expect(JSON.stringify(denied)).not.toContain('<html')
  })

  it('maps network failure to runtime_unavailable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const port = createHttpInteractiveArtifactContent({
      baseUrl: '/voltagent-runtime',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const result = await port.pullReady('d-1')
    expect(result).toMatchObject({
      ok: false,
      error: 'runtime_unavailable',
    })
  })
})
