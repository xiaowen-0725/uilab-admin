/**
 * Test-only query fixture package (#146).
 * Generic resource type `site` — no vertical domain words.
 * Enabled via PLUGINS_ENABLED=query.fixture; default off.
 */

import type { PluginManifest } from './manifest.js'
import type { BuiltinPluginPackage, QueryHandler } from './plugin-package.js'

export const QUERY_FIXTURE_PACKAGE_ID = 'query.fixture.package'
export const QUERY_FIXTURE_PLUGIN_ID = 'query.fixture'
export const QUERY_FIXTURE_UPSTREAM_ORIGIN = 'https://query-fixture.test'
export const QUERY_FIXTURE_BEARER_ENV = 'QUERY_FIXTURE_BEARER'
export const QUERY_SITE_SUMMARY = 'site_summary'
export const QUERY_SITE_FINANCE = 'site_finance'

/** Restricted snapshot used when the fixture bearer is set (fail-closed live path). */
export const QUERY_FIXTURE_DEFAULT_RESOURCES = [
  {
    type: 'site',
    id: 'site-1',
    name: 'North',
    permissions: ['read', 'finance'],
  },
] as const

const SITE_IDS_PARAM = {
  type: 'resource',
  resourceType: 'site',
} as const

const QUERY_FIXTURE_MANIFEST: PluginManifest = {
  schemaVersion: 1,
  id: QUERY_FIXTURE_PLUGIN_ID,
  name: '查询夹具',
  version: '0.1.0',
  kind: 'builtin',
  enabledByDefault: false,
  contributes: {
    queries: [
      {
        name: QUERY_SITE_SUMMARY,
        title: '站点摘要',
        parameters: { siteIds: SITE_IDS_PARAM },
        requiredPermissions: ['read'],
        referencableByJob: true,
      },
      {
        name: QUERY_SITE_FINANCE,
        title: '站点财务',
        parameters: { siteIds: SITE_IDS_PARAM },
        requiredPermissions: ['read', 'finance'],
        referencableByJob: true,
      },
    ],
  },
}

function parseSiteIds(params: Record<string, unknown>): unknown {
  return params.siteIds
}

async function readJson(res: Response): Promise<unknown> {
  if (!res.ok) {
    throw new Error(`upstream_failed:${res.status}`)
  }
  return res.json()
}

const siteSummaryHandler: QueryHandler = async ({ params, fetch }) => {
  const res = await fetch(`${QUERY_FIXTURE_UPSTREAM_ORIGIN}/site-summary`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ siteIds: parseSiteIds(params) }),
  })
  return readJson(res)
}

const siteFinanceHandler: QueryHandler = async ({ params, fetch }) => {
  const res = await fetch(`${QUERY_FIXTURE_UPSTREAM_ORIGIN}/site-finance`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ siteIds: parseSiteIds(params) }),
  })
  return readJson(res)
}

export function createQueryFixtureUpstream(options: {
  bearerToken: string
  oversized?: boolean
}): typeof fetch {
  const token = options.bearerToken
  return async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (headers.get('authorization') !== `Bearer ${token}`) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    let body: { siteIds?: unknown } = {}
    try {
      body = init?.body ? (JSON.parse(String(init.body)) as { siteIds?: unknown }) : {}
    } catch {
      body = {}
    }
    if (options.oversized || url.includes('/oversized')) {
      return jsonResponse({ blob: 'x'.repeat(512 * 1024 + 8) })
    }
    if (url.includes('/site-finance')) {
      return jsonResponse({ metric: 'finance', total: 88, sites: body.siteIds })
    }
    if (url.includes('/site-summary')) {
      return jsonResponse({
        metric: 'summary',
        occupancy: 0.42,
        sites: body.siteIds,
      })
    }
    return new Response('not found', { status: 404 })
  }
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const QUERY_FIXTURE_PACKAGE: BuiltinPluginPackage = {
  id: QUERY_FIXTURE_PACKAGE_ID,
  manifests: [QUERY_FIXTURE_MANIFEST],
  queryHandlers: {
    [QUERY_SITE_SUMMARY]: siteSummaryHandler,
    [QUERY_SITE_FINANCE]: siteFinanceHandler,
  },
}
