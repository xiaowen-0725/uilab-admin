import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { AGENT_RUNTIME_SCHEMA_VERSION } from '../protocol/events'
import { emptyProjectionState } from './empty-read-model'
import { applyRuntimeEvent } from './project-events'

function mk(
  seq: number,
  type: string,
  payload: unknown,
  occurredAt: string,
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${seq}`,
    eventType: type,
    schemaVersion: AGENT_RUNTIME_SCHEMA_VERSION,
    projectId: 'p',
    taskId: 't',
    turnId: 'turn-1',
    taskSequence: seq,
    occurredAt,
    receivedAt: occurredAt,
    payload,
  }
}

const T = (s: number): string =>
  `1970-01-01T00:00:${String(s).padStart(2, '0')}.000Z`

describe('projectEvents work anchor', () => {
  it('anchors burst-delivered reasoning to turn start so its duration covers the thinking gap', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'turn.started', {}, T(1)))
    // Sidecar thinks for 8s, then delivers the reasoning burst instantly.
    state = applyRuntimeEvent(state, mk(2, 'step.started', { stepId: 's1' }, T(9)))
    state = applyRuntimeEvent(state, mk(3, 'reasoning.started', {}, T(9)))
    state = applyRuntimeEvent(state, mk(4, 'reasoning.delta', { text: '想' }, T(9)))
    state = applyRuntimeEvent(state, mk(5, 'reasoning.completed', {}, T(10)))

    const reasoning = state.readModel.timeline.find(
      (row) => row.category === 'reasoning-section',
    )
    expect(reasoning?.meta?.startedAt).toBe(T(1))
    expect(reasoning?.meta?.endedAt).toBe(T(10))
  })

  it('re-anchors after a user answer and consumes the anchor only once', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'turn.started', {}, T(1)))
    state = applyRuntimeEvent(state, mk(2, 'reasoning.started', {}, T(2)))
    state = applyRuntimeEvent(state, mk(3, 'reasoning.completed', {}, T(3)))
    state = applyRuntimeEvent(
      state,
      mk(4, 'input.requested', { requestId: 'q1', question: '风格？' }, T(3)),
    )
    state = applyRuntimeEvent(
      state,
      mk(5, 'input.provided', { requestId: 'q1', text: '正式' }, T(20)),
    )
    // Thinking gap after the answer; the burst arrives at T(31).
    state = applyRuntimeEvent(state, mk(6, 'reasoning.started', {}, T(31)))
    state = applyRuntimeEvent(state, mk(7, 'reasoning.completed', {}, T(32)))
    // Anchor already consumed — a follow-up tool keeps its own start time.
    state = applyRuntimeEvent(
      state,
      mk(8, 'tool.started', { toolId: 'read-1', name: 'read_file' }, T(33)),
    )

    const sections = state.readModel.timeline.filter(
      (row) => row.category === 'reasoning-section',
    )
    expect(sections[1]?.meta?.startedAt).toBe(T(20))
    const tool = state.readModel.timeline.find(
      (row) => row.category === 'tool-group',
    )
    expect(tool?.meta?.startedAt).toBe(T(33))
  })

  it('anchors the first tool when a turn has no reasoning', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'turn.started', {}, T(1)))
    state = applyRuntimeEvent(
      state,
      mk(2, 'tool.started', { toolId: 'read-1', name: 'read_file' }, T(6)),
    )
    const tool = state.readModel.timeline.find(
      (row) => row.category === 'tool-group',
    )
    expect(tool?.meta?.startedAt).toBe(T(1))
  })
})
