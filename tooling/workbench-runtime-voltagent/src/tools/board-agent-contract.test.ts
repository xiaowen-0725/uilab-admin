import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { BOARD_ALL_TOOLS } from './board-policy.js'
import {
  assembleTurnTools,
  BOARD_FEATURE_ID,
  BOARD_INSTRUCTION_SENTENCES,
  BOARD_TOOL_DESCRIPTIONS,
  BOARD_TOOL_INSTRUCTIONS,
} from './board-agent-contract.js'
import {
  JOB_VALIDATOR_CHECK_IDS,
  validateJobSource,
  validateWidgetSource,
  WIDGET_VALIDATOR_CHECK_IDS,
} from './board-validation.js'
import {
  BOARD_WRITING_RULES,
  JOB_WRITING_RULES,
  WIDGET_WRITING_RULES,
} from './board-writing-rules.js'

const skillRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../bundled-skills/board-widget',
)

describe('board agent contract', () => {
  it('keeps every tool description between 200 and 500 characters', () => {
    for (const name of BOARD_ALL_TOOLS) {
      const text = BOARD_TOOL_DESCRIPTIONS[name]
      assert.ok(
        text.length >= 200 && text.length <= 500,
        `${name} description length ${text.length} is outside 200–500`,
      )
    }
  })

  it('adds at most three instruction sentences', () => {
    assert.equal(BOARD_INSTRUCTION_SENTENCES.length, 3)
    assert.equal(
      BOARD_TOOL_INSTRUCTIONS,
      BOARD_INSTRUCTION_SENTENCES.join(' '),
    )
    for (const sentence of BOARD_INSTRUCTION_SENTENCES) {
      assert.match(sentence, /。$/)
    }
  })

  it('exposes board tools only when capabilityFeatureIds includes board', () => {
    const board = BOARD_ALL_TOOLS.map((name) => ({ name }))
    const connectors = [{ name: 'ls' }]
    assert.deepEqual(
      assembleTurnTools({
        connectorTools: connectors,
        resolveBoardTools: () => board,
        selectedFeatureIds: [],
      }).map((tool) => tool.name),
      ['ls'],
    )
    assert.deepEqual(
      assembleTurnTools({
        connectorTools: connectors,
        resolveBoardTools: () => board,
        selectedFeatureIds: [BOARD_FEATURE_ID],
      }).map((tool) => tool.name),
      ['ls', ...BOARD_ALL_TOOLS],
    )
    let resolved = 0
    assembleTurnTools({
      connectorTools: connectors,
      resolveBoardTools: () => {
        resolved += 1
        return board
      },
      selectedFeatureIds: [],
    })
    assert.equal(resolved, 0)
  })
})

describe('board writing-rule homology', () => {
  it('maps every catalog rule to validator checks or marks it uncheckable', () => {
    const widgetChecks = new Set<string>(WIDGET_VALIDATOR_CHECK_IDS)
    const jobChecks = new Set<string>(JOB_VALIDATOR_CHECK_IDS)

    assert.equal(WIDGET_WRITING_RULES.length, 15)
    assert.equal(JOB_WRITING_RULES.length, 7)

    for (const rule of BOARD_WRITING_RULES) {
      if (rule.check === 'uncheckable') {
        assert.deepEqual(rule.checkIds, [], `${rule.id} should have no checks`)
        continue
      }
      assert.ok(rule.checkIds.length > 0, `${rule.id} needs check ids`)
      const pool = rule.layer === 'widget' ? widgetChecks : jobChecks
      for (const checkId of rule.checkIds) {
        assert.ok(pool.has(checkId), `${rule.id} unknown check ${checkId}`)
      }
    }

    const referenced = new Set(
      BOARD_WRITING_RULES.flatMap((rule) => rule.checkIds),
    )
    for (const checkId of [...widgetChecks, ...jobChecks]) {
      assert.ok(referenced.has(checkId), `orphan validator check ${checkId}`)
    }
  })

  it('keeps SKILL.md widget and job rule headings aligned with the catalog', async () => {
    const widgetDoc = await readFile(
      path.join(skillRoot, 'references/widget-rules.md'),
      'utf8',
    )
    const jobDoc = await readFile(
      path.join(skillRoot, 'references/job-runtime.md'),
      'utf8',
    )
    const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8')

    for (const rule of WIDGET_WRITING_RULES) {
      assert.ok(widgetDoc.includes(`### ${rule.id}`), `missing ${rule.id}`)
      if (rule.check === 'uncheckable') {
        assert.ok(
          widgetDoc.includes('无法机器校验'),
          `${rule.id} should be marked uncheckable`,
        )
      }
    }
    for (const rule of JOB_WRITING_RULES) {
      assert.ok(jobDoc.includes(`### ${rule.id}`), `missing ${rule.id}`)
    }
    assert.match(skill, /board_status/)
    assert.match(skill, /board_job_finish/)
    assert.match(jobDoc, /full-access|完全访问/)
    assert.match(jobDoc, /取数作业/)
  })

  it('keeps skill example widgets passing the validator', async () => {
    const tomato = await readFile(
      path.join(skillRoot, 'references/examples/tomato.html'),
      'utf8',
    )
    const fx = await readFile(
      path.join(skillRoot, 'references/examples/fx.html'),
      'utf8',
    )
    const job = await readFile(
      path.join(skillRoot, 'references/examples/fx-job.js'),
      'utf8',
    )
    assert.deepEqual(validateWidgetSource(tomato), { ok: true })
    assert.deepEqual(validateWidgetSource(fx), { ok: true })
    assert.deepEqual(validateJobSource(job), { ok: true })
  })
})
