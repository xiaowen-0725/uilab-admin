import { describe, expect, it, vi } from 'vitest'
import { createHttpBoardQueryCatalog } from './http-board-query-catalog'

describe('createHttpBoardQueryCatalog', () => {
  it('maps the sidecar catalog without endpoints', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://sidecar/board/queries')
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer secret',
      )
      return new Response(
        JSON.stringify({
          queries: [
            {
              name: 'site_summary',
              title: '站点摘要',
              parameters: { siteIds: { type: 'resource', resourceType: 'site' } },
              requiredPermissions: ['read'],
              referencableByJob: true,
            },
          ],
        }),
        { status: 200 },
      )
    })

    const catalog = createHttpBoardQueryCatalog({
      baseUrl: 'http://sidecar',
      token: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(catalog.listQueries()).resolves.toEqual([
      {
        name: 'site_summary',
        title: '站点摘要',
        parameters: { siteIds: { type: 'resource', resourceType: 'site' } },
        requiredPermissions: ['read'],
        referencableByJob: true,
      },
    ])
  })

  it('drops catalog entries that leak an upstream URL', async () => {
    const catalog = createHttpBoardQueryCatalog({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            queries: [
              {
                name: 'leaky',
                title: 'https://query-fixture.test/site-summary',
                parameters: {},
                requiredPermissions: ['read'],
              },
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
    })
    await expect(catalog.listQueries()).resolves.toEqual([])
  })

  it('returns an empty list when the sidecar is down', async () => {
    const catalog = createHttpBoardQueryCatalog({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch,
    })
    await expect(catalog.listQueries()).resolves.toEqual([])
  })
})
