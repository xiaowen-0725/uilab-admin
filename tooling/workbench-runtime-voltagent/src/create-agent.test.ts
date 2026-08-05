import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  createWorkbenchAgent,
  officeFilesystemToolConfig,
} from './create-agent.js'
import { OFFICE_WORKSPACE_README_NAME } from './workspace-root.js'

/** Stub model — never called; only needed to construct Agent. */
const stubModel = {
  modelId: 'stub',
  provider: 'stub',
  specificationVersion: 'v2',
  supportedUrls: {},
  doGenerate: async () => {
    throw new Error('stub model must not be called')
  },
  doStream: async () => {
    throw new Error('stub model must not be called')
  },
} as any

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('officeFilesystemToolConfig', () => {
  it('requires approval for write/edit/delete, not for default reads', () => {
    const cfg = officeFilesystemToolConfig()
    assert.equal(cfg.filesystem.defaults.needsApproval, false)
    assert.equal(cfg.filesystem.tools.write_file.needsApproval, true)
    assert.equal(cfg.filesystem.tools.edit_file.needsApproval, true)
    assert.equal(cfg.filesystem.tools.delete_file.needsApproval, true)
    assert.equal(cfg.filesystem.tools.rmdir.needsApproval, true)
  })
})

describe('createWorkbenchAgent', () => {
  it('office profile mounts Workspace FS and does not use DIY run_command', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-office-'))
    tempRoots.push(root)

    const bundle = await createWorkbenchAgent({
      profile: 'office',
      model: stubModel,
      workspaceRoot: root,
      maxSteps: 20,
    })

    assert.equal(bundle.profile, 'office')
    assert.equal(bundle.workspaceRoot, root)
    assert.ok(bundle.workspace, 'workspace instance present')
    assert.ok(bundle.tools.includes('ls'))
    assert.ok(bundle.tools.includes('write_file'))
    assert.ok(!bundle.tools.includes('run_command'))

    // O2 first-run bootstrap
    const readmePath = path.join(root, OFFICE_WORKSPACE_README_NAME)
    await access(readmePath)
    const readme = await readFile(readmePath, 'utf8')
    assert.match(readme, /WORKSPACE_ROOT/)

    // Agent carries workspace identity; tool names come from Workspace toolkit.
    assert.equal(bundle.agent.id, 'workbench')
    const fullState = await bundle.agent.getFullState()
    const toolNames = (fullState.tools ?? []).map(
      (t: { name?: string }) => t.name,
    )
    assert.ok(
      toolNames.includes('read_file') || toolNames.includes('ls'),
      `expected Workspace FS tools, got: ${toolNames.join(',')}`,
    )
    assert.ok(
      !toolNames.includes('run_command'),
      'DIY run_command must not be primary tools in office profile',
    )
  })

  it('minimal profile keeps DIY tools without Workspace', async () => {
    const bundle = await createWorkbenchAgent({
      profile: 'minimal',
      model: stubModel,
      workspaceRoot: '/tmp/unused-minimal-root',
      maxSteps: 8,
    })

    assert.equal(bundle.profile, 'minimal')
    assert.equal(bundle.workspace, undefined)
    assert.deepEqual([...bundle.tools], [
      'read_file',
      'write_file',
      'run_command',
    ])

    const fullState = await bundle.agent.getFullState()
    const toolNames = (fullState.tools ?? []).map(
      (t: { name?: string }) => t.name,
    )
    assert.ok(toolNames.includes('read_file'))
    assert.ok(toolNames.includes('write_file'))
    assert.ok(toolNames.includes('run_command'))
  })
})
