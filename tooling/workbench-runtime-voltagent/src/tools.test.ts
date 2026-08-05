import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { resolveWorkspaceRoot } from './profile.js'
import {
  resolveCreatablePathWithinRoot,
  resolveExistingPathWithinRoot,
} from './workspace-root.js'
import { readFileTool, writeFileTool } from './tools.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
  delete process.env.WORKSPACE_ROOT
})

describe('minimal DIY path confinement (symlink)', () => {
  it('refuses read through symlink to outside workspace', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'wb-diy-sym-'))
    tempRoots.push(base)
    const workspace = path.join(base, 'ws')
    const outside = path.join(base, 'outside')
    await mkdir(workspace, { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(path.join(outside, 'secret.txt'), 'TOPSECRET\n', 'utf8')
    await symlink(outside, path.join(workspace, 'evil'))

    process.env.WORKSPACE_ROOT = workspace
    assert.equal(resolveWorkspaceRoot(process.env, 'minimal'), path.resolve(workspace))

    await assert.rejects(
      () =>
        (readFileTool as any).execute(
          { path: 'evil/secret.txt' },
          {} as any,
        ),
      (err: Error) => {
        assert.match(err.message, /路径越界|符号链接/)
        return true
      },
    )
  })

  it('refuses write through symlink directory to outside', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'wb-diy-wsym-'))
    tempRoots.push(base)
    const workspace = path.join(base, 'ws')
    const outside = path.join(base, 'outside')
    await mkdir(workspace, { recursive: true })
    await mkdir(outside, { recursive: true })
    await symlink(outside, path.join(workspace, 'evil'))

    process.env.WORKSPACE_ROOT = workspace

    await assert.rejects(
      () =>
        (writeFileTool as any).execute(
          { path: 'evil/pwned.txt', content: 'pwned\n' },
          {} as any,
        ),
      (err: Error) => {
        assert.match(err.message, /路径越界|符号链接/)
        return true
      },
    )

    // Outside must remain empty of our write.
    await assert.rejects(() => readFile(path.join(outside, 'pwned.txt'), 'utf8'))
  })

  it('allows normal in-workspace read/write with canonical paths', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'wb-diy-ok-'))
    tempRoots.push(workspace)
    process.env.WORKSPACE_ROOT = workspace

    await (writeFileTool as any).execute(
      { path: 'notes/a.md', content: 'hello\n' },
      {} as any,
    )
    const out = await (readFileTool as any).execute(
      { path: 'notes/a.md' },
      {} as any,
    )
    assert.equal(out.content, 'hello\n')

    const abs = await resolveExistingPathWithinRoot(workspace, 'notes/a.md')
    assert.equal(await readFile(abs, 'utf8'), 'hello\n')
    const creatable = await resolveCreatablePathWithinRoot(workspace, 'notes/b.md')
    assert.ok(creatable.startsWith(path.resolve(workspace)))
  })
})
