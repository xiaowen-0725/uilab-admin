import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { emptyProjectionState } from './empty-read-model'
import { applyRuntimeEvent } from './project-events'

function mk(
  seq: number,
  type: string,
  payload: unknown,
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${seq}`,
    eventType: type,
    schemaVersion: 2,
    projectId: 'p',
    taskId: 't',
    turnId: 'turn-1',

    taskSequence: seq,
    occurredAt: `1970-01-01T00:00:0${seq}.000Z`,
    receivedAt: `1970-01-01T00:00:0${seq}.000Z`,
    payload,
  }
}

describe('projectEvents question request', () => {
  it('projects structured input.requested into a waiting input-request card', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'turn.started', {}))
    state = applyRuntimeEvent(
      state,
      mk(2, 'input.requested', {
        requestId: 'call-q1',
        question: '用哪种语气写纪要？',
        options: [
          { id: 'formal', label: '正式' },
          { id: 'casual', label: '轻松' },
        ],
        allowMultiple: false,
      }),
    )

    expect(state.readModel.turnStatus).toBe('waiting_for_input')
    const item = state.readModel.timeline.find(
      (row) => row.category === 'input-request',
    )
    expect(item?.id).toBe('input-request:call-q1')
    expect(item?.status).toBe('waiting')
    expect(item?.title).toBe('用哪种语气写纪要？')
    expect(item?.meta?.question).toEqual({
      requestId: 'call-q1',
      question: '用哪种语气写纪要？',
      options: [
        { id: 'formal', label: '正式' },
        { id: 'casual', label: '轻松' },
      ],
      allowMultiple: false,
    })
  })

  it('keeps the legacy prompt bar when options are absent', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'turn.started', {}))
    state = applyRuntimeEvent(
      state,
      mk(2, 'input.requested', {
        requestId: 'legacy-1',
        prompt: '请补充仓库地址',
      }),
    )
    const item = state.readModel.timeline.find(
      (row) => row.category === 'input-request',
    )
    expect(item?.title).toBe('需要补充信息')
    expect(item?.body).toBe('请补充仓库地址')
    expect(item?.meta?.question).toBeUndefined()
  })

  it('stores answer meta and marks the card provided', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'turn.started', {}))
    state = applyRuntimeEvent(
      state,
      mk(2, 'input.requested', {
        requestId: 'call-q2',
        question: '用哪种语气写纪要？',
        options: [
          { id: 'formal', label: '正式' },
          { id: 'casual', label: '轻松' },
        ],
      }),
    )
    state = applyRuntimeEvent(
      state,
      mk(3, 'input.provided', {
        requestId: 'call-q2',
        answer: { kind: 'options', selectedOptionIds: ['formal'] },
        answeredAt: '1970-01-01T00:00:03.000Z',
      }),
    )

    expect(state.readModel.turnStatus).toBe('running')
    const item = state.readModel.timeline.find(
      (row) => row.category === 'input-request',
    )
    expect(item?.status).toBe('provided')
    expect(item?.meta?.question?.question).toBe('用哪种语气写纪要？')
    expect(item?.meta?.answer).toEqual({
      kind: 'options',
      selectedOptionIds: ['formal'],
      otherText: undefined,
    })
    const inline = state.readModel.timeline.find(
      (row) => row.meta?.inlineResponse === true,
    )
    expect(inline).toMatchObject({
      category: 'user-message',
      body: '正式',
      id: 'user:inline:call-q2',
    })
  })
})
