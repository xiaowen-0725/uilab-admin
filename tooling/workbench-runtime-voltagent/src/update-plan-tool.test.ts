import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { z } from 'zod'
import { updatePlanTool } from './update-plan-tool.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('update_plan tool', () => {
  it('matches the Codex-shaped strict schema', () => {
    assert.equal(updatePlanTool.name, 'update_plan')
    assert.equal(
      updatePlanTool.description,
      'Updates the task plan. Provide an optional explanation and a list of plan items, each with a step and status. At most one step can be in_progress at a time.',
    )
    assert.equal(updatePlanTool.needsApproval, false)

    const schema = asObjectSchema(z.toJSONSchema(updatePlanTool.parameters))
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(schema.required, ['plan'])
    assert.deepEqual(Object.keys(schema.properties).sort(), [
      'explanation',
      'plan',
    ])
    assert.equal(asSchemaNode(schema.properties.explanation).type, 'string')

    const plan = asSchemaNode(schema.properties.plan)
    assert.equal(plan.type, 'array')
    const item = asObjectSchema(plan.items)
    assert.equal(item.additionalProperties, false)
    assert.deepEqual(item.required, ['step', 'status'])
    const step = asSchemaNode(item.properties.step)
    assert.equal(step.type, 'string')
    assert.equal(step.minLength, 1)
    assert.deepEqual(asSchemaNode(item.properties.status).enum, [
      'pending',
      'in_progress',
      'completed',
    ])
  })

  it('accepts an empty plan and rejects empty steps or unknown fields', () => {
    const parsed = updatePlanTool.parameters.parse({
      explanation: 'reordered after review',
      plan: [],
    })
    assert.deepEqual(parsed, {
      explanation: 'reordered after review',
      plan: [],
    })

    assert.throws(() =>
      updatePlanTool.parameters.parse({
        plan: [{ step: '', status: 'pending' }],
      }),
    )
    assert.throws(() =>
      updatePlanTool.parameters.parse({
        plan: [],
        extra: true,
      }),
    )
    assert.throws(() =>
      updatePlanTool.parameters.parse({
        plan: [{ step: 'Draft outline', status: 'pending', extra: true }],
      }),
    )
  })

  it('returns guidance text without touching the filesystem', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'wb-update-plan-'))
    tempRoots.push(workspace)
    process.env.WORKSPACE_ROOT = workspace
    await writeFile(path.join(workspace, 'sentinel.txt'), 'keep\n', 'utf8')
    const before = await readdir(workspace, { recursive: true })

    const result = await updatePlanTool.execute?.(
      {
        explanation: 'started the first step',
        plan: [
          { step: '收集素材', status: 'in_progress' },
          { step: '起草纪要', status: 'pending' },
        ],
      },
      {} as never,
    )

    assert.equal(
      result,
      'Plan updated. Continue to keep it updated as you progress.',
    )
    const after = await readdir(workspace, { recursive: true })
    assert.deepEqual(after, before)
    delete process.env.WORKSPACE_ROOT
  })
})

function asSchemaNode(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}

function asObjectSchema(value: unknown): {
  additionalProperties?: unknown
  required?: unknown
  properties: Record<string, unknown>
} {
  const node = asSchemaNode(value)
  assert.equal(node.type, 'object')
  assert.ok(node.properties && typeof node.properties === 'object')
  return node as {
    additionalProperties?: unknown
    required?: unknown
    properties: Record<string, unknown>
  }
}
