/**
 * Query HTTP channel: catalog + signed execute + fail-closed authz (#146).
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { Hono } from 'hono'
import {
  QUERY_FIXTURE_PACKAGE,
  QUERY_FIXTURE_PLUGIN_ID,
  QUERY_SITE_FINANCE,
  QUERY_SITE_SUMMARY,
  createQueryFixtureUpstream,
} from '../plugin/query-fixture-package.js'
import { createPluginRegistry } from '../plugin/registry.js'
import { createMemoryProductIdentity } from './board-query-identity.js'
import { createBoardRuntime } from './board-runtime.js'

const TOKEN = 'test-sidecar-token'
const PRODUCT_BEARER = 'fixture-secret-token'
const tempRoots: string[] = []

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })))
})

const SITE_READ = {
  type: 'site',
  id: 'site-1',
  name: 'North',
  permissions: ['read'],
}
const SITE_FINANCE = {
  type: 'site',
  id: 'site-1',
  name: 'North',
  permissions: ['read', 'finance'],
}

async function queryRuntime(resources = [SITE_FINANCE]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'board-queries-'))
  tempRoots.push(root)
  const registry = createPluginRegistry({
    env: {},
    builtins: [],
    packages: [QUERY_FIXTURE_PACKAGE],
    enabledIds: [QUERY_FIXTURE_PLUGIN_ID],
  })
  return createBoardRuntime({
    stagingRoot: path.join(root, 'staging'),
    jobsRoot: path.join(root, 'jobs'),
    token: TOKEN,
    env: { WORKSPACE_ROOT: path.join(root, 'workspace') },
    queries: {
      catalog: registry.listQueryCatalog(),
      handlers: registry.listQueryHandlers(),
      identity: createMemoryProductIdentity({
        principalKey: 'alice',
        resources,
        bearerToken: PRODUCT_BEARER,
        fetchImpl: createQueryFixtureUpstream({ bearerToken: PRODUCT_BEARER }),
      }),
    },
  })
}

function appOf(runtime: ReturnType<typeof createBoardRuntime>) {
  const app = new Hono()
  runtime.mountRoutes(app)
  return app
}

function auth(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  }
}

describe('board query catalog', () => {
  it('rejects catalog reads without sidecar credentials', async () => {
    const res = await appOf(await queryRuntime()).request('/board/queries')
    assert.equal(res.status, 401)
  })

  it('lists declared queries without endpoints or product credentials', async () => {
    const res = await appOf(await queryRuntime()).request('/board/queries', auth())
    assert.equal(res.status, 200)
    const body = (await res.json()) as { queries: Array<Record<string, unknown>> }
    assert.equal(body.queries.length, 2)
    const encoded = JSON.stringify(body)
    assert.doesNotMatch(encoded, /fixture-secret-token/)
    assert.doesNotMatch(encoded, /query-fixture\.test/)
    assert.doesNotMatch(encoded, /https?:\/\//)
    const summary = body.queries.find((query) => query.name === QUERY_SITE_SUMMARY)
    assert.deepEqual(summary?.requiredPermissions, ['read'])
    assert.equal(summary?.referencableByJob, true)
  })
})

describe('board query execute', () => {
  it('rejects execute without sidecar credentials', async () => {
    const res = await appOf(await queryRuntime()).request(
      `/board/queries/${QUERY_SITE_SUMMARY}/run`,
      { method: 'POST', body: JSON.stringify({ params: { siteIds: ['site-1'] } }) },
    )
    assert.equal(res.status, 401)
  })

  it('rejects extra body fields so callers cannot send code or credentials', async () => {
    const res = await appOf(await queryRuntime()).request(
      `/board/queries/${QUERY_SITE_SUMMARY}/run`,
      auth({
        method: 'POST',
        body: JSON.stringify({
          params: { siteIds: ['site-1'] },
          code: 'return process.env',
          token: PRODUCT_BEARER,
        }),
      }),
    )
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'validation_failed')
    assert.doesNotMatch(JSON.stringify(body), /fixture-secret-token/)
  })

  it('executes a declared query and returns the signed upstream payload', async () => {
    const runtime = await queryRuntime()
    const app = appOf(runtime)
    const res = await app.request(
      `/board/queries/${QUERY_SITE_SUMMARY}/run`,
      auth({
        method: 'POST',
        body: JSON.stringify({ params: { siteIds: ['site-1'] } }),
      }),
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as { ok: true; payload: { metric: string; occupancy: number } }
    assert.equal(body.ok, true)
    assert.equal(body.payload.metric, 'summary')
    assert.equal(body.payload.occupancy, 0.42)
    assert.doesNotMatch(JSON.stringify(body), /fixture-secret-token/)
    assert.ok(
      !runtime.toolList.some((tool) => String(tool.name ?? '').includes('query')),
    )
  })

  it('rejects an omitted resource parameter', async () => {
    const res = await appOf(await queryRuntime()).request(
      `/board/queries/${QUERY_SITE_SUMMARY}/run`,
      auth({
        method: 'POST',
        body: JSON.stringify({ params: {} }),
      }),
    )
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'invalid_resource_parameter')
  })

  it('rejects a resource that is not in the authorized set', async () => {
    const res = await appOf(await queryRuntime()).request(
      `/board/queries/${QUERY_SITE_SUMMARY}/run`,
      auth({
        method: 'POST',
        body: JSON.stringify({ params: { siteIds: ['site-999'] } }),
      }),
    )
    assert.equal(res.status, 403)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'resource_not_authorized')
  })

  it('rejects a resource that lacks requiredPermissions', async () => {
    const res = await appOf(await queryRuntime([SITE_READ])).request(
      `/board/queries/${QUERY_SITE_FINANCE}/run`,
      auth({
        method: 'POST',
        body: JSON.stringify({ params: { siteIds: ['site-1'] } }),
      }),
    )
    assert.equal(res.status, 403)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'permission_denied')
  })

  it('rejects a query that does not declare requiredPermissions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'board-queries-'))
    tempRoots.push(root)
    const runtime = createBoardRuntime({
      stagingRoot: path.join(root, 'staging'),
      jobsRoot: path.join(root, 'jobs'),
      token: TOKEN,
      env: { WORKSPACE_ROOT: path.join(root, 'workspace') },
      queries: {
        catalog: [
          {
            pluginId: 'query.bad',
            name: 'undeclared_perms',
            title: '未声明权限',
            parameters: { siteIds: { type: 'resource', resourceType: 'site' } },
            requiredPermissions: [],
            referencableByJob: true,
          },
        ],
        handlers: {
          undeclared_perms: async () => ({ leaked: true }),
        },
        identity: createMemoryProductIdentity({
          resources: [SITE_FINANCE],
          bearerToken: PRODUCT_BEARER,
        }),
      },
    })
    const res = await appOf(runtime).request(
      '/board/queries/undeclared_perms/run',
      auth({
        method: 'POST',
        body: JSON.stringify({ params: { siteIds: ['site-1'] } }),
      }),
    )
    assert.equal(res.status, 403)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'missing_required_permissions')
  })

  it('rejects a payload larger than 512 KiB and mentions the byte size', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'board-queries-'))
    tempRoots.push(root)
    const runtime = createBoardRuntime({
      stagingRoot: path.join(root, 'staging'),
      jobsRoot: path.join(root, 'jobs'),
      token: TOKEN,
      env: { WORKSPACE_ROOT: path.join(root, 'workspace') },
      queries: {
        catalog: [
          {
            pluginId: QUERY_FIXTURE_PLUGIN_ID,
            name: 'site_blob',
            title: '超限',
            parameters: {},
            requiredPermissions: ['read'],
            referencableByJob: false,
          },
        ],
        handlers: {
          site_blob: async () => ({ blob: 'x'.repeat(512 * 1024 + 8) }),
        },
        identity: createMemoryProductIdentity({
          resources: [SITE_FINANCE],
          bearerToken: PRODUCT_BEARER,
        }),
      },
    })
    const res = await appOf(runtime).request(
      '/board/queries/site_blob/run',
      auth({ method: 'POST', body: JSON.stringify({ params: {} }) }),
    )
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string; hint: string }
    assert.equal(body.error, 'output_too_large')
    assert.match(body.hint, /512 KiB/)
    assert.match(body.hint, /\d+ 字节/)
  })
})
