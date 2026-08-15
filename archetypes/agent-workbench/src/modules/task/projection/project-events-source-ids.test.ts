import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
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
    schemaVersion: 2,
    projectId: 'p',
    taskId: 't',
    turnId: 'turn-1',

    taskSequence: seq,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload,
  }
}

describe('projectEvents sourceEventIds cap', () => {
  it('caps delta-coalesced assistant ids and keeps the sequence range', () => {
    const deltas = Array.from({ length: 20 }, (_, index) =>
      mk(index + 2, 'message.delta', { text: String.fromCharCode(97 + (index % 26)) }),
    )
    const events = [mk(1, 'turn.started'), ...deltas]
    const live = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), events)
    const replayed = projectEvents(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      events,
    )

    const assistant = live.readModel.timeline.find(
      (item) => item.category === 'assistant-message',
    )
    expect(assistant?.body).toBe('abcdefghijklmnopqrst')
    expect(assistant?.sourceEventIds).toEqual(['e2', 'e21'])
    expect(assistant?.sourceEventIds.length).toBeLessThanOrEqual(8)
    expect(assistant?.sequenceFrom).toBe(2)
    expect(assistant?.sequenceTo).toBe(21)
    expect(replayed.readModel.timeline).toEqual(live.readModel.timeline)
  })

  it('caps non-delta coalesced tool ids at first, last, and 8 total', () => {
    const progress = Array.from({ length: 20 }, (_, index) =>
      mk(index + 3, 'tool.progress', {
        toolId: 'write-1',
        name: 'write_file',
        progress: (index + 1) / 20,
      }),
    )
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'turn.started'),
      mk(2, 'tool.started', { toolId: 'write-1', name: 'write_file' }),
      ...progress,
    ])

    const tool = state.readModel.timeline.find((item) => item.category === 'tool-group')
    expect(tool?.sourceEventIds).toEqual(['e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e22'])
    expect(tool?.sequenceFrom).toBe(2)
    expect(tool?.sequenceTo).toBe(22)
  })

  it('does not clone untouched timeline items when applying a later event', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'turn.started'))
    const terminal = state.readModel.timeline[0]
    state = applyRuntimeEvent(state, mk(2, 'message.delta', { text: 'hi' }))

    expect(state.readModel.timeline[0]).toBe(terminal)
    expect(state.readModel.timeline[1]?.body).toBe('hi')
  })

  it('does not mutate the input seenEventIds set', () => {
    const before = emptyProjectionState({ taskId: 't', projectId: 'p' })
    const after = applyRuntimeEvent(before, mk(1, 'turn.started'))
    expect(before.seenEventIds.has('e1')).toBe(false)
    expect(after.seenEventIds.has('e1')).toBe(true)
    expect(after.seenEventIds).not.toBe(before.seenEventIds)
  })
})
