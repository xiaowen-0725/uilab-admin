import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
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
})
