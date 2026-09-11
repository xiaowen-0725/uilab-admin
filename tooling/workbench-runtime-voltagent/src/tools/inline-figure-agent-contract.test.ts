import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildWorkbenchSystemPrompt } from '../system-prompt.js'
import { INLINE_FIGURE_INSTRUCTIONS } from './inline-figure-agent-contract.js'

describe('inline figure agent contract (sidecar lock)', () => {
  it('injects mermaid writing rules into office and minimal system prompts', () => {
    const office = buildWorkbenchSystemPrompt({
      profile: 'office',
      workspaceRoot: '/tmp/wb-if-office',
    })
    const minimal = buildWorkbenchSystemPrompt({
      profile: 'minimal',
      workspaceRoot: '/tmp/wb-if-minimal',
    })
    assert.equal(office.includes(INLINE_FIGURE_INSTRUCTIONS), true)
    assert.equal(minimal.includes(INLINE_FIGURE_INSTRUCTIONS), true)
    assert.match(office, /闭合的 mermaid 围栏/)
    assert.match(office, /不要等用户点名 mermaid/)
    assert.match(office, /不要用 mermaid subgraph 做对比卡/)
    assert.match(office, /不要用 svg 围栏/)
    assert.match(office, /interactive_\*/)
    assert.doesNotMatch(office, /show_widget|Visualizer|WorkBuddy|CodeBuddy/)
    assert.doesNotMatch(minimal, /show_widget|Visualizer|WorkBuddy|CodeBuddy/)
  })
})
