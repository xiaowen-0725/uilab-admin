import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  DEFAULT_MINIMAL_MAX_STEPS,
  DEFAULT_OFFICE_MAX_STEPS,
  resolveAgentMemory,
  resolveMaxSteps,
  resolveOfficeRuntimeDefaults,
  resolveSummarization,
} from './office-runtime-defaults.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('resolveMaxSteps', () => {
  it('office default is at least 50 and in recommended band', () => {
    const n = resolveMaxSteps('office', {})
    assert.equal(n, DEFAULT_OFFICE_MAX_STEPS)
    assert.ok(n >= 50)
    assert.ok(n >= 80 && n <= 100)
  })

  it('minimal keeps a short budget', () => {
    assert.equal(resolveMaxSteps('minimal', {}), DEFAULT_MINIMAL_MAX_STEPS)
  })

  it('honors override and env', () => {
    assert.equal(resolveMaxSteps('office', {}, 40), 40)
    assert.equal(resolveMaxSteps('office', { VOLTAGENT_MAX_STEPS: '100' }), 100)
  })
})

describe('resolveSummarization', () => {
  it('office enables summarization by default', () => {
    const s = resolveSummarization('office', {})
    assert.notEqual(s, false)
    if (s !== false) {
      assert.equal(s.enabled, true)
      assert.ok((s.triggerTokens ?? 0) >= 10_000)
    }
  })

  it('can disable via env', () => {
    assert.equal(resolveSummarization('office', { VOLTAGENT_SUMMARIZATION: 'off' }), false)
  })

  it('minimal leaves summarization off', () => {
    assert.equal(resolveSummarization('minimal', {}), false)
  })
})

describe('resolveAgentMemory', () => {
  it('office defaults to libsql under workspace', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-o5-mem-'))
    tempRoots.push(root)
    const { memory, memoryKind } = await resolveAgentMemory('office', {}, root)
    assert.equal(memoryKind, 'libsql')
    assert.notEqual(memory, false)
  })

  it('office can use in-memory', async () => {
    const { memoryKind } = await resolveAgentMemory('office', {
      VOLTAGENT_MEMORY: 'in-memory',
    })
    assert.equal(memoryKind, 'in-memory')
  })

  it('office can disable memory', async () => {
    const { memory, memoryKind } = await resolveAgentMemory('office', {
      VOLTAGENT_MEMORY: 'off',
    })
    assert.equal(memoryKind, 'disabled')
    assert.equal(memory, false)
  })
})

describe('resolveOfficeRuntimeDefaults', () => {
  it('bundles maxSteps + summarization + memory for office', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-o5-def-'))
    tempRoots.push(root)
    const d = await resolveOfficeRuntimeDefaults('office', {
      VOLTAGENT_MEMORY: 'in-memory',
    }, { workspaceRoot: root })
    assert.equal(d.maxSteps, DEFAULT_OFFICE_MAX_STEPS)
    assert.notEqual(d.summarization, false)
    assert.equal(d.memoryKind, 'in-memory')
  })
})
