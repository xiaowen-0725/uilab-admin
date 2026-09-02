import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildWorkbenchSystemPrompt } from '../system-prompt.js'
import {
  INTERACTIVE_ALL_TOOL_NAMES,
  INTERACTIVE_TOOL_INSTRUCTIONS,
} from './interactive-artifact-agent-contract.js'

describe('interactive artifact agent contract (sidecar lock)', () => {
  it('does not inject Layer C into the live system prompt yet', () => {
    const office = buildWorkbenchSystemPrompt({
      profile: 'office',
      workspaceRoot: '/tmp/wb-ia-office',
    })
    const minimal = buildWorkbenchSystemPrompt({
      profile: 'minimal',
      workspaceRoot: '/tmp/wb-ia-minimal',
    })
    assert.equal(office.includes(INTERACTIVE_TOOL_INSTRUCTIONS), false)
    assert.equal(minimal.includes(INTERACTIVE_TOOL_INSTRUCTIONS), false)
    for (const name of INTERACTIVE_ALL_TOOL_NAMES) {
      assert.equal(office.includes(name), false)
      assert.equal(minimal.includes(name), false)
    }
  })
})
