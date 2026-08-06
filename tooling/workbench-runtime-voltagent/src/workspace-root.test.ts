import assert from 'node:assert/strict'
import {
  access,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { BUILTIN_SKILLS_OFFICE_PLUGIN } from './plugin/builtins.js'
import { seedSkillsContribution } from './plugin/skills-loader.js'
import {
  OFFICE_WORKSPACE_README_NAME,
  ensureOfficeWorkspace,
  resolvePathWithinRoot,
} from './workspace-root.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('resolvePathWithinRoot', () => {
  const root = path.resolve('/tmp/office-ws')

  it('resolves relative paths under the root', () => {
    assert.equal(
      resolvePathWithinRoot(root, 'notes/a.md'),
      path.join(root, 'notes/a.md'),
    )
  })

  it('rejects parent traversal with a readable Chinese error', () => {
    assert.throws(
      () => resolvePathWithinRoot(root, '../outside.md'),
      (err: Error) => {
        assert.match(err.message, /路径越界/)
        assert.match(err.message, /office-ws|工作区/)
        return true
      },
    )
  })

  it('rejects absolute paths outside the root', () => {
    assert.throws(
      () => resolvePathWithinRoot(root, '/etc/passwd'),
      (err: Error) => {
        assert.match(err.message, /路径越界/)
        return true
      },
    )
  })

  it('allows absolute paths that still land inside the root', () => {
    const inside = path.join(root, 'output', 'x.md')
    assert.equal(resolvePathWithinRoot(root, inside), inside)
  })
})

describe('ensureOfficeWorkspace', () => {
  it('creates the root and a first-run README when missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-o2-empty-'))
    tempRoots.push(root)
    // Use a nested path that does not yet exist as the workspace root.
    const workspaceRoot = path.join(root, 'VoltAgent-Office', 'workspace')

    const result = await ensureOfficeWorkspace(workspaceRoot)

    assert.equal(result.createdRoot, true)
    assert.equal(result.wroteReadme, true)
    assert.equal(
      result.readmePath,
      path.join(workspaceRoot, OFFICE_WORKSPACE_README_NAME),
    )

    await access(workspaceRoot)
    const readme = await readFile(result.readmePath!, 'utf8')
    assert.match(readme, /工作区|VoltAgent|Office/)
    assert.match(readme, /WORKSPACE_ROOT|授权/)
    assert.doesNotMatch(readme, /production cluster|生产集群密钥/)
  })

  it('does not overwrite an existing README on subsequent boots', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'wb-o2-exist-'))
    tempRoots.push(workspaceRoot)
    const readmePath = path.join(workspaceRoot, OFFICE_WORKSPACE_README_NAME)
    await writeFile(readmePath, '用户自定义说明\n', 'utf8')

    const result = await ensureOfficeWorkspace(workspaceRoot)

    assert.equal(result.createdRoot, false)
    assert.equal(result.wroteReadme, false)
    assert.equal(await readFile(readmePath, 'utf8'), '用户自定义说明\n')
  })

  it('refuses README that is a symlink to outside the workspace', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'wb-o2-sym-'))
    tempRoots.push(base)
    const workspaceRoot = path.join(base, 'workspace')
    const outside = path.join(base, 'outside-readme.md')
    await writeFile(outside, 'escaped\n', 'utf8')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(workspaceRoot, { recursive: true })
    await symlink(outside, path.join(workspaceRoot, OFFICE_WORKSPACE_README_NAME))

    await assert.rejects(
      () => ensureOfficeWorkspace(workspaceRoot),
      (err: Error) => {
        assert.match(err.message, /路径越界|符号链接/)
        return true
      },
    )
    // Outside file must not be rewritten with bootstrap README.
    assert.equal(await readFile(outside, 'utf8'), 'escaped\n')
  })
})

describe('skills seed symlink safety', () => {
  it('refuses skills root that is a symlink to outside', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'wb-o3-sym-'))
    tempRoots.push(base)
    const workspaceRoot = path.join(base, 'workspace')
    const outside = path.join(base, 'outside-skills')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(workspaceRoot, { recursive: true })
    await mkdir(outside, { recursive: true })
    await symlink(outside, path.join(workspaceRoot, 'skills'))

    const contrib = BUILTIN_SKILLS_OFFICE_PLUGIN.contributes!.skills!
    const result = await seedSkillsContribution(
      'skills.office',
      contrib,
      workspaceRoot,
    )
    assert.equal(result.status, 'failed')
    assert.match(result.reason ?? '', /路径越界|符号链接/)
    // Must not seed SKILL.md under outside via symlink.
    const { readdir } = await import('node:fs/promises')
    const names = await readdir(outside)
    assert.equal(names.length, 0)
  })
})
