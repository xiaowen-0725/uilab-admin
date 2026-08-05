import { describe, expect, it } from 'vitest'
import { createDeterministicFakeRuntime } from '../runtime/fake-runtime'
import { createMemoryEventStore } from '../runtime/memory-event-store'
import { VirtualClock } from '../runtime/virtual-clock'
import { TaskRuntimeController } from './task-runtime-controller'

describe('TaskRuntimeController Phase 4E', () => {
  it('persists events and rehydrates the same timeline', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'rh',
      clock,
      stepMs: 0,
      outputDeltas: ['Hi'],
      keywordScenarios: false,
    })
    const store = createMemoryEventStore()

    const c1 = new TaskRuntimeController({
      runtime,
      projectId: 'proj-1',
      eventStore: store,
      seed: 'rh',
      autoFlush: true,
    })
    await c1.attach('task-rh', { title: '新任务' })
    await c1.submitText('hello store')
    const timeline1 = c1.readModel.timeline.map((t) => ({
      id: t.id,
      category: t.category,
      body: t.body,
      status: t.status,
    }))
    expect(timeline1.some((t) => t.category === 'assistant-message')).toBe(true)
    c1.detach()

    // Fresh controller, same runtime + store → rehydrate projection from store.
    const c2 = new TaskRuntimeController({
      runtime,
      projectId: 'proj-1',
      eventStore: store,
      seed: 'rh2',
      autoFlush: true,
    })
    await c2.attach('task-rh')
    const timeline2 = c2.readModel.timeline.map((t) => ({
      id: t.id,
      category: t.category,
      body: t.body,
      status: t.status,
    }))
    expect(timeline2).toEqual(timeline1)
    expect(c2.getNotice()).toMatch(/EventStore|恢复/)
  })

  it('queueFollowUp drains after complete', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'qd',
      clock,
      stepMs: 10,
      defaultScenario: 'cancel-run',
      keywordScenarios: false,
    })
    const controller = new TaskRuntimeController({
      runtime,
      projectId: 'proj-1',
      seed: 'qd',
      autoFlush: false,
    })
    await controller.attach('task-qd')
    await controller.submitText('first')
    clock.advance(10)
    expect(controller.getRunStatus()).toBe('running')

    const qAck = await controller.queueFollowUp('second queued')
    expect(qAck?.status).toBe('accepted')

    runtime.setTaskScenario('task-qd', 'normal-stream-complete')
    await controller.cancelActiveRun()
    clock.flush()

    // After cancel + queue drain, second turn should complete.
    expect(
      controller.readModel.timeline.filter((t) => t.category === 'user-message')
        .length,
    ).toBeGreaterThanOrEqual(2)
    expect(controller.getRunStatus()).toBe('completed')
  })

  it('multi-task isolation: separate projections', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'iso2',
      clock,
      stepMs: 0,
      outputDeltas: ['A'],
      keywordScenarios: false,
    })
    const store = createMemoryEventStore()
    const controller = new TaskRuntimeController({
      runtime,
      projectId: 'proj-1',
      eventStore: store,
      seed: 'iso2',
      autoFlush: true,
    })

    await controller.attach('task-x')
    await controller.submitText('x-msg')
    const xBody = controller.readModel.timeline.find(
      (t) => t.category === 'assistant-message',
    )?.body

    await controller.attach('task-y')
    await controller.submitText('y-msg')
    const yBody = controller.readModel.timeline.find(
      (t) => t.category === 'assistant-message',
    )?.body
    expect(controller.readModel.taskId).toBe('task-y')
    expect(yBody).toBe('A')

    await controller.attach('task-x')
    expect(controller.readModel.taskId).toBe('task-x')
    expect(
      controller.readModel.timeline.find((t) => t.category === 'assistant-message')
        ?.body,
    ).toBe(xBody)
  })

  it('respondToApproval approve path via controller', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'cap',
      clock,
      stepMs: 0,
      keywordScenarios: false,
    })
    runtime.setTaskScenario('task-cap', 'approval-approve')
    const controller = new TaskRuntimeController({
      runtime,
      projectId: 'proj-1',
      seed: 'cap',
      autoFlush: true,
    })
    await controller.attach('task-cap')
    await controller.submitText('please approve')
    expect(controller.getRunStatus()).toBe('waiting_for_approval')
    await controller.approveLatest()
    expect(controller.getRunStatus()).toBe('completed')
  })
})
