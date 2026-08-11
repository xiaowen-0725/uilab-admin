import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUILTIN_EXPERT_FALLBACK,
  getDefaultExpertSnapshotCatalog,
  getExpertInstruction,
  loadExpertCatalog,
  parseExpertJson,
} from './expert-catalog.js'

const expertsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../experts',
)

describe('expert catalog', () => {
  it('parses expert json and rejects supervisor fields', () => {
    const ok = parseExpertJson(
      {
        schemaVersion: 1,
        id: 'expert.test',
        name: '测试专家',
        skills: ['a'],
        connectors: ['connector.feishu'],
        instruction: 'hello',
      },
      'test.json',
    )
    assert.equal(ok.id, 'expert.test')
    assert.equal(ok.instruction, 'hello')

    assert.throws(
      () =>
        parseExpertJson(
          {
            id: 'x',
            name: 'y',
            subAgents: [],
          },
          'bad.json',
        ),
      /禁止字段/,
    )
  })

  it('loads experts/ directory files', async () => {
    const result = await loadExpertCatalog(expertsDir)
    assert.ok(result.experts.some((e) => e.id === 'expert.office-meeting'))
    assert.ok(result.experts.some((e) => e.id === 'expert.xhs-cover'))
    const meeting = result.experts.find((e) => e.id === 'expert.office-meeting')
    assert.ok(meeting?.instruction)
    assert.deepEqual(meeting?.skills, ['meeting-notes'])
    assert.deepEqual(meeting?.connectors, ['connector.feishu'])
  })

  it('fallback catalog includes office-meeting instruction', () => {
    const snap = getDefaultExpertSnapshotCatalog()
    assert.ok(snap.some((e) => e.id === 'expert.office-meeting'))
    assert.ok(
      getExpertInstruction('expert.office-meeting', BUILTIN_EXPERT_FALLBACK)?.includes(
        '会议纪要',
      ),
    )
  })
})
