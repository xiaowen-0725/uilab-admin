import { describe, expect, it } from 'vitest'
import type { WidgetDataSourceRecord } from './types'
import {
  IDENTITY_INCOMPLETE_BINDING,
  IDENTITY_NEEDS_LOGIN,
  IDENTITY_NEEDS_RELOGIN,
  IDENTITY_PERMISSION_REVOKED,
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
    ).toEqual({
      data: undefined,
      chrome: 'permission_revoked',
      masked: true,
    })
    expect(IDENTITY_PERMISSION_REVOKED).toBe('权限已回收')
  })

  it('asks a query widget to 待绑定资源 when resource params are empty', async () => {
    expect(
      resolveWidgetRenderState({
        latestData: DATA,
        source: {
          id: 'source:w3b',
          widgetId: 'w3b',
          kind: 'query',
          trigger: { kind: 'onOpen' },
          referencableByJob: true,
          queryName: 'site_summary',
          parameters: {},
          parameterSchema: {
            siteIds: { type: 'resource', resourceType: 'site' },
          },
          requiredPermissions: ['read'],
          createdAt: NOW,
          updatedAt: NOW,
        },
        identity: {
          principalKey: 'alice',
          generation: 1,
          valid: true,
          authorization: {
            kind: 'resources',
            resources: [
              { type: 'site', id: 'site-1', name: 'North', permissions: ['read'] },
            ],
          },
        },
      }),
    ).toEqual({
      data: undefined,
      chrome: 'incomplete_binding',
      masked: true,
    })
    expect(IDENTITY_INCOMPLETE_BINDING).toBe('待绑定资源')
  })

  it('asks a query widget to 需登录 when there is no product identity', () => {
    expect(
      resolveWidgetRenderState({
        latestData: DATA,
        source: {
          id: 'source:w4',
          widgetId: 'w4',
          kind: 'query',
          trigger: { kind: 'onOpen' },
          referencableByJob: true,
          queryName: 'site_summary',
          parameters: {},
          parameterSchema: {
            siteIds: { type: 'resource', resourceType: 'site' },
          },
          requiredPermissions: ['read'],
          createdAt: NOW,
          updatedAt: NOW,
        },
        identity: anonymousIdentitySnapshot(),
      }),
    ).toEqual({
      data: undefined,
      chrome: 'needs_login',
      masked: true,
    })
    expect(IDENTITY_NEEDS_LOGIN).toBe('需登录')
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
