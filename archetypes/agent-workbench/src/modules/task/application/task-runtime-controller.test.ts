import { describe, expect, it } from 'vitest'
import { createDeterministicFakeRuntime } from '../runtime/fake-runtime'
import { VirtualClock } from '../runtime/virtual-clock'
import { TaskRuntimeController } from './task-runtime-controller'

describe('TaskRuntimeController', () => {
  it('submitText projects user + assistant + completed terminal', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'ctrl',
      clock,
      stepMs: 0,
      outputDeltas: ['Hi', '!'],
    })
    const controller = new TaskRuntimeController({
      runtime,
      projectId: 'proj-1',
      seed: 'ctrl',
      autoFlush: true,
    })

    await controller.attach('task-r', { title: '新任务' })
    const ack = await controller.submitText('hello runtime')
    expect(ack?.status).toBe('accepted')

    const model = controller.readModel
    expect(model.title).toBe('hello runtime')
    expect(model.runStatus).toBe('completed')
    expect(model.timeline.map((t) => t.category)).toEqual([
      'user-message',
      'run-terminal',
      'assistant-message',
    ])
    expect(model.timeline.find((t) => t.category === 'assistant-message')?.body).toBe(
      'Hi!',
    )
    expect(controller.getNotice()).toMatch(/非生产|不会调用远程/)
  })

  it('cancelActiveRun ends in cancelled', async () => {
    const clock = new VirtualClock({ startMs: 0 })
    const runtime = createDeterministicFakeRuntime({
      seed: 'ctrl-c',
      clock,
      stepMs: 10,
      defaultScenario: 'cancel-run',
    })
    const controller = new TaskRuntimeController({
      runtime,
      projectId: 'proj-1',
      seed: 'ctrl-c',
      autoFlush: false,
    })

    await controller.attach('task-c')
    await controller.submitText('cancel please')
    // Advance to run.started only.
    clock.advance(10)
    expect(controller.getRunStatus()).toBe('running')

    const cancelAck = await controller.cancelActiveRun()
    expect(cancelAck?.status).toBe('accepted')
    clock.flush()
    expect(controller.getRunStatus()).toBe('cancelled')
    expect(
      controller.readModel.timeline.find((t) => t.category === 'run-terminal')?.title,
    ).toBe('已取消')
  })
})
