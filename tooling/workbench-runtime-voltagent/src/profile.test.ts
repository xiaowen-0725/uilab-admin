import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  OFFICE_FS_TOOL_NAMES,
  resolveAgentProfile,
  resolveWorkspaceRoot,
  toolsForProfile,
} from './profile.js'

describe('resolveAgentProfile', () => {
  it('defaults to minimal', () => {
    assert.equal(resolveAgentProfile({}), 'minimal')
    assert.equal(resolveAgentProfile({ AGENT_PROFILE: '' }), 'minimal')
  })

  it('selects office when configured', () => {
    assert.equal(resolveAgentProfile({ AGENT_PROFILE: 'office' }), 'office')
    assert.equal(resolveAgentProfile({ AGENT_PROFILE: 'Office' }), 'office')
    assert.equal(resolveAgentProfile({ AGENT_PROFILE: 'cowork' }), 'office')
    assert.equal(
      resolveAgentProfile({ VOLTAGENT_AGENT_PROFILE: 'office' }),
      'office',
    )
  })

  it('falls back to minimal for unknown values', () => {
    assert.equal(resolveAgentProfile({ AGENT_PROFILE: 'coding' }), 'minimal')
  })
})

describe('resolveWorkspaceRoot', () => {
  it('prefers explicit WORKSPACE_ROOT', () => {
    const root = resolveWorkspaceRoot(
      { WORKSPACE_ROOT: '/tmp/office-ws', AGENT_PROFILE: 'office' },
      'office',
      { homeDir: '/Users/demo' },
    )
    assert.equal(root, path.resolve('/tmp/office-ws'))
  })

  it('office without config uses safe home subdirectory, not home itself', () => {
    const root = resolveWorkspaceRoot(
      {},
      'office',
      { homeDir: '/Users/demo' },
    )
    assert.equal(root, path.join('/Users/demo', 'VoltAgent-Office', 'workspace'))
    assert.notEqual(root, '/Users/demo')
  })

  it('office default is never monorepo root or Documents dump', () => {
    const root = resolveWorkspaceRoot(
      {},
      'office',
      { homeDir: '/Users/demo', cwd: '/repo/tooling/workbench-runtime-voltagent' },
    )
    assert.notEqual(root, path.resolve('/repo/tooling/workbench-runtime-voltagent', '../../'))
    assert.notEqual(root, '/Users/demo/Documents')
    assert.match(root, /VoltAgent-Office[/\\]workspace$/)
  })

  it('minimal without config keeps monorepo-relative default from cwd', () => {
    const root = resolveWorkspaceRoot(
      {},
      'minimal',
      { cwd: '/repo/tooling/workbench-runtime-voltagent' },
    )
    assert.equal(root, path.resolve('/repo/tooling/workbench-runtime-voltagent', '../../'))
  })
})

describe('toolsForProfile', () => {
  it('office uses Workspace FS + skills tools, not DIY run_command', () => {
    const tools = toolsForProfile('office')
    assert.ok(tools.includes('ls'))
    assert.ok(tools.includes('read_file'))
    assert.ok(tools.includes('write_file'))
    assert.ok(tools.includes('edit_file'))
    assert.ok(tools.includes('delete_file'))
    assert.ok(tools.includes('workspace_list_skills'))
    assert.ok(tools.includes('workspace_activate_skill'))
    assert.ok(tools.includes('workspace_read_skill'))
    assert.ok(!tools.includes('run_command'))
    for (const name of OFFICE_FS_TOOL_NAMES) {
      assert.ok(tools.includes(name), `missing FS tool ${name}`)
    }
  })

  it('minimal keeps DIY tools', () => {
    const tools = toolsForProfile('minimal')
    assert.deepEqual([...tools], ['read_file', 'write_file', 'run_command'])
  })
})
