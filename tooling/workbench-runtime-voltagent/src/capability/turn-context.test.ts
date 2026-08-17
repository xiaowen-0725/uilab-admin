import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CAPABILITY_CONNECTOR_IDS_CONTEXT_KEY,
  CAPABILITY_FEATURE_IDS_CONTEXT_KEY,
  readCapabilityTurnContext,
} from './turn-context.js'

describe('readCapabilityTurnContext', () => {
  it('reads capabilityFeatureIds and ignores malformed values', () => {
    const context = new Map<string, unknown>([
      [CAPABILITY_CONNECTOR_IDS_CONTEXT_KEY, ['connector.feishu', '']],
      [CAPABILITY_FEATURE_IDS_CONTEXT_KEY, ['board', 'board', '  ']],
    ])
    assert.deepEqual(readCapabilityTurnContext({ context } as never), {
      taskId: null,
      selectedConnectorIds: ['connector.feishu'],
      selectedFeatureIds: ['board'],
    })
  })

  it('projects missing feature ids to an empty list', () => {
    assert.deepEqual(readCapabilityTurnContext(undefined), {
      taskId: null,
      selectedConnectorIds: [],
      selectedFeatureIds: [],
    })
  })
})
