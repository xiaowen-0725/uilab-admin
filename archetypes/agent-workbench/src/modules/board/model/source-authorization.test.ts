import { describe, expect, it } from 'vitest'
import { UNRESTRICTED_AUTHORIZATION } from '../ports/identity-scope-port'
import type { WidgetDataSourceRecord } from './types'
import { authorizeDataSourceParameters } from './source-authorization'

const NOW = '2026-08-19T00:00:00.000Z'

function querySource(
  overrides: Partial<WidgetDataSourceRecord> = {},
): WidgetDataSourceRecord {
  return {
    id: 'source:w1',
    widgetId: 'w1',
    kind: 'query',
    trigger: { kind: 'manual' },
    referencableByJob: true,
    queryName: 'site_report',
    parameters: { siteIds: ['site-1'] },
    parameterSchema: {
      siteIds: { type: 'resource', resourceType: 'site' },
    },
    requiredPermissions: ['read'],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('authorizeDataSourceParameters', () => {
  it('lets unrestricted identity through, including undeclared query permissions', () => {
    expect(
      authorizeDataSourceParameters(
        querySource({ requiredPermissions: undefined }),
        UNRESTRICTED_AUTHORIZATION,
      ),
    ).toEqual({ ok: true })
  })

  it('never blocks a preset source', () => {
    expect(
      authorizeDataSourceParameters(
        {
          id: 'source:w1',
          widgetId: 'w1',
          kind: 'preset',
          trigger: { kind: 'manual' },
          referencableByJob: false,
          createdAt: NOW,
          updatedAt: NOW,
        },
        { kind: 'resources', resources: [] },
      ),
    ).toEqual({ ok: true })
  })

  it('refuses a query that does not declare requiredPermissions', () => {
    expect(
      authorizeDataSourceParameters(
        querySource({ requiredPermissions: undefined }),
        { kind: 'resources', resources: [] },
      ),
    ).toEqual({ ok: false, reason: 'missing_required_permissions' })
  })

  it('refuses a resource that is in the set but lacks requiredPermissions', () => {
    expect(
      authorizeDataSourceParameters(
        querySource({ requiredPermissions: ['read', 'finance'] }),
        {
          kind: 'resources',
          resources: [
            { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
          ],
        },
      ),
    ).toEqual({ ok: false, reason: 'permission_denied' })
  })

  it('refuses a resource that is not in the authorized set', () => {
    expect(
      authorizeDataSourceParameters(querySource(), {
        kind: 'resources',
        resources: [
          { type: 'site', id: 'site-2', name: 'South', permissions: ['read'] },
        ],
      }),
    ).toEqual({ ok: false, reason: 'resource_not_authorized' })
  })

  it('refuses an empty resource-id list on a query source', () => {
    expect(
      authorizeDataSourceParameters(
        querySource({ parameters: { siteIds: [] } }),
        {
          kind: 'resources',
          resources: [
            { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
          ],
        },
      ),
    ).toEqual({ ok: false, reason: 'invalid_resource_parameter' })
  })

  it('unions parameter-level requiredPermissions with the query list', () => {
    expect(
      authorizeDataSourceParameters(
        querySource({
          requiredPermissions: ['read'],
          parameterSchema: {
            siteIds: {
              type: 'resource',
              resourceType: 'site',
              requiredPermissions: ['finance'],
            },
          },
        }),
        {
          kind: 'resources',
          resources: [
            { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
          ],
        },
      ),
    ).toEqual({ ok: false, reason: 'permission_denied' })
  })

  it('accepts a resource whose permissions cover the query', () => {
    expect(
      authorizeDataSourceParameters(querySource(), {
        kind: 'resources',
        resources: [
          {
            type: 'site',
            id: 'site-1',
            name: 'North',
            permissions: ['read', 'finance'],
          },
        ],
      }),
    ).toEqual({ ok: true })
  })
})
