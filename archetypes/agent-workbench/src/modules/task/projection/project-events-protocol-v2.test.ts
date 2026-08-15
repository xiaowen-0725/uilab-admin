import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { AGENT_RUNTIME_SCHEMA_VERSION } from '../protocol/events'
import { emptyProjectionState } from './empty-read-model'
import { applyRuntimeEvent, projectEvents } from './project-events'

function mk(
  seq: number,
  type: string,
  payload: unknown = {},
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${seq}`,
    eventType: type,
    schemaVersion: AGENT_RUNTIME_SCHEMA_VERSION,
    projectId: 'p',
    taskId: 't',
    turnId: 'turn-1',
    taskSequence: seq,
    occurredAt: `1970-01-01T00:00:0${seq}.000Z`,
    receivedAt: `1970-01-01T00:00:0${seq}.000Z`,
    payload,
  }
}

describe('projectEvents protocol v2', () => {
  it('projects turn.completed with usage onto the turn-terminal and read model', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started', { inputText: '写纪要' }),
      mk(2, 'message.delta', { text: '好的' }),
      mk(3, 'turn.completed', {
        outcome: 'completed',
        usage: { promptTokens: 12, completionTokens: 4, totalTokens: 16 },
      }),
    ])

    expect(state.readModel.turnStatus).toBe('completed')
    expect(state.readModel.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
    })
    const terminal = state.readModel.timeline.find(
      (item) => item.category === 'turn-terminal',
    )
    expect(terminal?.status).toBe('completed')
    expect(terminal?.meta?.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
    })
    expect(state.readModel.timeline.some((item) => item.category === 'user-message')).toBe(
      true,
    )
  })

  it('marks the task archived from task.archived', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    expect(state.readModel.archived).toBe(false)
    state = applyRuntimeEvent(state, mk(1, 'task.archived', {}))
    expect(state.readModel.archived).toBe(true)
    expect(state.readModel.timeline).toEqual([])
  })

  it('applies usage.updated onto the current turn-terminal', () => {
    let state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started', {}),
    ])
    state = applyRuntimeEvent(
      state,
      mk(2, 'usage.updated', { inputTokens: 3, outputTokens: 1, totalTokens: 4 }),
    )
    expect(state.readModel.usage).toEqual({
      inputTokens: 3,
      outputTokens: 1,
      totalTokens: 4,
    })
    const terminal = state.readModel.timeline.find(
      (item) => item.category === 'turn-terminal',
    )
    expect(terminal?.meta?.usage).toEqual({
      inputTokens: 3,
      outputTokens: 1,
      totalTokens: 4,
    })
  })

  it.each([
    'run.queued',
    'run.interrupted',
    'run.reconciled',
    'source.grouped',
    'message.accepted',
    'reasoning.section_completed',
    'run.started',
    'run.completed',
    'output.delta',
    'tool.called',
  ])('rejects dead or v1 event %s as unsupported-event', (eventType) => {
    const state = applyRuntimeEvent(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      mk(1, eventType, { text: 'nope' }),
    )
    expect(state.readModel.turnStatus).toBeNull()
    expect(state.readModel.timeline).toEqual([
      expect.objectContaining({
        category: 'unsupported-event',
        title: eventType,
      }),
    ])
  })
})
