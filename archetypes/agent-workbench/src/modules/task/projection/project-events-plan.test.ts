/**
 * Plan snapshot + Timeline plan-update projection (spec #98 / issue #100).
 */
import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { emptyProjectionState } from './empty-read-model'
import { applyRuntimeEvent, projectEvents } from './project-events'

function mk(
  seq: number,
  type: string,
  payload: unknown,
  runId = 'run-1',
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
    occurredAt: `1970-01-01T00:00:0${Math.min(seq, 9)}.000Z`,
    receivedAt: `1970-01-01T00:00:0${Math.min(seq, 9)}.000Z`,
    payload,
  }
}

const NEW_STEPS = [
  { step: '调研 OpenAPI', status: 'completed' as const },
  { step: '实现参数装配', status: 'in_progress' as const },
  { step: '联调沙箱', status: 'pending' as const },
]

describe('projectEvents plan snapshot', () => {
  it('projects a structured plan.updated payload onto the read model and Timeline card', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'run.started', {}),
      mk(2, 'plan.updated', {
        explanation: '先拆出鉴权',
        steps: NEW_STEPS,
      }),
    ])

    expect(state.readModel.plan).toEqual({
      explanation: '先拆出鉴权',
      steps: NEW_STEPS,
      progress: { completed: 1, total: 3 },
    })

    const card = state.readModel.timeline.find((item) => item.category === 'plan-update')
    expect(card).toMatchObject({
      title: '计划已更新',
      body: '先拆出鉴权',
      meta: {
        plan: {
          explanation: '先拆出鉴权',
          steps: NEW_STEPS,
        },
      },
    })
  })

  it('treats legacy string[] steps as pending', () => {
    const state = applyRuntimeEvent(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      mk(1, 'plan.updated', { steps: ['检查目录', '写结果'] }),
    )

    expect(state.readModel.plan).toEqual({
      steps: [
        { step: '检查目录', status: 'pending' },
        { step: '写结果', status: 'pending' },
      ],
      progress: { completed: 0, total: 2 },
    })
  })

  it('upserts the Timeline plan card per Run and replaces the snapshot', () => {
    let state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'run.started', {}),
      mk(2, 'plan.updated', {
        steps: [{ step: '调研', status: 'in_progress' }],
      }),
    ])
    state = applyRuntimeEvent(
      state,
      mk(3, 'plan.updated', {
        explanation: '拆出联调',
        steps: [
          { step: '调研', status: 'completed' },
          { step: '联调', status: 'in_progress' },
        ],
      }),
    )

    const cards = state.readModel.timeline.filter((item) => item.category === 'plan-update')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.id).toBe('plan-update:run-1')
    expect(cards[0]?.body).toBe('拆出联调')
    expect(state.readModel.plan?.progress).toEqual({ completed: 1, total: 2 })
  })

  it('rebuilds the latest plan snapshot by replaying events', () => {
    const events = [
      mk(1, 'run.started', {}),
      mk(2, 'plan.updated', {
        steps: [{ step: '调研', status: 'in_progress' }],
      }),
      mk(3, 'plan.updated', {
        steps: [
          { step: '调研', status: 'completed' },
          { step: '实现', status: 'completed' },
        ],
      }),
    ]
    const live = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), events)
    const replayed = projectEvents(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      events,
    )

    expect(replayed.readModel.plan).toEqual(live.readModel.plan)
    expect(replayed.readModel.plan?.progress).toEqual({ completed: 2, total: 2 })
  })

  it('does not count plan.updated in ProcessSummary', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'run.started', {}),
      mk(2, 'plan.updated', {
        steps: [{ step: '调研', status: 'in_progress' }],
      }),
      mk(3, 'tool.called', {
        toolId: 'read-1',
        name: 'read_file',
        args: { path: '/notes/a.md' },
      }),
    ])
    const terminal = state.readModel.timeline.find((item) => item.category === 'run-terminal')
    expect(terminal?.meta?.processSummary).toEqual({
      stepCount: 1,
      counts: { read: 1 },
    })
  })

  it('projects a warning envelope as a Timeline warning row', () => {
    const state = projectEvents(emptyProjectionState({ taskId: 't', projectId: 'p' }), [
      mk(1, 'run.started', {}),
      mk(2, 'warning', {
        title: '计划更新失败',
        message: 'sidecar unavailable',
        toolCallId: 'plan-err',
      }),
    ])
    const row = state.readModel.timeline.find((item) => item.category === 'warning')
    expect(row).toMatchObject({
      title: '计划更新失败',
      body: 'sidecar unavailable',
    })
  })

  it('renders empty steps as an empty snapshot, not a missing plan', () => {
    const state = applyRuntimeEvent(
      emptyProjectionState({ taskId: 't', projectId: 'p' }),
      mk(1, 'plan.updated', { steps: [] }),
    )
    expect(state.readModel.plan).toEqual({
      steps: [],
      progress: { completed: 0, total: 0 },
    })
    const card = state.readModel.timeline.find((item) => item.category === 'plan-update')
    expect(card?.meta?.plan?.steps).toEqual([])
  })
})
