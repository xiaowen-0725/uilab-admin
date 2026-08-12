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
    schemaVersion: 1,
    projectId: 'p',
    taskId: 't',
    turnId: 'turn-1',
    runId: 'run-1',
    taskSequence: seq,
    occurredAt: `1970-01-01T00:00:0${seq}.000Z`,
    receivedAt: `1970-01-01T00:00:0${seq}.000Z`,
    payload,
  }
}

describe('projectEvents approval reason', () => {
  it('stores toolName on request and appends auto-approve reason on resolve', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(
      state,
      mk(1, 'run.started', {}),
    )
    state = applyRuntimeEvent(
      state,
      mk(2, 'approval.requested', {
        requestId: 'req-1',
        toolName: 'write_file',
      }),
    )
    const waiting = state.readModel.timeline.find(
      (item) => item.category === 'approval-request',
    )
    expect(waiting?.status).toBe('waiting')
    expect(waiting?.meta?.toolName).toBe('write_file')

    state = applyRuntimeEvent(
      state,
      mk(3, 'approval.resolved', {
        requestId: 'req-1',
        decision: 'approved',
        reason: '已按「帮我批准」预设自动批准',
      }),
    )
    const resolved = state.readModel.timeline.find(
      (item) => item.category === 'approval-request',
    )
    expect(resolved?.status).toBe('approved')
    expect(resolved?.body).toContain('决定：自动批准')
    expect(resolved?.body).toContain('已按「帮我批准」预设自动批准')
    expect(resolved?.meta?.toolName).toBe('write_file')
  })

  it('keeps 允许一次 when a human resolves without an auto-approve reason', () => {
    let state = emptyProjectionState({ taskId: 't', projectId: 'p' })
    state = applyRuntimeEvent(state, mk(1, 'run.started', {}))
    state = applyRuntimeEvent(
      state,
      mk(2, 'approval.requested', {
        requestId: 'req-2',
        toolName: 'execute_command',
      }),
    )
    state = applyRuntimeEvent(
      state,
      mk(3, 'approval.resolved', {
        requestId: 'req-2',
        decision: 'approved',
      }),
    )
    const resolved = state.readModel.timeline.find(
      (item) => item.category === 'approval-request',
    )
    expect(resolved?.body).toContain('决定：允许一次')
    expect(resolved?.body).not.toContain('自动批准')
  })
})
