/**
 * liveStatus + file-change meta projection (Codex Task Pane gold).
 */
import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { mapFullStreamChunks } from '../runtime/voltagent/fullstream-to-envelope'
import { emptyProjectionState } from './empty-read-model'
import { applyRuntimeEvent, projectEvents } from './project-events'

function mk(
  seq: number,
  type: string,
  payload: unknown,
  runId = 'run-1',
  occurredAt = `1970-01-01T00:00:0${Math.min(seq, 9)}.000Z`,
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${seq}`,
    eventType: type,
    schemaVersion: 1,
    projectId: 'p',
    taskId: 't',
    turnId: 'turn-1',
    runId,
    taskSequence: seq,
    occurredAt,
    receivedAt: occurredAt,
    payload,
  }
}

describe('projectEvents liveStatus + file meta', () => {
  it('sets liveStatus through stream and clears on terminal', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    expect(state.readModel.liveStatus).toBeNull()

    state = applyRuntimeEvent(state, mk(1, 'run.started', {}))
    expect(state.readModel.liveStatus).toBe('正在思考')
    expect(state.readModel.runStatus).toBe('running')

    state = applyRuntimeEvent(
      state,
      mk(2, 'tool.called', {
        toolId: 'r1',
        label: '读取 plan.txt',
        name: 'read_file',
        args: { path: 'fixture/notes/plan.txt' },
        items: ['fixture/notes/plan.txt'],
      }),
    )
    expect(state.readModel.liveStatus).toBe('正在读取 fixture/notes/plan.txt')
    const runningTool = state.readModel.timeline.find(
      (t) => t.category === 'tool-group',
    )
    expect(runningTool?.title).toBe('正在读取 fixture/notes/plan.txt')

    state = applyRuntimeEvent(
      state,
      mk(3, 'tool.completed', {
        toolId: 'r1',
        label: '已读取 plan.txt',
        name: 'read_file',
        args: { path: 'fixture/notes/plan.txt' },
        items: ['fixture/notes/plan.txt'],
      }),
    )
    // liveStatus stays until next event updates it
    expect(state.readModel.liveStatus).toBe('正在读取 fixture/notes/plan.txt')
    const doneTool = state.readModel.timeline.find((t) => t.category === 'tool-group')
    expect(doneTool?.title).toBe('已读取 plan.txt')

    state = applyRuntimeEvent(
      state,
      mk(4, 'file.changed', {
        path: 'fixture/notes/workflow-result.md',
        summary: '文件已创建',
        additions: 10,
        deletions: 0,
        diffLines: [
          { type: 'add', text: '# Synthetic Fixture Workflow Result', line: 1 },
        ],
      }),
    )
    expect(state.readModel.liveStatus).toBe('正在写入结果…')
    const file = state.readModel.timeline.find((t) => t.category === 'file-change')
    expect(file?.meta?.additions).toBe(10)
    expect(file?.meta?.deletions).toBe(0)
    expect(file?.meta?.diffLines?.[0]?.type).toBe('add')
    expect(file?.meta?.path).toBe('fixture/notes/workflow-result.md')

    state = applyRuntimeEvent(state, mk(5, 'run.completed', {}))
    expect(state.readModel.liveStatus).toBeNull()
    expect(state.readModel.runStatus).toBe('completed')
    const terminal = state.readModel.timeline.find(
      (t) => t.category === 'run-terminal',
    )
    expect(terminal?.title).toBe('已处理')
  })

  it('web search and plan update set Chinese liveStatus copy', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'run.started', {}))
    state = applyRuntimeEvent(
      state,
      mk(2, 'plan.updated', { title: '计划', steps: ['a', 'b'] }),
    )
    expect(state.readModel.liveStatus).toBe('正在更新计划…')

    state = applyRuntimeEvent(
      state,
      mk(3, 'tool.called', {
        toolId: 's1',
        label: '搜索网页',
        name: 'web_search',
      }),
    )
    expect(state.readModel.liveStatus).toBe('正在搜索网页…')
  })

  it('tool-group meta children from items', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = projectEvents(state, [
      mk(1, 'run.started', {}),
      mk(2, 'tool.called', {
        toolId: 't1',
        label: '读取',
        name: 'read',
        items: ['a.txt', 'b.txt'],
      }),
      mk(3, 'tool.completed', {
        toolId: 't1',
        label: '已读',
        items: ['a.txt', 'b.txt'],
      }),
    ])
    const tool = state.readModel.timeline.find((t) => t.category === 'tool-group')
    expect(tool?.meta?.children).toEqual(['a.txt', 'b.txt'])
  })

  it('tool.completed falls back from raw output to expandable children', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = projectEvents(state, [
      mk(1, 'run.started', {}),
      mk(2, 'tool.called', {
        toolId: 'ls1',
        label: 'ls',
        name: 'ls',
      }),
      mk(3, 'tool.completed', {
        toolId: 'ls1',
        label: 'ls',
        // No summary/items — only raw VoltAgent-style output
        output: '/notes/ (directory)\n/output/ (directory)',
      }),
    ])
    const tool = state.readModel.timeline.find((t) => t.category === 'tool-group')
    expect(tool?.status).toBe('completed')
    expect(tool?.meta?.children).toEqual([
      '/notes/ (directory)',
      '/output/ (directory)',
    ])
    expect(tool?.body).toBeTruthy()
  })

  it('mapper ls envelopes project to expandable tool-group children', () => {
    const { envelopes } = mapFullStreamChunks(
      [
        {
          type: 'tool-call',
          toolCallId: 'ls-e2e',
          toolName: 'ls',
          args: { path: '/' },
        },
        {
          type: 'tool-result',
          toolCallId: 'ls-e2e',
          toolName: 'ls',
          args: { path: '/' },
          output: '/notes/ (directory)\n/output/ (directory)',
        },
      ],
      {
        projectId: 'p',
        taskId: 't',
        turnId: 'turn-1',
        runId: 'run-1',
        nextSequence: 1,
        schemaVersion: 1,
        nowIso: () => '2026-08-05T00:00:00.000Z',
        eventIdPrefix: 'test',
      },
    )
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = projectEvents(state, envelopes)
    const tool = state.readModel.timeline.find((t) => t.category === 'tool-group')
    expect(tool?.status).toBe('completed')
    expect(tool?.title).toBe('已列出 /')
    expect(tool?.meta?.children).toEqual([
      '/notes/ (directory)',
      '/output/ (directory)',
    ])
    // Expandable content is present (Timeline ToolRow uses meta.children / body).
    expect(
      (tool?.meta?.children?.length ?? 0) > 0 || Boolean(tool?.body?.trim()),
    ).toBe(true)
  })

  it('tool.called without args uses items path for natural title', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = projectEvents(state, [
      mk(1, 'run.started', {}),
      mk(2, 'tool.called', {
        toolId: 'r1',
        name: 'read_file',
        items: ['notes/a.md'],
      }),
    ])
    const tool = state.readModel.timeline.find((t) => t.category === 'tool-group')
    expect(tool?.title).toBe('正在读取 notes/a.md')
    expect(state.readModel.liveStatus).toBe('正在读取 notes/a.md')
  })

  it('mid-run output is commentary; run.completed promotes last assistant to final', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = projectEvents(state, [
      mk(1, 'run.started', {}),
      mk(2, 'output.delta', { text: '先看目录。', phase: 'commentary' }),
      mk(3, 'tool.called', {
        toolId: 'ls1',
        name: 'ls',
        args: { path: '/' },
      }),
      mk(4, 'tool.completed', {
        toolId: 'ls1',
        name: 'ls',
        args: { path: '/' },
      }),
      mk(5, 'output.delta', { text: '目录是空的。', phase: 'commentary' }),
      mk(6, 'output.delta', { text: '这是成稿。' }),
      mk(7, 'run.completed', {}),
    ])
    const assistants = state.readModel.timeline.filter(
      (i) => i.category === 'assistant-message',
    )
    expect(assistants.length).toBeGreaterThanOrEqual(2)
    const last = assistants[assistants.length - 1]
    expect(last?.meta?.messageRole).toBe('final')
    expect(last?.body).toContain('成稿')
    const earlier = assistants.slice(0, -1)
    for (const a of earlier) {
      expect(a.meta?.messageRole).toBe('commentary')
    }
    const terminal = state.readModel.timeline.find(
      (i) => i.category === 'run-terminal',
    )
    expect(terminal?.title).toBe('已处理')
    expect(terminal?.meta?.startedAt || terminal?.meta?.path).toBeTruthy()
  })

  it('keeps text-end segments separate even when no tool occurs between them', () => {
    const state = projectEvents(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      [
        mk(1, 'run.started', {}),
        mk(2, 'output.delta', { text: '过程说明。', phase: 'commentary' }),
        mk(3, 'output.completed', { text: '过程说明。' }),
        mk(4, 'output.delta', { text: '最终回答。', phase: 'commentary' }),
        mk(5, 'output.completed', { text: '最终回答。' }),
        mk(6, 'run.completed', {}),
      ],
    )
    const assistants = state.readModel.timeline.filter(
      (item) => item.category === 'assistant-message',
    )
    expect(assistants).toHaveLength(2)
    expect(assistants[0]).toMatchObject({
      body: '过程说明。',
      meta: { messageRole: 'commentary' },
    })
    expect(assistants[1]).toMatchObject({
      body: '最终回答。',
      meta: { messageRole: 'final' },
    })
  })

  it('keeps commentary chronological across plan, reasoning, and source boundaries', () => {
    const state = projectEvents(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      [
        mk(1, 'run.started', {}),
        mk(2, 'output.delta', { text: '先制定计划。', phase: 'commentary' }),
        mk(3, 'plan.updated', { steps: ['检查目录'] }),
        mk(4, 'output.delta', { text: '计划已就绪。', phase: 'commentary' }),
        mk(5, 'reasoning.started', { id: 'reason-1' }),
        mk(6, 'reasoning.delta', { id: 'reason-1', text: '分析中' }),
        mk(7, 'reasoning.completed', { id: 'reason-1' }),
        mk(8, 'source.grouped', { title: '来源', sources: ['/notes/a.md'] }),
        mk(9, 'output.delta', { text: '开始执行。', phase: 'commentary' }),
      ],
    )

    expect(
      state.readModel.timeline.map((item) => [item.category, item.body]),
    ).toEqual(
      expect.arrayContaining([
        ['assistant-message', '先制定计划。'],
        ['assistant-message', '计划已就绪。'],
        ['assistant-message', '开始执行。'],
      ]),
    )
    const categories = state.readModel.timeline.map((item) => item.category)
    expect(categories).toEqual([
      'run-terminal',
      'assistant-message',
      'plan-update',
      'assistant-message',
      'reasoning-section',
      'source-group',
      'assistant-message',
    ])
  })

  it('projects one reasoning row per provider reasoning id', () => {
    const state = projectEvents(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      [
        mk(1, 'run.started', {}),
        mk(2, 'reasoning.started', { id: 'reason-1' }),
        mk(3, 'reasoning.delta', { id: 'reason-1', text: '第一段' }),
        mk(4, 'reasoning.completed', { id: 'reason-1' }),
        mk(5, 'reasoning.started', { id: 'reason-2' }),
        mk(6, 'reasoning.delta', { id: 'reason-2', text: '第二段' }),
      ],
    )
    const reasoning = state.readModel.timeline.filter(
      (item) => item.category === 'reasoning-section',
    )
    expect(reasoning).toHaveLength(2)
    expect(reasoning[0]).toMatchObject({ body: '第一段', status: 'completed' })
    expect(reasoning[1]).toMatchObject({ body: '第二段', status: 'streaming' })
  })

  it('projects a deterministic process summary from logical tool calls', () => {
    const state = projectEvents(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      [
        mk(1, 'run.started', {}),
        mk(2, 'tool.called', {
          toolId: 'read-1',
          name: 'read_file',
          args: { path: '/notes/a.md' },
        }),
        mk(3, 'tool.completed', {
          toolId: 'read-1',
          name: 'read_file',
          args: { path: '/notes/a.md' },
        }),
        mk(4, 'tool.called', {
          toolId: 'search-1',
          name: 'web_search',
          args: { query: 'agent ui' },
        }),
        mk(5, 'command.started', {
          commandId: 'cmd-1',
          command: 'pnpm test',
        }),
      ],
    )
    const terminal = state.readModel.timeline.find(
      (item) => item.category === 'run-terminal',
    )
    expect(terminal?.meta?.processSummary).toEqual({
      stepCount: 3,
      counts: { read: 1, search: 1, command: 1 },
    })
  })
})
