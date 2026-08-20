/**
 * PluginManifest query contribution (#146 / ADR-0024 §2).
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { parsePluginManifestJson } from './discover.js'
import { createPluginRegistry } from './registry.js'
import { seedSkillsContribution } from './skills-loader.js'
import {
  QUERY_FIXTURE_PACKAGE,
  QUERY_FIXTURE_PLUGIN_ID,
  QUERY_SITE_FINANCE,
  QUERY_SITE_SUMMARY,
} from './query-fixture-package.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })))
})

function pluginJson(queries: unknown) {
  return {
    schemaVersion: 1,
    id: 'local.query',
    name: 'Local Query',
    version: '0.1.0',
    contributes: { queries },
  }
}

describe('parsePluginManifestJson query contributions', () => {
  it('accepts a declarative query without implementation fields', () => {
    const parsed = parsePluginManifestJson(
      pluginJson([
        {
          name: 'site_summary',
          title: '站点摘要',
          parameters: {
            siteIds: { type: 'resource', resourceType: 'site' },
            window: { type: 'string' },
          },
          requiredPermissions: ['read'],
          referencableByJob: true,
        },
      ]),
      '/x/plugin.json',
    )
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.deepEqual(parsed.manifest.contributes?.queries, [
      {
        name: 'site_summary',
        title: '站点摘要',
        parameters: {
          siteIds: { type: 'resource', resourceType: 'site' },
          window: { type: 'string', required: true },
        },
        requiredPermissions: ['read'],
        referencableByJob: true,
      },
    ])
  })

  it('rejects handler/module/execute fields on filesystem plugins', () => {
    const parsed = parsePluginManifestJson(
      pluginJson([
        {
          name: 'evil',
          title: 'Evil',
          handler: './evil.js',
          requiredPermissions: ['read'],
        },
      ]),
      '/x/plugin.json',
    )
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.match(parsed.reason, /handler|实现/)
  })
})

describe('query fixture package catalog', () => {
  it('exposes two queries with distinct requiredPermissions when enabled', () => {
    const registry = createPluginRegistry({
      env: {},
      builtins: [],
      packages: [QUERY_FIXTURE_PACKAGE],
      enabledIds: [QUERY_FIXTURE_PLUGIN_ID],
    })
    const catalog = registry.listQueryCatalog()
    assert.equal(catalog.length, 2)
    const names = catalog.map((entry) => entry.name).sort()
    assert.deepEqual(names, [QUERY_SITE_FINANCE, QUERY_SITE_SUMMARY].sort())
    const summary = catalog.find((entry) => entry.name === QUERY_SITE_SUMMARY)
    const finance = catalog.find((entry) => entry.name === QUERY_SITE_FINANCE)
    assert.deepEqual(summary?.requiredPermissions, ['read'])
    assert.deepEqual(finance?.requiredPermissions, ['read', 'finance'])
    assert.equal(summary?.parameters.siteIds?.type, 'resource')
    assert.ok(registry.listQueryHandlers()[QUERY_SITE_SUMMARY])
    assert.ok(registry.listQueryHandlers()[QUERY_SITE_FINANCE])
  })

  it('hides fixture queries when the plugin is not enabled', () => {
    const registry = createPluginRegistry({
      env: {},
      builtins: [],
      packages: [QUERY_FIXTURE_PACKAGE],
    })
    assert.deepEqual(registry.listQueryCatalog(), [])
    assert.deepEqual(registry.listQueryHandlers(), {})
  })

  it('seeds the board-metrics skill without endpoint URLs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'query-metrics-skill-'))
    tempRoots.push(root)
    const contrib = QUERY_FIXTURE_PACKAGE.manifests[0]?.contributes?.skills
    assert.ok(contrib)
    const seeded = await seedSkillsContribution(QUERY_FIXTURE_PLUGIN_ID, contrib, root)
    assert.equal(seeded.status, 'seeded')
    assert.ok(seeded.seededSkillIds.includes('board-metrics'))
    const text = await readFile(
      path.join(root, 'skills', 'board-metrics', 'SKILL.md'),
      'utf8',
    )
    assert.match(text, /requiredPermissions/)
    assert.match(text, /permissions/)
    assert.doesNotMatch(text, /https?:\/\/|query-fixture\.test|\/site-summary/)
  })
})
