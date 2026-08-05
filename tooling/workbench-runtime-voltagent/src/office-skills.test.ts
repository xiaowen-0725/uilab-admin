import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  OFFICE_OUTPUT_DIRS,
  OFFICE_SKILL_IDS,
  ensureOfficeSkills,
  listSeededSkillIds,
  resolveBundledSkillsDir,
} from './office-skills.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('ensureOfficeSkills', () => {
  it('seeds three SKILL.md files and output dirs from bundled templates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-o3-skills-'))
    tempRoots.push(root)

    const result = await ensureOfficeSkills(root)

    assert.deepEqual([...result.seededSkillIds].sort(), [...OFFICE_SKILL_IDS].sort())
    assert.equal(result.skippedSkillIds.length, 0)

    const ids = await listSeededSkillIds(root)
    assert.deepEqual(ids, [...OFFICE_SKILL_IDS].sort())

    for (const id of OFFICE_SKILL_IDS) {
      const md = await readFile(path.join(root, 'skills', id, 'SKILL.md'), 'utf8')
      assert.match(md, /^---/m)
      assert.match(md, new RegExp(`name:\\s*${id}`))
      assert.match(md, /output\//)
    }

    for (const rel of OFFICE_OUTPUT_DIRS) {
      const content = await readFile(
        // dir exists if we can write a probe after mkdir
        path.join(root, rel, '.keep-probe'),
      ).catch(async () => {
        await writeFile(path.join(root, rel, '.keep-probe'), 'ok', 'utf8')
        return readFile(path.join(root, rel, '.keep-probe'), 'utf8')
      })
      assert.ok(content)
    }
  })

  it('does not overwrite an existing SKILL.md', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-o3-keep-'))
    tempRoots.push(root)
    const custom = path.join(root, 'skills', 'meeting-notes')
    await writeFile(
      // ensureOfficeSkills will mkdir parents; pre-create one skill
      path.join(root, 'placeholder'),
      '',
      'utf8',
    )
    const { mkdir } = await import('node:fs/promises')
    await mkdir(custom, { recursive: true })
    await writeFile(path.join(custom, 'SKILL.md'), '---\nname: custom\n---\n用户定制\n', 'utf8')

    const result = await ensureOfficeSkills(root)

    assert.ok(result.skippedSkillIds.includes('meeting-notes'))
    assert.ok(result.seededSkillIds.includes('weekly-report'))
    assert.equal(
      await readFile(path.join(custom, 'SKILL.md'), 'utf8'),
      '---\nname: custom\n---\n用户定制\n',
    )
  })
})

describe('resolveBundledSkillsDir', () => {
  it('points at package bundled-skills with three templates', async () => {
    const dir = resolveBundledSkillsDir()
    for (const id of OFFICE_SKILL_IDS) {
      const md = await readFile(path.join(dir, id, 'SKILL.md'), 'utf8')
      assert.match(md, /SKILL|步骤|交付物/)
    }
  })
})
