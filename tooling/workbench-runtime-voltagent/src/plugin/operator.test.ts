import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildDoctorReport,
  buildListReport,
  collectDoctorFindings,
  formatDoctorText,
  formatListText,
  runPluginDoctor,
  runPluginList,
} from './operator.js'
import { createPluginRegistry } from './registry.js'
import { BUILTIN_MCP_DOCS_PLUGIN, BUILTIN_PLUGINS } from './builtins.js'

describe('buildListReport', () => {
  it('lists plugin id/version/status/contributes without secrets', async () => {
    const reg = createPluginRegistry({
      env: { MCP_DOCS_BEARER_TOKEN: 'sk-super-secret-should-not-leak' },
      builtins: BUILTIN_PLUGINS,
    })
    const result = await reg.load()
    const report = buildListReport(result)
    assert.ok(report.rows.some((r) => r.id === 'mcp.docs'))
    assert.ok(report.rows.some((r) => r.id === 'skills.office'))
    assert.match(report.text, /PLUGIN_ID/)
    assert.match(report.text, /mcp\.docs/)
    assert.doesNotMatch(report.text, /sk-super-secret/)
    assert.doesNotMatch(JSON.stringify(report.json), /sk-super-secret/)
    const docs = report.rows.find((r) => r.id === 'mcp.docs')
    assert.ok(docs?.contributes.includes('mcp') || docs?.contributes.includes('auth'))
    await result.disconnect()
  })
})

describe('buildDoctorReport', () => {
  it('reports auth=missing and mcp disabled in Chinese without secrets', async () => {
    const reg = createPluginRegistry({
      env: {},
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
    })
    const result = await reg.load()
    const report = buildDoctorReport(result)
    const findings = report.findings
    assert.ok(
      findings.some(
        (f) => f.code === 'auth_missing' && f.pluginId === 'mcp.docs',
      ),
    )
    assert.ok(findings.some((f) => f.code === 'mcp_disabled'))
    assert.match(report.text, /auth_missing|MCP/)
    assert.doesNotMatch(report.text, /sk-|ghp_/)
    // with missing auth → not fully ok
    assert.equal(report.ok, false)
    await result.disconnect()
  })

  it('format helpers are script-assertable TSV-like', () => {
    const text = formatListText([
      {
        id: 'a',
        name: 'A',
        version: '1.0.0',
        kind: 'builtin',
        enabled: true,
        loadStatus: 'loaded',
        contributes: ['mcp'],
      },
    ])
    assert.match(text, /^PLUGIN_ID\t/m)
    assert.match(text, /^a\t1\.0\.0\tbuiltin\tyes\tloaded\tmcp\t$/m)

    const doc = formatDoctorText([
      {
        severity: 'warn',
        pluginId: 'p',
        code: 'auth_missing',
        message: '缺少环境变量：FOO',
      },
    ])
    assert.match(doc, /WARN\s*\tp\tauth_missing\t缺少环境变量：FOO/)
  })
})

describe('runPluginList / runPluginDoctor', () => {
  it('loads via Registry from env without throwing', async () => {
    const list = await runPluginList({
      env: {},
      builtins: BUILTIN_PLUGINS,
      persistAuthBindings: false,
    })
    assert.ok(list.rows.length >= 3)
    await list.disconnect()

    const doctor = await runPluginDoctor({
      env: {},
      builtins: BUILTIN_PLUGINS,
      persistAuthBindings: false,
    })
    assert.ok(doctor.findings.length > 0)
    assert.doesNotMatch(doctor.text, /sk-|password=/i)
    await doctor.disconnect()
  })
})

describe('collectDoctorFindings discovery', () => {
  it('includes discovery failures as error findings', async () => {
    const reg = createPluginRegistry({
      env: {},
      builtins: [BUILTIN_MCP_DOCS_PLUGIN],
      discoveryFailures: [
        {
          id: 'local.broken',
          sourcePath: '/tmp/x/plugin.json',
          reason: 'JSON 解析失败',
        },
      ],
    })
    const result = await reg.load()
    const findings = collectDoctorFindings(result)
    assert.ok(
      findings.some(
        (f) => f.code === 'discovery_failed' && f.pluginId === 'local.broken',
      ),
    )
    await result.disconnect()
  })
})
