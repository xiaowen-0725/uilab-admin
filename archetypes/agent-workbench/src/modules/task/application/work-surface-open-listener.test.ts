/**
 * A4: work_surface.open_requested only dispatches for the attached task.
 */
import { describe, expect, it, vi } from 'vitest'
import { createMemoryEventStore } from '../runtime/memory-event-store'
import { createDeterministicFakeRuntime } from '../runtime/fake-runtime'
import { VirtualClock } from '../runtime/virtual-clock'
import { TaskRuntimeController } from './task-runtime-controller'

describe('TaskRuntimeController work_surface.open_requested', () => {
  it('notifies listener only while that task is attached', async () => {
    const clock = new VirtualClock()
    const runtime = createDeterministicFakeRuntime({
      clock,
      stepMs: 1,
      keywordScenarios: true,
    })
    const store = createMemoryEventStore()
    const controller = new TaskRuntimeController({
      runtime,
      projectId: 'project-default',
      eventStore: store,
      seed: 't',
      autoFlush: true,
    })
    const listener = vi.fn()
    controller.setWorkSurfaceOpenListener(listener)

    await controller.attach('task-a', { title: 'A' })
    runtime.setTaskScenario('task-a', 'work-surface-open-document')
    await controller.submitText('打开文档')
    clock.flush()
    await Promise.resolve()

    expect(listener).toHaveBeenCalled()
    const first = listener.mock.calls[0]?.[0]
    expect(first?.taskId).toBe('task-a')
    expect(first?.payload.resourceKey).toBe('fixture/notes/plan.txt')

    listener.mockClear()
    // Attach B — subscription is per attached task
    await controller.attach('task-b', { title: 'B' })
    runtime.setTaskScenario('task-b', 'work-surface-open-illegal')
    await controller.submitText('非法路径')
    clock.flush()
    await Promise.resolve()

    // illegal open_requested still dispatches to listener; Composition rejects path
    expect(listener).toHaveBeenCalled()
    const last = listener.mock.calls[listener.mock.calls.length - 1]?.[0]
    expect(last?.taskId).toBe('task-b')
  })
})

