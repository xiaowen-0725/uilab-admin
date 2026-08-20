/**
 * Preset board catalog HTTP (#148).
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
  QUERY_SITE_SUMMARY,
  SITE_WATCH_PRESET_ID,
} from '../plugin/query-fixture-package.js'
import { createPluginRegistry } from '../plugin/registry.js'
import { createMemoryProductIdentity } from './board-query-identity.js'
import { createBoardRuntime } from './board-runtime.js'

const TOKEN = 'test-sidecar-token'
const tempRoots: string[] = []

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })))
})

async function presetRuntime() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'board-presets-'))
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
      identity: createMemoryProductIdentity({ principalKey: 'alice' }),
    },
    presets: {
      boards: registry.listPresetBoards(),
      identity: createMemoryProductIdentity({ principalKey: 'alice' }),
    },
  })
}

function appOf(runtime: Awaited<ReturnType<typeof presetRuntime>>) {
  const app = new Hono()
  runtime.mountRoutes(app)
  return app
}

function auth(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  }
}

describe('GET /board/presets', () => {
  it('lists the fixture preset board with query binding and empty resource params', async () => {
    const res = await appOf(await presetRuntime()).request('/board/presets', auth())
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      presetBoards: Array<Record<string, unknown>>
    }
    assert.equal(body.presetBoards.length, 1)
    const board = body.presetBoards[0]
    assert.equal(board?.presetId, SITE_WATCH_PRESET_ID)
    const widgets = board?.widgets as Array<Record<string, unknown>>
    assert.equal(widgets[0]?.queryName, QUERY_SITE_SUMMARY)
    assert.deepEqual(widgets[0]?.parameters, {})
    assert.deepEqual(widgets[0]?.requiredPermissions, ['read'])
    assert.equal(typeof widgets[0]?.html, 'string')
  })

  it('rejects a missing sidecar token', async () => {
    const res = await appOf(await presetRuntime()).request('/board/presets')
    assert.equal(res.status, 401)
  })

  it('serves boards attached from the plugin registry', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'board-presets-'))
    tempRoots.push(root)
    const registry = createPluginRegistry({
      env: {},
      builtins: [],
      packages: [QUERY_FIXTURE_PACKAGE],
      enabledIds: [QUERY_FIXTURE_PLUGIN_ID],
    })
    const identity = createMemoryProductIdentity({ principalKey: 'alice' })
    const runtime = createBoardRuntime({
      stagingRoot: path.join(root, 'staging'),
      jobsRoot: path.join(root, 'jobs'),
      token: TOKEN,
      env: { WORKSPACE_ROOT: path.join(root, 'workspace') },
    })
    runtime.attachPresets({
      boards: registry.listPresetBoards(),
      identity,
    })
    const res = await appOf(runtime).request('/board/presets', auth())
    assert.equal(res.status, 200)
    const body = (await res.json()) as { presetBoards: Array<{ presetId: string }> }
    assert.equal(body.presetBoards[0]?.presetId, SITE_WATCH_PRESET_ID)
  })
})
