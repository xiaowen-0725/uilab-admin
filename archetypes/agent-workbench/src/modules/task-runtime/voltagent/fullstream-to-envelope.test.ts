import { describe, expect, it } from 'vitest'
import {
  mapFullStreamChunk,
  mapFullStreamChunks,
  type MapFullStreamContext,
} from './fullstream-to-envelope'

const baseCtx = (): MapFullStreamContext => ({
  projectId: 'proj-1',
  taskId: 'task-1',
  turnId: 'turn-1',
  runId: 'run-1',
  nextSequence: 1,
  schemaVersion: 1,
  nowIso: () => '2026-08-05T00:00:00.000Z',
  eventIdPrefix: 'test',
})

describe('mapFullStreamChunks', () => {
  it('keeps tool-error on the original tool call id', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        { type: 'tool-call', toolCallId: 'call-err', toolName: 'read_file' },
        {
          type: 'tool-error',
          toolCallId: 'call-err',
          toolName: 'read_file',
          error: 'not found',
        },
      ],
      baseCtx(),
    )

    expect(envelopes.map((event) => event.eventType)).toEqual([
      'tool.called',
      'tool.completed',
    ])
    expect(envelopes[1]?.payload).toMatchObject({
      toolId: 'call-err',
      toolCallId: 'call-err',
      isError: true,
      summary: 'not found',
    })
  })

  it('maps text stream to output deltas and run.completed', () => {
    const { envelopes, nextSequence } = mapFullStreamChunks(
      [
        { type: 'start' },
        { type: 'text-delta', delta: '你' },
        { type: 'text-delta', delta: '好' },
        { type: 'text-end', content: '你好' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 3 } },
      ],
      baseCtx(),
    )

    const types = envelopes.map((e) => e.eventType)
    expect(types).toEqual([
      'run.started',
      'output.delta',
      'output.delta',
      'output.completed',
      'run.completed',
    ])
    expect(envelopes[1]?.payload).toMatchObject({ text: '你' })
    expect(envelopes[1]?.payload).not.toHaveProperty('phase')
    expect(envelopes[3]?.payload).not.toHaveProperty('phase')
    expect(envelopes[0]?.taskSequence).toBe(1)
    expect(envelopes[4]?.taskSequence).toBe(5)
    expect(nextSequence).toBe(6)
    expect(envelopes.every((e) => e.taskId === 'task-1' && e.runId === 'run-1')).toBe(
      true,
    )
  })

  it('maps reasoning and tool call/result', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        { type: 'reasoning-start', id: 'r1' },
        { type: 'reasoning-delta', delta: '想一下' },
        { type: 'reasoning-end', id: 'r1' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'read_file',
          args: { path: 'README.md' },
        },
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'read_file',
          output: { content: 'hi' },
        },
      ],
      baseCtx(),
    )
    const types = envelopes.map((e) => e.eventType)
    expect(types).toEqual([
      'reasoning.started',
      'reasoning.delta',
      'reasoning.completed',
      'tool.called',
      'tool.completed',
    ])
    // Projection merges on payload.toolId — must be stable across call/result.
    expect(envelopes[3]?.payload).toMatchObject({ toolId: 'c1', name: 'read_file' })
    expect(envelopes[4]?.payload).toMatchObject({ toolId: 'c1' })
  })

  it('normalizes read_file output into summary for Timeline expansion', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'r1',
          toolName: 'read_file',
          args: { path: '/notes/plan.txt' },
        },
        {
          type: 'tool-result',
          toolCallId: 'r1',
          toolName: 'read_file',
          output: { content: 'phase 1 plan\nnext steps', bytes: 24 },
        },
      ],
      baseCtx(),
    )
    const completed = envelopes.find((e) => e.eventType === 'tool.completed')
    expect(completed?.payload).toMatchObject({
      toolId: 'r1',
      summary: expect.stringContaining('phase 1 plan'),
      output: { content: 'phase 1 plan\nnext steps', bytes: 24 },
    })
    const payload = completed?.payload as { items?: string[] }
    // Multi-line content → expandable items
    expect(payload.items).toEqual(['phase 1 plan', 'next steps'])
  })

  it('redacts secret-shaped strings in envelope output residual', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-result',
          toolCallId: 'sec1',
          toolName: 'read_file',
          output: { content: 'token=super-secret-value\nline2' },
        },
      ],
      baseCtx(),
    )
    const completed = envelopes.find((e) => e.eventType === 'tool.completed')
    const payload = completed?.payload as {
      summary?: string
      items?: string[]
      output?: { content?: string }
    }
    const blob = JSON.stringify(payload)
    expect(blob).not.toMatch(/super-secret-value/)
    expect(blob).toMatch(/\[redacted\]/)
  })

  it('normalizes ls string listing into items', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'ls1',
          toolName: 'ls',
          args: { path: '/' },
        },
        {
          type: 'tool-result',
          toolCallId: 'ls1',
          toolName: 'ls',
          output: '/notes/ (directory)\n/output/ (directory)',
        },
      ],
      baseCtx(),
    )
    const completed = envelopes.find((e) => e.eventType === 'tool.completed')
    expect(completed?.payload).toMatchObject({
      toolId: 'ls1',
      items: ['/notes/ (directory)', '/output/ (directory)'],
    })
  })

  it('maps write tool result to tool.completed + file.changed', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'w1',
          toolName: 'write_file',
          args: { path: 'flychess/README.md', content: 'x' },
        },
        {
          type: 'tool-result',
          toolCallId: 'w1',
          toolName: 'write_file',
          args: { path: 'flychess/README.md' },
          output: { path: 'flychess/README.md', additions: 10, deletions: 0 },
        },
      ],
      baseCtx(),
    )
    const types = envelopes.map((e) => e.eventType)
    expect(types).toEqual(['tool.called', 'tool.completed', 'file.changed'])
    expect(envelopes[2]?.payload).toMatchObject({
      path: 'flychess/README.md',
      additions: 10,
    })
  })

  it('maps Workspace FS write tools using file_path → file.changed', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'w2',
          toolName: 'write_file',
          args: { file_path: '/notes/memo.md', content: 'hello' },
        },
        {
          type: 'tool-result',
          toolCallId: 'w2',
          toolName: 'write_file',
          args: { file_path: '/notes/memo.md' },
          output: { path: '/notes/memo.md', bytes: 5 },
        },
        {
          type: 'tool-call',
          toolCallId: 'e1',
          toolName: 'edit_file',
          args: {
            file_path: '/notes/memo.md',
            old_string: 'hello',
            new_string: 'hello world',
          },
        },
        {
          type: 'tool-result',
          toolCallId: 'e1',
          toolName: 'edit_file',
          args: { file_path: '/notes/memo.md' },
          output: { path: '/notes/memo.md' },
        },
        {
          type: 'tool-call',
          toolCallId: 'd1',
          toolName: 'delete_file',
          args: { file_path: '/notes/old.md' },
        },
        {
          type: 'tool-result',
          toolCallId: 'd1',
          toolName: 'delete_file',
          args: { file_path: '/notes/old.md' },
          output: { path: '/notes/old.md' },
        },
      ],
      baseCtx(),
    )
    const types = envelopes.map((e) => e.eventType)
    expect(types).toEqual([
      'tool.called',
      'tool.completed',
      'file.changed',
      'tool.called',
      'tool.completed',
      'file.changed',
      'tool.called',
      'tool.completed',
      'file.changed',
    ])
    expect(envelopes[2]?.payload).toMatchObject({
      path: '/notes/memo.md',
      toolName: 'write_file',
    })
    expect(envelopes[5]?.payload).toMatchObject({
      path: '/notes/memo.md',
      toolName: 'edit_file',
    })
    expect(envelopes[8]?.payload).toMatchObject({
      path: '/notes/old.md',
      toolName: 'delete_file',
    })
  })

  it('keeps Chinese CLI login hints on auth_revoked tool results for Timeline', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'auth1',
          toolName: 'github__search',
          args: { q: 'uilab' },
        },
        {
          type: 'tool-result',
          toolCallId: 'auth1',
          toolName: 'github__search',
          isError: true,
          output: {
            ok: false,
            error: 'auth_revoked',
            hint: '需先完成领域 CLI 登录（cli_session），例如：lark-cli auth login',
          },
        },
      ],
      baseCtx(),
    )
    const completed = envelopes.find((e) => e.eventType === 'tool.completed')
    expect(completed?.payload).toMatchObject({
      isError: true,
      summary: expect.stringMatching(/需先完成领域 CLI 登录/),
    })
  })

  it('maps Workspace FS read tools (ls / list_tree) as expandable tool rows', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'ls1',
          toolName: 'ls',
          args: { path: '/' },
        },
        {
          type: 'tool-result',
          toolCallId: 'ls1',
          toolName: 'ls',
          output: [{ path: '/notes', is_dir: true }],
        },
        {
          type: 'tool-call',
          toolCallId: 'lt1',
          toolName: 'list_tree',
          args: { path: '/notes' },
        },
        {
          type: 'tool-result',
          toolCallId: 'lt1',
          toolName: 'list_tree',
          output: { entries: ['memo.md'] },
        },
      ],
      baseCtx(),
    )
    expect(envelopes.map((e) => e.eventType)).toEqual([
      'tool.called',
      'tool.completed',
      'tool.called',
      'tool.completed',
    ])
    expect(envelopes[0]?.payload).toMatchObject({
      toolId: 'ls1',
      toolName: 'ls',
      name: 'ls',
    })
    expect(envelopes[2]?.payload).toMatchObject({
      toolId: 'lt1',
      toolName: 'list_tree',
    })
  })

  it('maps update_plan tool-call to plan.updated and renames plan to steps', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'plan-1',
          toolName: 'update_plan',
          args: {
            explanation: '先拆出鉴权',
            plan: [
              { step: '调研 OpenAPI', status: 'completed' },
              { step: '实现参数装配', status: 'in_progress' },
            ],
          },
        },
      ],
      baseCtx(),
    )
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]?.eventType).toBe('plan.updated')
    expect(envelopes[0]?.payload).toEqual({
      explanation: '先拆出鉴权',
      steps: [
        { step: '调研 OpenAPI', status: 'completed' },
        { step: '实现参数装配', status: 'in_progress' },
      ],
    })
  })

  it('suppresses the matching update_plan tool-result', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'plan-1',
          toolName: 'update_plan',
          args: {
            plan: [{ step: '调研 OpenAPI', status: 'in_progress' }],
          },
        },
        {
          type: 'tool-result',
          toolCallId: 'plan-1',
          toolName: 'update_plan',
          output: 'Plan updated. Continue to keep it updated as you progress.',
        },
        {
          type: 'tool-call',
          toolCallId: 'read-1',
          toolName: 'read_file',
          args: { path: 'README.md' },
        },
        {
          type: 'tool-result',
          toolCallId: 'read-1',
          toolName: 'read_file',
          output: { content: 'ok' },
        },
      ],
      baseCtx(),
    )
    expect(envelopes.map((event) => event.eventType)).toEqual([
      'plan.updated',
      'tool.called',
      'tool.completed',
    ])
  })

  it('maps update_plan tool-error to a warning row', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'plan-err',
          toolName: 'update_plan',
          args: { plan: [{ step: '调研', status: 'pending' }] },
        },
        {
          type: 'tool-error',
          toolCallId: 'plan-err',
          toolName: 'update_plan',
          error: 'sidecar unavailable',
        },
      ],
      baseCtx(),
    )
    expect(envelopes.map((event) => event.eventType)).toEqual([
      'plan.updated',
      'warning',
    ])
    expect(envelopes[1]?.payload).toMatchObject({
      title: '计划更新失败',
      message: 'sidecar unavailable',
      toolCallId: 'plan-err',
    })
  })

  it('maps update_plan tool-result isError to a warning without tool.completed', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'plan-fail',
          toolName: 'update_plan',
          args: { plan: [{ step: '调研', status: 'pending' }] },
        },
        {
          type: 'tool-result',
          toolCallId: 'plan-fail',
          toolName: 'update_plan',
          isError: true,
          output: { message: 'handler exploded' },
        },
      ],
      baseCtx(),
    )
    expect(envelopes.map((event) => event.eventType)).toEqual([
      'plan.updated',
      'warning',
    ])
    expect(envelopes[1]?.payload).toMatchObject({
      title: '计划更新失败',
      message: 'handler exploded',
      toolCallId: 'plan-fail',
    })
  })

  it('maps update_plan tool-error without a message to a Chinese warning', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'plan-blank',
          toolName: 'update_plan',
          args: { plan: [{ step: '调研', status: 'pending' }] },
        },
        {
          type: 'tool-error',
          toolCallId: 'plan-blank',
          toolName: 'update_plan',
        },
      ],
      baseCtx(),
    )
    expect(envelopes.map((event) => event.eventType)).toEqual([
      'plan.updated',
      'warning',
    ])
    expect(envelopes[1]?.payload).toMatchObject({
      title: '计划更新失败',
      message: '未知错误',
      toolCallId: 'plan-blank',
    })
  })

  it('remembers update_plan call ids across one-chunk mapper calls', () => {
    const ctx = { ...baseCtx(), updatePlanCallIds: new Set<string>() }
    const call = mapFullStreamChunk(
      {
        type: 'tool-call',
        toolCallId: 'plan-live',
        toolName: 'update_plan',
        input: {
          plan: [{ step: '写测试', status: 'in_progress' }],
        },
      },
      ctx,
    )
    const result = mapFullStreamChunk(
      {
        type: 'tool-result',
        toolCallId: 'plan-live',
        toolName: 'update_plan',
        output: 'Plan updated.',
      },
      { ...ctx, nextSequence: call.nextSequence },
    )
    expect(call.envelopes.map((event) => event.eventType)).toEqual([
      'plan.updated',
    ])
    expect(result.envelopes).toEqual([])
  })

  it('maps bash tool to command.* events', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'b1',
          toolName: 'bash',
          args: { command: 'ls' },
        },
        {
          type: 'tool-result',
          toolCallId: 'b1',
          toolName: 'bash',
          output: 'file.txt',
        },
      ],
      baseCtx(),
    )
    expect(envelopes.map((e) => e.eventType)).toEqual([
      'command.started',
      'command.completed',
    ])
    expect(envelopes[0]?.payload).toMatchObject({ commandId: 'b1' })
    expect(envelopes[1]?.payload).toMatchObject({
      commandId: 'b1',
      summary: 'file.txt',
    })
  })

  it('maps abort and error; ignores unknown types', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        { type: 'weird-future-chunk', foo: 1 },
        { type: 'abort', reason: 'user' },
        { type: 'error', message: 'boom' },
      ],
      baseCtx(),
    )
    expect(envelopes.map((e) => e.eventType)).toEqual([
      'run.cancelled',
      'run.failed',
    ])
  })

  it('preserves a nested Runtime error message instead of showing the generic fallback', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'error',
          error: { message: '模型在工具结果后失败' },
        },
      ],
      baseCtx(),
    )

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]?.eventType).toBe('run.failed')
    expect(envelopes[0]?.payload).toMatchObject({
      message: '模型在工具结果后失败',
    })
  })

  it('extracts the provider message from a structured-cloned AI_APICallError', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'error',
          error: {
            name: 'AI_APICallError',
            data: {
              error: {
                message:
                  'The `reasoning_content` in the thinking mode must be passed back to the API.',
              },
            },
          },
        },
      ],
      baseCtx(),
    )

    expect(envelopes[0]?.payload).toMatchObject({
      message:
        'The `reasoning_content` in the thinking mode must be passed back to the API.',
    })
  })

  it('extracts only the error message from an AI API responseBody', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'error',
          error: {
            name: 'AI_APICallError',
            responseBody: JSON.stringify({
              error: { message: '模型服务暂时不可用' },
              request: { authorization: 'must-not-render' },
            }),
          },
        },
      ],
      baseCtx(),
    )

    expect(envelopes[0]?.payload).toMatchObject({
      message: '模型服务暂时不可用',
    })
  })

  it('maps approval-requested chunk', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'approval-requested',
          requestId: 'apr-1',
          toolName: 'runCommand',
          args: { command: 'rm -rf /' },
        },
      ],
      baseCtx(),
    )
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]?.eventType).toBe('approval.requested')
    expect(envelopes[0]?.payload).toMatchObject({ requestId: 'apr-1' })
  })

  it('maps VoltAgent tool-approval-request with approvalId + nested toolCall', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-approval-request',
          approvalId: 'aitxt-ilSmfiRwHF67JtJApUd3AZzn',
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call_00_Ss4oNw3scombo8SKSyY79591',
            toolName: 'write_file',
            input: {
              file_path: '/output/o1-smoke-note.md',
              content: 'O1 smoke hello',
              overwrite: true,
            },
          },
        },
      ],
      baseCtx(),
    )
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]?.eventType).toBe('approval.requested')
    expect(envelopes[0]?.payload).toMatchObject({
      requestId: 'aitxt-ilSmfiRwHF67JtJApUd3AZzn',
      toolName: 'write_file',
      toolCallId: 'call_00_Ss4oNw3scombo8SKSyY79591',
      args: {
        file_path: '/output/o1-smoke-note.md',
        content: 'O1 smoke hello',
      },
    })
  })

  it('maps ask_user_question tool-call to run.input_requested without tool.called', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'call-ask-1',
          toolName: 'ask_user_question',
          args: {
            question: '用哪种语气写纪要？',
            options: [
              { id: 'formal', label: '正式' },
              { id: 'casual', label: '轻松' },
            ],
            allow_multiple: false,
          },
        },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
      baseCtx(),
    )
    expect(envelopes.map((event) => event.eventType)).toEqual([
      'run.input_requested',
      'run.completed',
    ])
    expect(envelopes[0]?.payload).toMatchObject({
      requestId: 'call-ask-1',
      question: '用哪种语气写纪要？',
      options: [
        { id: 'formal', label: '正式' },
        { id: 'casual', label: '轻松' },
      ],
      allowMultiple: false,
    })
  })

  it('maps tool-output-denied to a denied tool terminal', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-output-denied',
          toolCallId: 'call-deny',
          toolName: 'write_file',
          error: 'user denied',
        },
      ],
      baseCtx(),
    )
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]?.eventType).toBe('tool.completed')
    expect(envelopes[0]?.payload).toMatchObject({
      toolCallId: 'call-deny',
      toolName: 'write_file',
      status: 'denied',
      isError: true,
    })
  })
})
