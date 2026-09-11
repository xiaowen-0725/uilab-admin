import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildWorkbenchSystemPrompt } from '../system-prompt.js'
import { INLINE_VISUAL_INSTRUCTIONS } from './inline-visual-agent-contract.js'

describe('inline visual agent contract (sidecar lock)', () => {
  it('injects HTML visual-card writing rules into office and minimal system prompts', () => {
    const office = buildWorkbenchSystemPrompt({
      profile: 'office',
      workspaceRoot: '/tmp/wb-iv-office',
    })
    const minimal = buildWorkbenchSystemPrompt({
      profile: 'minimal',
      workspaceRoot: '/tmp/wb-iv-minimal',
    })
    assert.equal(office.includes(INLINE_VISUAL_INSTRUCTIONS), true)
    assert.equal(minimal.includes(INLINE_VISUAL_INSTRUCTIONS), true)
    assert.match(office, /闭合 visual 围栏/)
    assert.match(office, /不要等用户点名 visual/)
    assert.match(office, /不要用 mermaid subgraph/)
    assert.match(office, /两列/)
    assert.match(office, /interactive_\*/)
    assert.doesNotMatch(office, /show_widget|Visualizer|WorkBuddy|CodeBuddy|Custom visuals/)
    assert.doesNotMatch(minimal, /show_widget|Visualizer|WorkBuddy|CodeBuddy/)
  })
})
