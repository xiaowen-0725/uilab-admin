import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_VOLTAGENT_MODEL,
  resolveModelApiSurface,
  resolveModelId,
} from './model.js'

describe('resolveModelId', () => {
  it('defaults to deepseek-v4-flash', () => {
    assert.equal(resolveModelId({}), DEFAULT_VOLTAGENT_MODEL)
    assert.equal(resolveModelId({}), 'deepseek-v4-flash')
  })

  it('honors VOLTAGENT_MODEL override', () => {
    assert.equal(
      resolveModelId({ VOLTAGENT_MODEL: 'deepseek-v4-pro' }),
      'deepseek-v4-pro',
    )
    assert.equal(
      resolveModelId({ VOLTAGENT_MODEL: 'deepseek-chat' }),
      'deepseek-chat',
    )
  })
})

describe('resolveModelApiSurface', () => {
  it('defaults to chat for multi-step tool stability', () => {
    assert.equal(resolveModelApiSurface({}), 'chat')
    assert.equal(resolveModelApiSurface({ VOLTAGENT_MODEL_API: '' }), 'chat')
  })

  it('allows responses when explicitly configured', () => {
    assert.equal(
      resolveModelApiSurface({ VOLTAGENT_MODEL_API: 'responses' }),
      'responses',
    )
  })
})
