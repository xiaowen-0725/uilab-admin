/**
 * Step boundaries, artifact rows, and run deliverables.
 */
import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { emptyProjectionState } from './empty-read-model'
import { projectEvents } from './project-events'

function mk(
  seq: number,
  type: string,
  payload: unknown = {},
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${seq}`,
    eventType: type,
    schemaVersion: 2,
    projectId: 'p',
    taskId: 't',
    turnId: 'turn-1',
    taskSequence: seq,
    occurredAt: `1970-01-01T00:00:0${Math.min(seq, 9)}.000Z`,
    receivedAt: `1970-01-01T00:00:0${Math.min(seq, 9)}.000Z`,
    payload,
  }
}

describe('projectEvents step + artifact + deliverables', () => {
  it('splits assistant prose on real step / text-start boundaries', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'step.started', { stepId: 'step-1' }),
      mk(3, 'message.started', { id: 'text-1' }),
      mk(4, 'message.delta', { text: '先看目录。' }),
      mk(5, 'step.completed', { stepId: 'step-1' }),
      mk(6, 'step.started', { stepId: 'step-2' }),
      mk(7, 'message.started', { id: 'text-2' }),
      mk(8, 'message.delta', { text: '目录是空的。' }),
      mk(9, 'turn.completed'),
    ])

    const assistants = state.readModel.timeline.filter(
      (item) => item.category === 'assistant-message',
    )
    expect(assistants).toHaveLength(2)
    expect(assistants[0]).toMatchObject({ body: '先看目录。', status: 'completed' })
    expect(assistants[1]).toMatchObject({ body: '目录是空的。', status: 'completed' })
    expect(
      state.readModel.timeline.some((item) => item.category === 'unsupported-event'),
    ).toBe(false)
  })

  it('falls back to heuristic segmentation when the stream has no step events', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'message.delta', { text: '过程说明。' }),
      mk(3, 'message.completed', { text: '过程说明。' }),
      mk(4, 'message.delta', { text: '最终回答。' }),
      mk(5, 'message.completed', { text: '最终回答。' }),
      mk(6, 'turn.completed'),
    ])
    const assistants = state.readModel.timeline.filter(
      (item) => item.category === 'assistant-message',
    )
    expect(assistants).toHaveLength(2)
    expect(assistants.map((item) => item.body)).toEqual(['过程说明。', '最终回答。'])
  })

  it('heuristic still splits on tools when the stream has no step events', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'message.delta', { text: '先读文件。' }),
      mk(3, 'tool.started', { toolId: 'r1', name: 'read_file', label: '读取' }),
      mk(4, 'tool.completed', { toolId: 'r1', name: 'read_file', label: '读取' }),
      mk(5, 'message.delta', { text: '读完了。' }),
      mk(6, 'turn.completed'),
    ])
    const assistants = state.readModel.timeline.filter(
      (item) => item.category === 'assistant-message',
    )
    expect(assistants.map((item) => item.body)).toEqual(['先读文件。', '读完了。'])
  })

  it('does not let tools split assistant text once real step events are present', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'step.started', { stepId: 'step-1' }),
      mk(3, 'message.delta', { text: '先读文件。' }),
      mk(4, 'tool.started', { toolId: 'r1', name: 'read_file', label: '读取' }),
      mk(5, 'tool.completed', { toolId: 'r1', name: 'read_file', label: '读取' }),
      mk(6, 'message.delta', { text: '读完了。' }),
      mk(7, 'step.completed', { stepId: 'step-1' }),
      mk(8, 'turn.completed'),
    ])
    const assistants = state.readModel.timeline.filter(
      (item) => item.category === 'assistant-message',
    )
    expect(assistants).toHaveLength(1)
    expect(assistants[0]?.body).toBe('先读文件。读完了。')
    expect(state.readModel.timeline.find((item) => item.id === 'tool-group:r1')?.meta?.stepId).toBe(
      'step-1',
    )
  })

  it('stamps distinct stepIds so later working tools can seal a new block', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'step.started', { stepId: 'step-1' }),
      mk(3, 'tool.started', { toolId: 'r1', name: 'read_file', label: '读取' }),
      mk(4, 'tool.completed', { toolId: 'r1', name: 'read_file', label: '读取' }),
      mk(5, 'step.completed', { stepId: 'step-1' }),
      mk(6, 'step.started', { stepId: 'step-2' }),
      mk(7, 'tool.started', { toolId: 'w1', name: 'write_file', label: '写入' }),
      mk(8, 'tool.completed', { toolId: 'w1', name: 'write_file', label: '写入' }),
      mk(9, 'turn.completed'),
    ])
    expect(state.readModel.timeline.find((item) => item.id === 'tool-group:r1')?.meta?.stepId).toBe(
      'step-1',
    )
    expect(state.readModel.timeline.find((item) => item.id === 'tool-group:w1')?.meta?.stepId).toBe(
      'step-2',
    )
  })

  it('projects artifact events and aggregates deliverables on turn.completed', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'file.changed', {
        path: 'notes/result.md',
        additions: 10,
        deletions: 0,
        changeKind: 'created',
      }),
      mk(3, 'file.changed', {
        path: 'notes/old.md',
        changeKind: 'deleted',
      }),
      mk(4, 'artifact.created', {
        path: 'notes/result.md',
        kind: 'document',
        title: '工作流结果',
      }),
      mk(5, 'artifact.linked', {
        path: 'notes/chart.png',
        kind: 'image',
        title: '对比图',
      }),
      mk(6, 'message.delta', { text: '写好了。' }),
      mk(7, 'turn.completed'),
    ])

    const artifacts = state.readModel.timeline.filter(
      (item) => item.category === 'artifact',
    )
    expect(artifacts).toHaveLength(2)
    expect(artifacts[0]).toMatchObject({
      title: '工作流结果',
      meta: { path: 'notes/result.md', kind: 'document', title: '工作流结果' },
    })
    expect(artifacts[1]).toMatchObject({
      title: '对比图',
      meta: { path: 'notes/chart.png', kind: 'image', title: '对比图' },
    })

    const deleted = state.readModel.timeline.find(
      (item) => item.category === 'file-change' && item.meta?.path === 'notes/old.md',
    )
    expect(deleted?.meta?.changeKind).toBe('deleted')
    expect(deleted?.meta?.additions).toBeUndefined()

    expect(state.readModel.deliverables).toEqual([
      {
        path: 'notes/result.md',
        title: '工作流结果',
        kind: 'document',
        changeKind: 'created',
        source: 'artifact',
        additions: 10,
        deletions: 0,
      },
      {
        path: 'notes/old.md',
        title: 'notes/old.md',
        changeKind: 'deleted',
        source: 'file',
      },
      {
        path: 'notes/chart.png',
        title: '对比图',
        kind: 'image',
        source: 'artifact',
      },
    ])

    const terminal = state.readModel.timeline.find(
      (item) => item.category === 'turn-terminal',
    )
    expect(terminal?.meta?.deliverables).toEqual(state.readModel.deliverables)
  })

  it('does not invent deliverables when a completed run has no files or artifacts', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'message.delta', { text: '只是一句话。' }),
      mk(3, 'turn.completed'),
    ])
    expect(state.readModel.deliverables).toEqual([])
    const terminal = state.readModel.timeline.find(
      (item) => item.category === 'turn-terminal',
    )
    expect(terminal?.meta?.deliverables).toBeUndefined()
  })
})
