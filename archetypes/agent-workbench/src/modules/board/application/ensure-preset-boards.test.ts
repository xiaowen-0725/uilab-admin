import { describe, expect, it } from 'vitest'
import { createMemoryIdentityScope } from '@/modules/identity'
import { createMemoryBoardJobRuntime } from '../adapters/memory-board-job-runtime'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import { EXAMPLE_PRESETS } from '../fixtures/example-presets'
import { presetWidgetId } from '../model/preset-board'
import {
  IDENTITY_INCOMPLETE_BINDING,
  anonymousIdentitySnapshot,
  resolveWidgetRenderState,
} from '../model/widget-render-state'
import type { BoardPresetCatalogEntry } from '../ports/board-preset-catalog-port'
import { createBoardRefreshController } from './board-refresh'
import { ensureExampleBoards } from './ensure-example-boards'
import { ensurePresetBoards } from './ensure-preset-boards'

const NOW = '2026-08-20T00:00:00.000Z'
const HTML =
  '<!doctype html><html><body><script>widget.ready()</script></body></html>'

function siteWatch(): BoardPresetCatalogEntry {
  return {
    pluginId: 'query.fixture',
    presetId: 'site-watch',
    version: 1,
    title: '站点值班',
    purpose: '盯站点摘要',
    widgets: [
      {
        id: 'occupancy',
        title: '满位',
        html: HTML,
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
  }
}

function catalogOf(
  entries: readonly BoardPresetCatalogEntry[],
): { listPresetBoards: () => Promise<readonly BoardPresetCatalogEntry[]> } {
  return { listPresetBoards: async () => entries }
}

describe('ensurePresetBoards', () => {
  it('installs a plugin preset board with a query source and empty resource params', async () => {
    const store = createMemoryBoardStore()
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)

    const boards = await store.listBoards()
    expect(boards).toHaveLength(1)
    expect(boards[0]).toMatchObject({
      id: 'preset:site-watch',
      title: '站点值班',
      isExample: false,
      presetId: 'site-watch',
      presetVersion: 1,
    })
    const widgetId = 'preset:site-watch:occupancy'
    expect(await store.getWidget(widgetId)).toMatchObject({
      title: '满位',
      html: HTML,
    })
    expect(await store.getDataSourceByWidgetId(widgetId)).toMatchObject({
      kind: 'query',
      queryName: 'site_summary',
      parameters: {},
      requiredPermissions: ['read'],
      trigger: { kind: 'onOpen' },
    })
    expect(await store.getInstalledPresets()).toEqual({ 'site-watch': 1 })
  })

  it('does not duplicate when the same presetId is installed twice', async () => {
    const store = createMemoryBoardStore()
    const catalog = catalogOf([siteWatch()])
    await ensurePresetBoards(store, catalog, NOW)
    await ensurePresetBoards(store, catalog, NOW)
    expect(await store.listBoards()).toHaveLength(1)
  })

  it('does not recreate a deleted plugin preset', async () => {
    const store = createMemoryBoardStore()
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)
    await store.deleteBoard('preset:site-watch')
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)
    expect(await store.listBoards()).toHaveLength(0)
    expect(await store.getInstalledPresets()).toEqual({ 'site-watch': 1 })
  })

  it('does not overwrite an edited preset when the catalog version bumps', async () => {
    const store = createMemoryBoardStore()
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)
    const board = await store.getBoard('preset:site-watch')
    await store.putBoard({ ...board!, title: '我改过的值班板' })

    await ensurePresetBoards(
      store,
      catalogOf([{ ...siteWatch(), version: 2, title: '新版值班' }]),
      NOW,
    )
    expect(await store.getBoard('preset:site-watch')).toMatchObject({
      title: '我改过的值班板',
      presetVersion: 1,
    })
    expect(await store.listBoards()).toHaveLength(1)
  })

  it('leaves example boards unchanged when plugin presets install', async () => {
    const store = createMemoryBoardStore()
    await ensureExampleBoards(store)
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)

    const boards = await store.listBoards()
    expect(boards.map((board) => board.presetId).sort()).toEqual(
      [...EXAMPLE_PRESETS.map((preset) => preset.id), 'site-watch'].sort(),
    )
    expect(boards.filter((board) => board.isExample)).toHaveLength(2)
    expect(boards.find((board) => board.presetId === 'site-watch')?.isExample).toBe(
      false,
    )
  })

  it('installs without identity and presents 需登录 instead of a blank success', async () => {
    const store = createMemoryBoardStore()
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)
    const widgetId = presetWidgetId('site-watch', 'occupancy')
    const controller = createBoardRefreshController({
      store,
      runtime: createMemoryBoardJobRuntime({ occupancy: 0.42 }),
    })

    expect(await controller.refreshStaleOnOpen('preset:site-watch')).toEqual([
      { kind: 'masked', reason: 'needs_login' },
    ])
    expect(
      resolveWidgetRenderState({
        latestData: (await store.getWidget(widgetId))?.latestData,
        source: await store.getDataSourceByWidgetId(widgetId),
        identity: anonymousIdentitySnapshot(),
      }),
    ).toMatchObject({ chrome: 'needs_login', masked: true, data: undefined })
    expect(await store.getWidget(widgetId)).not.toMatchObject({
      latestData: { occupancy: 0.42 },
    })
    controller.dispose()
  })

  it('skips first-run when resource params are still empty instead of treating it as revoke', async () => {
    const store = createMemoryBoardStore()
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)
    const widgetId = presetWidgetId('site-watch', 'occupancy')
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [
        { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
      ],
    })
    const runtime = createMemoryBoardJobRuntime({ occupancy: 0.42 })
    const controller = createBoardRefreshController({
      store,
      runtime,
      identityScope: scope,
    })

    expect(await controller.refreshStaleOnOpen('preset:site-watch')).toEqual([
      { kind: 'skipped', reason: 'incomplete_binding' },
    ])
    expect(
      await store.getWidget(widgetId, { principalKey: 'alice' }),
    ).not.toMatchObject({ latestData: { occupancy: 0.42 } })
    expect(
      resolveWidgetRenderState({
        latestData: (await store.getWidget(widgetId, { principalKey: 'alice' }))
          ?.latestData,
        source: await store.getDataSourceByWidgetId(widgetId),
        identity: scope.getSnapshot(),
      }),
    ).toMatchObject({
      chrome: 'incomplete_binding',
      masked: true,
      data: undefined,
    })
    expect(IDENTITY_INCOMPLETE_BINDING).toBe('待绑定资源')
    controller.dispose()
  })

  it('still evaluates after authorization_changed when params were empty then filled', async () => {
    const store = createMemoryBoardStore()
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)
    const widgetId = presetWidgetId('site-watch', 'occupancy')
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [],
    })
    let identityTicks = 0
    const controller = createBoardRefreshController({
      store,
      runtime: createMemoryBoardJobRuntime({ occupancy: 0.42 }),
      identityScope: scope,
      onChange: () => {
        identityTicks += 1
      },
    })

    scope.setAuthorizedResources([
      { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
    ])
    await expect.poll(() => identityTicks).toBeGreaterThan(0)
    expect(await controller.refreshStaleOnOpen('preset:site-watch')).toEqual([
      { kind: 'skipped', reason: 'incomplete_binding' },
    ])

    const source = await store.getDataSourceByWidgetId(widgetId)
    await store.putDataSource({
      ...source!,
      parameters: { siteIds: ['site-1'] },
    })
    expect(await controller.refreshStaleOnOpen('preset:site-watch')).toEqual([
      expect.objectContaining({ kind: 'finished', status: 'success' }),
    ])
    expect(
      await store.getWidget(widgetId, { principalKey: 'alice' }),
    ).toMatchObject({ latestData: { occupancy: 0.42 } })
    controller.dispose()
  })

  it('evaluates a completed binding and puts query data on the widget', async () => {
    const store = createMemoryBoardStore()
    await ensurePresetBoards(store, catalogOf([siteWatch()]), NOW)
    const widgetId = presetWidgetId('site-watch', 'occupancy')
    const source = await store.getDataSourceByWidgetId(widgetId)
    await store.putDataSource({
      ...source!,
      parameters: { siteIds: ['site-1'] },
    })
    const scope = createMemoryIdentityScope({
      principalKey: 'alice',
      resources: [
        { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
      ],
    })
    const controller = createBoardRefreshController({
      store,
      runtime: createMemoryBoardJobRuntime({ occupancy: 0.42 }),
      identityScope: scope,
    })

    const outcomes = await controller.refreshStaleOnOpen('preset:site-watch')
    expect(outcomes).toEqual([
      expect.objectContaining({ kind: 'finished', status: 'success' }),
    ])
    expect(
      await store.getWidget(widgetId, { principalKey: 'alice' }),
    ).toMatchObject({ latestData: { occupancy: 0.42 } })
    controller.dispose()
  })
})
