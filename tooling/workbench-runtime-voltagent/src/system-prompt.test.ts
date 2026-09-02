import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { ASK_TOOL_INSTRUCTIONS } from './ask-user-question-tool.js'
import { buildWorkbenchSystemPrompt } from './system-prompt.js'
import { BOARD_TOOL_INSTRUCTIONS } from './tools/board-agent-contract.js'
import { INTERACTIVE_TOOL_INSTRUCTIONS } from './tools/interactive-artifact-agent-contract.js'
import { PLAN_TOOL_INSTRUCTIONS } from './update-plan-tool.js'

const tempRoots: string[] = []

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('buildWorkbenchSystemPrompt', () => {
  it('names UI Lab Agent Workbench and keeps plan / question / board contracts', () => {
    const prompt = buildWorkbenchSystemPrompt({
      profile: 'office',
      workspaceRoot: '/tmp/wb-prompt-office',
      env: { SHELL: '/bin/zsh' } as NodeJS.ProcessEnv,
      now: new Date('2026-08-25T12:00:00Z'),
      skillInstruction: 'Office skills live under /skills (meeting-notes).',
      mcpInstruction:
        'MCP docs/calendar connectors are not connected in this session.',
    })

    assert.match(prompt, /You are UI Lab Agent Workbench/)
    assert.match(prompt, /Respond in Chinese/)
    assert.match(prompt, /local VoltAgent sidecar/)
    assert.match(prompt, /execute_command/)
    assert.match(prompt, /virtual workspace paths/)
    assert.match(prompt, /Office skills live under \/skills/)
    assert.match(prompt, /MCP docs\/calendar connectors are not connected/)
    assert.ok(prompt.includes(PLAN_TOOL_INSTRUCTIONS))
    assert.ok(prompt.includes(ASK_TOOL_INSTRUCTIONS))
    assert.ok(prompt.includes(BOARD_TOOL_INSTRUCTIONS))
    assert.ok(prompt.includes(INTERACTIVE_TOOL_INSTRUCTIONS))
    assert.match(prompt, /Working directory: \/tmp\/wb-prompt-office/)
    assert.match(prompt, /Default shell: \/bin\/zsh/)
    assert.match(prompt, /Profile is office/)
    assert.doesNotMatch(prompt, /CodeBuddy|WorkBuddy|cnb\.cool|TaskCreate|AskUserQuestion|WebFetch|\/help/)
  })

  it('uses DIY tools for minimal and does not claim execute_command', () => {
    const prompt = buildWorkbenchSystemPrompt({
      profile: 'minimal',
      workspaceRoot: '/tmp/wb-prompt-minimal',
      now: new Date('2026-08-25T12:00:00Z'),
    })

    assert.match(prompt, /You are UI Lab Agent Workbench/)
    assert.match(prompt, /read_file, write_file/)
    assert.match(prompt, /run_command/)
    assert.match(prompt, /Profile is minimal/)
    assert.doesNotMatch(prompt, /execute_command/)
    assert.ok(prompt.includes(PLAN_TOOL_INSTRUCTIONS))
    assert.ok(prompt.includes(ASK_TOOL_INSTRUCTIONS))
    assert.ok(prompt.includes(BOARD_TOOL_INSTRUCTIONS))
    assert.ok(prompt.includes(INTERACTIVE_TOOL_INSTRUCTIONS))
  })

  it('marks a workspace with .git as a git repo', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wb-prompt-git-'))
    tempRoots.push(root)
    await mkdir(path.join(root, '.git'))

    const prompt = buildWorkbenchSystemPrompt({
      profile: 'office',
      workspaceRoot: root,
    })

    assert.match(prompt, /Is directory a git repo: Yes/)
  })
})
