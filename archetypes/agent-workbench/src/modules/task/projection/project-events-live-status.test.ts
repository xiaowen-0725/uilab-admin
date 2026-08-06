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
})
