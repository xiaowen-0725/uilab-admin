import { describe, expect, it } from 'vitest'
import { mapFullStreamChunks, type MapFullStreamContext } from './fullstream-to-envelope'

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
})
