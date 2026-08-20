import { describe, expect, it, vi } from 'vitest'
import { createHttpBoardPresetCatalog } from './http-board-preset-catalog'

describe('createHttpBoardPresetCatalog', () => {
  it('maps the sidecar preset board catalog', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://sidecar/board/presets')
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer secret',
      )
      return new Response(
        JSON.stringify({
          presetBoards: [
            {
              pluginId: 'query.fixture',
              presetId: 'site-watch',
              version: 1,
              title: '站点值班',
              widgets: [
                {
                  id: 'occupancy',
                  title: '满位',
                  html: '<html></html>',
                  placement: { x: 0, y: 0, w: 6, h: 4 },
                  queryName: 'site_summary',
                  parameters: {},
                  parameterSchema: {
                    siteIds: { type: 'resource', resourceType: 'site' },
                  },
                  requiredPermissions: ['read'],
                  referencableByJob: true,
                  trigger: { kind: 'onOpen' },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      )
    })

    const catalog = createHttpBoardPresetCatalog({
      baseUrl: 'http://sidecar',
      token: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(catalog.listPresetBoards()).resolves.toEqual([
      {
        pluginId: 'query.fixture',
        presetId: 'site-watch',
        version: 1,
        title: '站点值班',
        widgets: [
          {
            id: 'occupancy',
            title: '满位',
            html: '<html></html>',
            placement: { x: 0, y: 0, w: 6, h: 4 },
            queryName: 'site_summary',
            parameters: {},
            parameterSchema: {
              siteIds: { type: 'resource', resourceType: 'site' },
            },
            requiredPermissions: ['read'],
            referencableByJob: true,
            trigger: { kind: 'onOpen' },
          },
        ],
      },
    ])
  })

  it('returns an empty list when the sidecar is down', async () => {
    const catalog = createHttpBoardPresetCatalog({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch,
    })
    await expect(catalog.listPresetBoards()).resolves.toEqual([])
  })
})
