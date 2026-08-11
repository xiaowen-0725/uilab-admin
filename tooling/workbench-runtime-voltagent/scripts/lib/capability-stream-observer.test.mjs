import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createToolStreamObserver } from './capability-stream-observer.mjs'

describe('createToolStreamObserver', () => {
  it('ignores tool schema echoes and accepts only the expected successful tool result', () => {
    const observer = createToolStreamObserver({
      toolName: 'execute_command',
      inputMatches: (input) =>
        input?.command === 'lark-cli' && input?.args?.[0] === 'skills',
    })

    observer.observeData(
      JSON.stringify({
        type: 'start-step',
        request: {
          body: {
            messages: [
              {
                role: 'user',
                content: '请调用 execute_command',
              },
            ],
            tools: [
              {
                type: 'function',
                function: { name: 'execute_command' },
              },
            ],
          },
        },
      }),
    )

    assert.equal(observer.summary().expectedToolSucceeded, false)
    assert.equal(observer.summary().sawAnyToolActivity, false)

    observer.observeData(
      JSON.stringify({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'execute_command',
        input: { command: 'lark-cli', args: ['skills', 'list'] },
      }),
    )

    observer.observeData(
      JSON.stringify({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'execute_command',
        input: { command: 'lark-cli', args: ['skills', 'list'] },
        output: { success: true, exit_code: 0, stdout: 'lark-doc' },
      }),
    )

    assert.deepEqual(observer.summary(), {
      expectedToolName: 'execute_command',
      expectedToolCalled: true,
      expectedToolSucceeded: true,
      expectedToolApprovalRequested: false,
      sawAnyToolActivity: true,
      observedToolNames: ['execute_command'],
    })
  })

  it('accepts an exact nested Host approval request but rejects another command', () => {
    const observer = createToolStreamObserver({
      toolName: 'execute_command',
      inputMatches: (input) => input?.command === 'lark-cli',
    })
    observer.observeData(
      JSON.stringify({
        type: 'tool-approval-request',
        approvalId: 'approval-wrong',
        toolCall: {
          toolCallId: 'call-wrong',
          toolName: 'execute_command',
          input: { command: 'git', args: ['status'] },
        },
      }),
    )
    assert.equal(observer.summary().expectedToolApprovalRequested, false)

    observer.observeData(
      JSON.stringify({
        type: 'tool-approval-request',
        approvalId: 'approval-lark',
        toolCall: {
          toolCallId: 'call-lark',
          toolName: 'execute_command',
          input: { command: 'lark-cli', args: ['skills', 'list'] },
        },
      }),
    )
    assert.equal(observer.summary().expectedToolCalled, true)
    assert.equal(observer.summary().expectedToolApprovalRequested, true)
    assert.equal(observer.summary().expectedToolSucceeded, false)
  })
})
