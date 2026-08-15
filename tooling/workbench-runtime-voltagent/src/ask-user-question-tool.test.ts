import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'
import { ASK_TOOL_INSTRUCTIONS, askUserQuestionTool } from './ask-user-question-tool.js'

describe('ask_user_question tool', () => {
  it('is a client-side tool: schema only, no execute, no needsApproval', () => {
    assert.equal(askUserQuestionTool.name, 'ask_user_question')
    assert.match(askUserQuestionTool.description ?? '', /structured multiple-choice/)
    assert.equal(askUserQuestionTool.execute, undefined)
    assert.ok(
      askUserQuestionTool.needsApproval == null ||
        askUserQuestionTool.needsApproval === false,
    )

    const schema = asObjectSchema(z.toJSONSchema(askUserQuestionTool.parameters))
    assert.deepEqual(Object.keys(schema.properties).sort(), [
      'allow_multiple',
      'options',
      'question',
    ])
    assert.ok(
      Array.isArray(schema.required) &&
        schema.required.includes('question') &&
        schema.required.includes('options'),
    )
    assert.equal(asSchemaNode(schema.properties.question).type, 'string')

    const options = asSchemaNode(schema.properties.options)
    assert.equal(options.type, 'array')
    assert.equal(options.minItems, 2)
    const item = asObjectSchema(options.items)
    assert.deepEqual(Object.keys(item.properties).sort(), ['id', 'label'])
    assert.equal(asSchemaNode(item.properties.id).type, 'string')
    assert.equal(asSchemaNode(item.properties.label).type, 'string')
    assert.equal(asSchemaNode(schema.properties.allow_multiple).type, 'boolean')
  })

  it('accepts 2+ options and defaults allow_multiple to false', () => {
    const parsed = askUserQuestionTool.parameters.parse({
      question: '用哪种语气写纪要？',
      options: [
        { id: 'formal', label: '正式' },
        { id: 'casual', label: '轻松' },
      ],
    })
    assert.equal(parsed.question, '用哪种语气写纪要？')
    assert.equal(parsed.allow_multiple, false)
    assert.equal(parsed.options.length, 2)
  })

  it('rejects fewer than two options', () => {
    assert.throws(() =>
      askUserQuestionTool.parameters.parse({
        question: '只有一个选项？',
        options: [{ id: 'only', label: '唯一' }],
      }),
    )
  })

  it('never routes through approval', () => {
    assert.notEqual(askUserQuestionTool.needsApproval, true)
    assert.equal(typeof askUserQuestionTool.execute, 'undefined')
  })

  it('ships usage instructions for both profiles', () => {
    assert.match(ASK_TOOL_INSTRUCTIONS, /ask_user_question/)
    assert.match(ASK_TOOL_INSTRUCTIONS, /exactly one question/)
    assert.match(ASK_TOOL_INSTRUCTIONS, /skipped/)
    assert.match(ASK_TOOL_INSTRUCTIONS, /All questions to the user must go through ask_user_question/)
    assert.match(ASK_TOOL_INSTRUCTIONS, /Final text must not end with an unresolved question/)
  })
})

type JsonObjectSchema = {
  additionalProperties?: unknown
  required?: unknown
  properties: Record<string, unknown>
}

function asSchemaNode(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}

function asObjectSchema(value: unknown): JsonObjectSchema {
  const node = asSchemaNode(value)
  assert.equal(node.type, 'object')
  assert.ok(node.properties && typeof node.properties === 'object')
  return node as JsonObjectSchema
}
