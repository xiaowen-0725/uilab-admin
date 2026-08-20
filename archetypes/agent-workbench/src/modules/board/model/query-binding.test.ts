import { describe, expect, it } from 'vitest'
import type { BoardQueryCatalogEntry } from '../ports/board-query-catalog-port'
import { UNRESTRICTED_AUTHORIZATION } from '../ports/identity-scope-port'
import { validateQueryBinding } from './query-binding'

const NOW = '2026-08-20T01:00:00.000Z'

const SUMMARY: BoardQueryCatalogEntry = {
  name: 'site_summary',
  title: '站点摘要',
  parameters: { siteIds: { type: 'resource', resourceType: 'site' } },
  requiredPermissions: ['read'],
  referencableByJob: true,
}

const FINANCE: BoardQueryCatalogEntry = {
  name: 'site_finance',
  title: '站点财务',
  parameters: { siteIds: { type: 'resource', resourceType: 'site' } },
  requiredPermissions: ['read', 'finance'],
  referencableByJob: true,
}

const CATALOG = [SUMMARY, FINANCE]

const READ_ONLY = {
  kind: 'resources' as const,
  resources: [
    { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
  ],
}

describe('validateQueryBinding', () => {
  it('accepts a catalog query whose requiredPermissions are covered', () => {
    const result = validateQueryBinding(
      CATALOG,
      {
        widgetId: 'w1',
        queryName: 'site_summary',
        params: { siteIds: ['site-1'] },
        now: NOW,
      },
      {
        kind: 'resources',
        resources: [
          {
            type: 'site',
            id: 'site-1',
            name: 'North',
            permissions: ['read', 'finance'],
          },
        ],
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toMatchObject({
      kind: 'query',
      queryName: 'site_summary',
      requiredPermissions: ['read'],
      parameters: { siteIds: ['site-1'] },
    })
  })

  it('rejects an undeclared metric name', () => {
    expect(
      validateQueryBinding(
        CATALOG,
        {
          widgetId: 'w1',
          queryName: 'made_up',
          params: { siteIds: ['site-1'] },
          now: NOW,
        },
        READ_ONLY,
      ),
    ).toMatchObject({ ok: false, error: 'unknown_query' })
  })

  it('rejects parameters outside the schema', () => {
    expect(
      validateQueryBinding(
        CATALOG,
        {
          widgetId: 'w1',
          queryName: 'site_summary',
          params: { siteIds: ['site-1'], extra: true },
          now: NOW,
        },
        READ_ONLY,
      ),
    ).toMatchObject({ ok: false, error: 'validation_failed' })
  })

  it('rejects a resource that is not authorized', () => {
    expect(
      validateQueryBinding(
        CATALOG,
        {
          widgetId: 'w1',
          queryName: 'site_summary',
          params: { siteIds: ['site-9'] },
          now: NOW,
        },
        READ_ONLY,
      ),
    ).toMatchObject({ ok: false, error: 'resource_not_authorized' })
  })

  it('rejects a visible finance metric when the resource lacks finance', () => {
    expect(
      validateQueryBinding(
        CATALOG,
        {
          widgetId: 'w1',
          queryName: 'site_finance',
          params: { siteIds: ['site-1'] },
          now: NOW,
        },
        READ_ONLY,
      ),
    ).toMatchObject({ ok: false, error: 'permission_denied' })
  })

  it('rejects an empty resource-id list', () => {
    expect(
      validateQueryBinding(
        CATALOG,
        {
          widgetId: 'w1',
          queryName: 'site_summary',
          params: { siteIds: [] },
          now: NOW,
        },
        READ_ONLY,
      ),
    ).toMatchObject({ ok: false, error: 'invalid_resource_parameter' })
  })

  it('unions parameter-level requiredPermissions before binding', () => {
    const catalog: BoardQueryCatalogEntry[] = [
      {
        ...SUMMARY,
        parameters: {
          siteIds: {
            type: 'resource',
            resourceType: 'site',
            requiredPermissions: ['finance'],
          },
        },
      },
    ]
    expect(
      validateQueryBinding(
        catalog,
        {
          widgetId: 'w1',
          queryName: 'site_summary',
          params: { siteIds: ['site-1'] },
          now: NOW,
        },
        READ_ONLY,
      ),
    ).toMatchObject({ ok: false, error: 'permission_denied' })
  })

  it('lets unrestricted identity bind a catalog query', () => {
    const result = validateQueryBinding(
      CATALOG,
      {
        widgetId: 'w1',
        queryName: 'site_finance',
        params: { siteIds: ['any'] },
        now: NOW,
      },
      UNRESTRICTED_AUTHORIZATION,
    )
    expect(result.ok).toBe(true)
  })
})
