import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  httpStatusForWorkspaceRead,
  normalizeClientWorkspacePath,
  readWorkspaceFile,
} from './workspace-file-api.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('normalizeClientWorkspacePath', () => {
  const root = path.resolve('/tmp/ws-norm')

  it('strips virtual leading slash', () => {
    assert.equal(normalizeClientWorkspacePath(root, '/notes/a.md'), 'notes/a.md')
  })

  it('maps absolute path inside root to relative', () => {
    const abs = path.join(root, 'output', 'x.md')
    assert.equal(normalizeClientWorkspacePath(root, abs), 'output/x.md')
  })
})

describe('readWorkspaceFile', () => {
  it('reads a file under the root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-ws-file-'))
    tempRoots.push(root)
    await writeFile(path.join(root, 'hello.txt'), 'hello workspace\n', 'utf8')

    const result = await readWorkspaceFile(root, 'hello.txt')
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.bytes.toString('utf8'), 'hello workspace\n')
      assert.equal(result.relativePath, 'hello.txt')
    }
  })

  it('rejects parent escape', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-ws-escape-'))
    tempRoots.push(root)
    const result = await readWorkspaceFile(root, '../secret')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, 'path-escape')
      assert.equal(httpStatusForWorkspaceRead(result.reason), 403)
    }
  })

  it('returns not-found for missing file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-ws-miss-'))
    tempRoots.push(root)
    const result = await readWorkspaceFile(root, 'nope.md')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, 'not-found')
      assert.equal(httpStatusForWorkspaceRead(result.reason), 404)
    }
  })

  it('returns too-large when over maxBytes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-ws-big-'))
    tempRoots.push(root)
    await writeFile(path.join(root, 'big.txt'), 'x'.repeat(100), 'utf8')
    const result = await readWorkspaceFile(root, 'big.txt', { maxBytes: 10 })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, 'too-large')
      assert.equal(httpStatusForWorkspaceRead(result.reason), 413)
    }
  })

  it('reads virtual-style /relative path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-ws-virt-'))
    tempRoots.push(root)
    await writeFile(path.join(root, 'a.md'), '# hi\n', 'utf8')
    const result = await readWorkspaceFile(root, '/a.md')
    assert.equal(result.ok, true)
    if (result.ok) assert.match(result.bytes.toString('utf8'), /# hi/)
  })

  it('blocks symlink escape', async () => {
    const outer = await mkdtemp(path.join(os.tmpdir(), 'wb-ws-out-'))
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-ws-in-'))
    tempRoots.push(outer, root)
    const secret = path.join(outer, 'secret.txt')
    await writeFile(secret, 'secret\n', 'utf8')
    await symlink(secret, path.join(root, 'evil'))
    const result = await readWorkspaceFile(root, 'evil')
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'path-escape')
  })
})
