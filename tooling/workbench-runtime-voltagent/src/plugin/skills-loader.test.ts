import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  BUILTIN_PLUGINS,
  BUILTIN_SKILLS_OFFICE_PLUGIN,
  OFFICE_BUILTIN_SKILL_IDS,
} from './builtins.js'
import { createPluginRegistry } from './registry.js'
import {
  listWorkspaceSkillIds,
  loadSkillsContributions,
  seedSkillsContribution,
} from './skills-loader.js'
import type { PluginManifest } from './manifest.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('seedSkillsContribution (missing-only)', () => {
  it('seeds office skill templates and never overwrites existing SKILL.md', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-skills-seed-'))
    tempRoots.push(root)

    const contrib = BUILTIN_SKILLS_OFFICE_PLUGIN.contributes!.skills!
    const first = await seedSkillsContribution('skills.office', contrib, root)
    assert.equal(first.status, 'seeded')
    assert.deepEqual(
      [...first.seededSkillIds].sort(),
      [...OFFICE_BUILTIN_SKILL_IDS].sort(),
    )
    assert.equal(first.skippedSkillIds.length, 0)

    const custom = path.join(root, 'skills', 'meeting-notes', 'SKILL.md')
    await writeFile(custom, '---\nname: custom\n---\n用户定制\n', 'utf8')

    const second = await seedSkillsContribution('skills.office', contrib, root)
    assert.ok(second.skippedSkillIds.includes('meeting-notes'))
    assert.equal(
      await readFile(custom, 'utf8'),
      '---\nname: custom\n---\n用户定制\n',
    )
    assert.deepEqual(
      await listWorkspaceSkillIds(root),
      [...OFFICE_BUILTIN_SKILL_IDS].sort(),
    )
    const widgetRules = path.join(
      root,
      'skills',
      'board-widget',
      'references',
      'widget-rules.md',
    )
    assert.match(await readFile(widgetRules, 'utf8'), /### W1/)
  })

  it('does not crash with empty skillIds / no workspace templates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-skills-empty-'))
    tempRoots.push(root)
    const result = await seedSkillsContribution(
      'skills.none',
      { virtualRoot: '/skills', skillIds: [] },
      root,
    )
    assert.equal(result.status, 'seeded')
    assert.equal(result.seededSkillIds.length, 0)
    assert.ok(result.skillsRoot)
  })
})

