import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildWorkbenchSystemPrompt } from '../system-prompt.js'
import {
  INTERACTIVE_ALL_TOOL_NAMES,
  INTERACTIVE_TOOL_INSTRUCTIONS,
} from './interactive-artifact-agent-contract.js'

describe('interactive artifact agent contract (sidecar lock)', () => {
  it('injects Layer C into office and minimal system prompts', () => {
    const office = buildWorkbenchSystemPrompt({
      profile: 'office',
      workspaceRoot: '/tmp/wb-ia-office',
    })
    const minimal = buildWorkbenchSystemPrompt({
      profile: 'minimal',
      workspaceRoot: '/tmp/wb-ia-minimal',
    })
    assert.equal(office.includes(INTERACTIVE_TOOL_INSTRUCTIONS), true)
    assert.equal(minimal.includes(INTERACTIVE_TOOL_INSTRUCTIONS), true)
    assert.equal(office.includes('interactive_begin'), true)
    assert.equal(office.includes('interactive_commit'), true)
    assert.equal(minimal.includes('interactive_begin'), true)
    assert.equal(minimal.includes('interactive_commit'), true)
    assert.equal(office.includes('Canvas'), false)
    assert.equal(minimal.includes('Canvas'), false)
    assert.equal(INTERACTIVE_ALL_TOOL_NAMES.includes('interactive_append'), true)
  })
})
