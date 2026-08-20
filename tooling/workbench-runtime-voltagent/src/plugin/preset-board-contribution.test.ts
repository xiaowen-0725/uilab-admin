/**
 * PluginManifest preset board contribution (#148 / ADR-0024 §5).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parsePluginManifestJson } from './discover.js'
import { createPluginRegistry } from './registry.js'
import {
  QUERY_FIXTURE_PACKAGE,
  QUERY_FIXTURE_PLUGIN_ID,
  QUERY_SITE_SUMMARY,
  SITE_WATCH_PRESET_ID,
} from './query-fixture-package.js'

function pluginJson(presetBoards: unknown, queries?: unknown) {
  const contributes: { presetBoards: unknown; queries?: unknown } = {
    presetBoards,
  }
  if (queries !== undefined) {
    contributes.queries = queries
  }
  return {
    schemaVersion: 1,
    id: 'local.preset',
    name: 'Local Preset',
    version: '0.1.0',
    contributes,
  }
}

const VALID_QUERY = {
  name: 'site_summary',
  title: '站点摘要',
  requiredPermissions: ['read'],
}

const VALID_WIDGET = {
  id: 'occupancy',
  title: '满位',
  html: '<!doctype html><html><body><script>widget.ready()</script></body></html>',
  placement: { x: 0, y: 0, w: 6, h: 4 },
  source: { kind: 'query', queryName: 'site_summary' },
}

describe('parsePluginManifestJson presetBoards', () => {
  it('accepts a declarative preset board with a query binding and empty resource params', () => {
    const parsed = parsePluginManifestJson(
      pluginJson(
        [
          {
            presetId: 'site-watch',
            version: 1,
            title: '站点值班',
            purpose: '盯站点摘要',
            widgets: [VALID_WIDGET],
          },
        ],
        [VALID_QUERY],
      ),
      '/x/plugin.json',
    )
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.deepEqual(parsed.manifest.contributes?.presetBoards, [
      {
        presetId: 'site-watch',
        version: 1,
        title: '站点值班',
        purpose: '盯站点摘要',
        widgets: [
          {
            id: 'occupancy',
            title: '满位',
            html: VALID_WIDGET.html,
            placement: { x: 0, y: 0, w: 6, h: 4 },
            source: {
              kind: 'query',
              queryName: 'site_summary',
              parameters: {},
            },
          },
        ],
      },
    ])
  })

  it('rejects handler/module/execute fields on filesystem preset boards', () => {
    const parsed = parsePluginManifestJson(
      pluginJson([
        {
          presetId: 'evil',
          version: 1,
          title: 'Evil',
          widgets: [{ ...VALID_WIDGET, handler: './evil.js' }],
        },
      ]),
      '/x/plugin.json',
    )
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.match(parsed.reason, /handler|实现/)
  })

  it('rejects widget HTML larger than 512 KiB', () => {
    const parsed = parsePluginManifestJson(
      pluginJson(
        [
          {
            presetId: 'site-watch',
            version: 1,
            title: '站点值班',
            widgets: [
              {
                ...VALID_WIDGET,
                html: 'x'.repeat(512 * 1024 + 1),
              },
            ],
          },
        ],
        [VALID_QUERY],
      ),
      '/x/plugin.json',
    )
    assert.equal(parsed.ok, false)
    if (!parsed.ok) {
      assert.equal(parsed.id, 'local.preset')
      assert.match(parsed.reason, /512 KiB/)
    }
  })

  it('rejects a preset board whose queryName is not declared on the same plugin', () => {
    const parsed = parsePluginManifestJson(
      pluginJson(
        [
          {
            presetId: 'site-watch',
            version: 1,
            title: '站点值班',
            widgets: [
              {
                ...VALID_WIDGET,
                source: { kind: 'query', queryName: 'ghost_query' },
              },
            ],
          },
        ],
        [VALID_QUERY],
      ),
      '/x/plugin.json',
    )
    assert.equal(parsed.ok, false)
    if (!parsed.ok) {
      assert.equal(parsed.id, 'local.preset')
      assert.match(parsed.reason, /local\.preset/)
      assert.match(parsed.reason, /site-watch/)
      assert.match(parsed.reason, /ghost_query/)
    }
  })
})

describe('query fixture preset board catalog', () => {
  it('exposes the site-watch board bound to site_summary when enabled', () => {
    const registry = createPluginRegistry({
      env: {},
      builtins: [],
      packages: [QUERY_FIXTURE_PACKAGE],
      enabledIds: [QUERY_FIXTURE_PLUGIN_ID],
    })
    const boards = registry.listPresetBoards()
    assert.equal(boards.length, 1)
    assert.equal(boards[0]?.presetId, SITE_WATCH_PRESET_ID)
    assert.equal(boards[0]?.widgets[0]?.queryName, QUERY_SITE_SUMMARY)
    assert.deepEqual(boards[0]?.widgets[0]?.parameters, {})
    assert.deepEqual(boards[0]?.widgets[0]?.requiredPermissions, ['read'])
  })

  it('hides fixture preset boards when the plugin is not enabled', () => {
    const registry = createPluginRegistry({
      env: {},
      builtins: [],
      packages: [QUERY_FIXTURE_PACKAGE],
    })
    assert.deepEqual(registry.listPresetBoards(), [])
  })
})
