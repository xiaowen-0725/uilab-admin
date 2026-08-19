import { describe, expect, it } from 'vitest'
import type { WidgetDataSourceRecord } from './types'
import {
  IDENTITY_NEEDS_RELOGIN,
  anonymousIdentitySnapshot,
  resolveWidgetRenderState,
} from './widget-render-state'

const NOW = '2026-08-19T00:00:00.000Z'
const DATA = { quote: 7 }

const preset: WidgetDataSourceRecord = {
  id: 'source:w1',
  widgetId: 'w1',
  kind: 'preset',
  trigger: { kind: 'manual' },
  referencableByJob: false,
  createdAt: NOW,
  updatedAt: NOW,
}

const job: WidgetDataSourceRecord = {
  id: 'source:w2',
  widgetId: 'w2',
  kind: 'job',
  trigger: { kind: 'manual' },
  referencableByJob: false,
  jobId: 'j1',
  createdAt: NOW,
  updatedAt: NOW,
}

describe('resolveWidgetRenderState', () => {
  it('keeps preset data visible when the session is invalid', () => {
    expect(
      resolveWidgetRenderState({
        latestData: DATA,
        source: preset,
        identity: { ...anonymousIdentitySnapshot(), valid: false },
      }),
    ).toEqual({ data: DATA, chrome: 'none', masked: false })
  })

  it('masks a job snapshot when the product identity is invalid', () => {
    expect(
      resolveWidgetRenderState({
        latestData: DATA,
        source: job,
        identity: {
          principalKey: 'alice',
          generation: 2,
          valid: false,
          authorization: { kind: 'resources', resources: [] },
        },
      }),
    ).toEqual({
      data: undefined,
      chrome: 'needs_relogin',
      masked: true,
    })
    expect(IDENTITY_NEEDS_RELOGIN).toBe('需重新登录')
  })

  it('withholds a query snapshot when authorization no longer covers it', () => {
    expect(
      resolveWidgetRenderState({
        latestData: DATA,
        source: {
          id: 'source:w3',
          widgetId: 'w3',
          kind: 'query',
          trigger: { kind: 'manual' },
          referencableByJob: true,
          queryName: 'site_report',
          parameters: { siteIds: ['site-1'] },
          parameterSchema: {
            siteIds: { type: 'resource', resourceType: 'site' },
          },
          requiredPermissions: ['finance'],
          createdAt: NOW,
          updatedAt: NOW,
        },
        identity: {
          principalKey: 'alice',
          generation: 3,
          valid: true,
          authorization: {
            kind: 'resources',
            resources: [
              { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
            ],
          },
        },
      }),
    ).toEqual({ data: undefined, chrome: 'none', masked: true })
  })

  it('shows the current identity snapshot when valid', () => {
    expect(
      resolveWidgetRenderState({
        latestData: DATA,
        source: job,
        identity: {
          principalKey: 'alice',
          generation: 1,
          valid: true,
          authorization: { kind: 'resources', resources: [] },
        },
      }),
    ).toEqual({ data: DATA, chrome: 'none', masked: false })
  })
})