describe('PluginRegistry skills aggregation', () => {
  it('syncs trusted installed lark-* Skills into a generated Workspace root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-lark-skills-'))
    const source = await mkdtemp(path.join(os.tmpdir(), 'wb-lark-source-'))
    tempRoots.push(root, source)
    await mkdir(path.join(source, 'lark-doc', 'references'), {
      recursive: true,
    })
    await writeFile(
      path.join(source, 'lark-doc', 'SKILL.md'),
      '---\nname: lark-doc\n---\nUse native lark-cli.\n',
      'utf8',
    )
    await writeFile(
      path.join(source, 'lark-doc', 'references', 'fetch.md'),
      'lark-cli docs +fetch\n',
      'utf8',
    )
    await mkdir(path.join(source, 'unrelated-skill'), { recursive: true })
    await writeFile(
      path.join(source, 'unrelated-skill', 'SKILL.md'),
      '---\nname: unrelated-skill\n---\n',
      'utf8',
    )

    const reg = createPluginRegistry({
      env: {
        PLUGINS_ENABLED: 'cli.feishu',
        FEISHU_SKILLS_ROOT: source,
      },
    })
    const result = await reg.load({ workspaceRoot: root })

    assert.ok(result.skillRoots.includes('/.runtime-skills/feishu'))
    const feishu = result.skillsResults.find(
      (candidate) => candidate.pluginId === 'cli.feishu',
    )
    assert.equal(feishu?.status, 'seeded')
    assert.deepEqual(feishu?.seededSkillIds, ['lark-doc'])
    assert.match(
      await readFile(
        path.join(
          root,
          '.runtime-skills',
          'feishu',
          'lark-doc',
          'references',
          'fetch.md',
        ),
        'utf8',
      ),
      /lark-cli docs/,
    )
    await assert.rejects(() =>
      readFile(
        path.join(
          root,
          '.runtime-skills',
          'feishu',
          'unrelated-skill',
          'SKILL.md',
        ),
        'utf8',
      ),
    )
    await result.disconnect()
  })

  it('does not mount a failed installed Skills root or mark its plugin ready', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-lark-missing-'))
    tempRoots.push(root)
    const reg = createPluginRegistry({
      env: {
        PLUGINS_ENABLED: 'cli.feishu',
        FEISHU_SKILLS_ROOT: path.join(root, 'missing-source'),
      },
      cliRunner: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    })

    const result = await reg.load({ workspaceRoot: root })

    assert.equal(
      result.plugins.find((plugin) => plugin.id === 'cli.feishu')?.loadStatus,
      'failed',
    )
    assert.equal(result.skillRoots.includes('/.runtime-skills/feishu'), false)
    await result.disconnect()
  })

  it('aggregates virtual skill roots without workspaceRoot (skip seed)', async () => {
    const reg = createPluginRegistry({ env: {} })
    const result = await reg.load()
    assert.ok(result.skillRoots.includes('/skills'))
    assert.equal(
      result.skillsResults.find((s) => s.pluginId === 'skills.office')?.status,
      'skipped',
    )
    await result.disconnect()
  })

  it('seeds via load({ workspaceRoot }) and isolates plugin failure', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-skills-reg-'))
    tempRoots.push(root)

    const broken: PluginManifest = {
      schemaVersion: 1,
      id: 'skills.broken',
      name: 'Broken',
      version: '0.0.1',
      kind: 'local',
      enabledByDefault: true,
      contributes: {
        skills: {
          virtualRoot: '/skills-alt',
          skillIds: ['does-not-exist'],
          bundledRelativeDir: 'no-such-bundled',
        },
      },
    }

    const reg = createPluginRegistry({
      env: {},
      builtins: BUILTIN_PLUGINS,
      extra: [broken],
    })
    const result = await reg.load({ workspaceRoot: root })
    assert.ok(result.skillRoots.includes('/skills'))
    assert.ok(result.skillRoots.includes('/skills-alt'))

    const office = result.plugins.find((p) => p.id === 'skills.office')
    const fail = result.plugins.find((p) => p.id === 'skills.broken')
    assert.equal(office?.loadStatus, 'loaded')
    assert.equal(fail?.loadStatus, 'failed')
    assert.ok(
      (await listWorkspaceSkillIds(root)).includes('meeting-notes'),
    )
    await result.disconnect()
  })

  it('PLUGINS_DISABLED skills.office skips seed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-skills-off-'))
    tempRoots.push(root)
    const reg = createPluginRegistry({
      env: { PLUGINS_DISABLED: 'skills.office' },
      builtins: [BUILTIN_SKILLS_OFFICE_PLUGIN],
    })
    const result = await reg.load({ workspaceRoot: root })
    assert.equal(result.skillRoots.length, 0)
    assert.equal(
      result.plugins.find((p) => p.id === 'skills.office')?.enabled,
      false,
    )
    assert.deepEqual(await listWorkspaceSkillIds(root), [])
    await result.disconnect()
  })
})

describe('loadSkillsContributions multi-plugin', () => {
  it('dedupes virtual roots', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-skills-multi-'))
    tempRoots.push(root)
    await mkdir(path.join(root, 'custom-templates', 'x'), { recursive: true })
    await writeFile(
      path.join(root, 'custom-templates', 'x', 'SKILL.md'),
      '---\nname: x\n---\n',
      'utf8',
    )

    const agg = await loadSkillsContributions(
      [
        {
          pluginId: 'a',
          contrib: {
            virtualRoot: '/skills',
            skillIds: ['meeting-notes'],
            bundledRelativeDir: 'bundled-skills',
          },
        },
        {
          pluginId: 'b',
          contrib: {
            virtualRoot: '/skills',
            workspaceDir: 'skills',
            skillIds: ['x'],
            bundledRelativeDir: path.join(root, 'custom-templates'),
          },
        },
      ],
      { workspaceRoot: root },
    )
    assert.deepEqual(agg.virtualRoots, ['/skills'])
    assert.equal(agg.results.length, 2)
  })
})
