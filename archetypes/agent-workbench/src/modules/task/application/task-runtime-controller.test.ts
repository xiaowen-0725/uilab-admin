import { describe, expect, it } from 'vitest'

import type { EventStorePort } from '../ports/event-store-port'
import type { RuntimePort, RuntimeSubscriptionEvent } from '../ports/runtime-port'
import type {
  ApplicationCommand,
  CommandAcknowledgement,
} from '../protocol/commands'
import { envelope } from '../test/scripted-runtime-port'
import { TaskRuntimeController } from './task-runtime-controller'

const ISSUED_AT = '2026-08-13T08:00:00.000Z'

type BoundaryRuntime = RuntimePort & {
  receivedCommands: ApplicationCommand[]
  push: (taskId: string, event: RuntimeSubscriptionEvent) => void
}

type BoundaryEventStore = EventStorePort & {
  failAcknowledgementWrites: boolean
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, reject, resolve }
}

function createBoundaryRuntime(
  handleCommand: (
    command: ApplicationCommand,
  ) => Promise<CommandAcknowledgement>,
): BoundaryRuntime {
  const listeners = new Map<
    string,
    Set<(event: RuntimeSubscriptionEvent) => void>
  >()
  const receivedCommands: ApplicationCommand[] = []

  return {
    receivedCommands,
    push(taskId, event) {
      for (const listener of listeners.get(taskId) ?? []) listener(event)
    },
    async sendCommand(command) {
      receivedCommands.push(command)
      if (command.type === 'createTask') {
        return {
          status: 'accepted',
          commandId: command.commandId,
          acceptedAt: ISSUED_AT,
        }
      }
      return handleCommand(command)
    },
    subscribe(taskId, _cursor, listener) {
      const taskListeners = listeners.get(taskId) ?? new Set()
      taskListeners.add(listener)
      listeners.set(taskId, taskListeners)
      return () => taskListeners.delete(listener)
    },
    async getSnapshot() {
      return null
    },
    async getCapabilities(projectId, environmentId) {
      return {
        projectId,
        environmentId,
        features: {
          approval: true,
          cancel: true,
          queueFollowUp: true,
          runInput: true,
          steer: true,
        },
      }
    },
    async startRun(_input, idempotencyKey) {
      return {
        status: 'accepted',
        commandId: idempotencyKey,
        acceptedAt: ISSUED_AT,
      }
    },
  }
}

function createBoundaryEventStore(): BoundaryEventStore {
  return {
    failAcknowledgementWrites: false,
    async append(envelope) {
      return {
        status: 'appended',
        eventId: envelope.eventId,
        taskSequence: envelope.taskSequence,
      }
    },
    async appendWithCheckpoint({ envelope }) {
      return {
        append: {
          status: 'appended',
          eventId: envelope.eventId,
          taskSequence: envelope.taskSequence,
        },
      }
    },
    async read() {
      return []
    },
    async getSnapshot() {
      return null
    },
    async putSnapshot() {},
    async getCommandAcknowledgement() {
      return null
    },
    async putCommandAcknowledgement() {
      if (this.failAcknowledgementWrites) {
        throw new Error('ack store unavailable')
      }
    },
    async deleteTaskData() {},
  }
}

async function attachController(runtime: RuntimePort, eventStore?: EventStorePort) {
  const controller = new TaskRuntimeController({
    runtime,
    projectId: 'project-c4',
    eventStore,
    seed: 'c4',
    clock: { nowIso: () => ISSUED_AT },
  })
  await controller.attach('task-c4', { title: '既有任务' })
  return controller
}

describe('TaskRuntimeController command transactions', () => {
  it.each([
    {
      label: 'accepted acknowledgement',
      acknowledgement: {
        status: 'accepted',
        commandId: 'c4:command:2',
        acceptedAt: ISSUED_AT,
      } satisfies CommandAcknowledgement,
      notice: '已请求取消（本机 VoltAgent Runtime，非远程生产集群）',
    },
    {
      label: 'rejected acknowledgement',
      acknowledgement: {
        status: 'rejected',
        commandId: 'c4:command:2',
        reasonCode: 'runtime_busy',
        message: 'Runtime 正在处理另一条命令',
      } satisfies CommandAcknowledgement,
      notice: 'Runtime 正在处理另一条命令',
    },
  ])(
    'returns the exact $label and publishes pending start and finish',
    async ({ acknowledgement, notice }) => {
      const acknowledgementGate = deferred<CommandAcknowledgement>()
      const runtime = createBoundaryRuntime(() => acknowledgementGate.promise)
      const controller = await attachController(runtime)
      const baselineRevision = controller.getRevision()
      const observations: Array<{
        busy: boolean
        notice: string | null
        revision: number
      }> = []
      controller.subscribe(() => {
        observations.push({
          busy: controller.isBusy(),
          notice: controller.getNotice(),
          revision: controller.getRevision(),
        })
      })

      const resultPromise = controller.cancelActiveRun()

      expect(observations).toEqual([
        {
          busy: true,
          notice: null,
          revision: baselineRevision + 1,
        },
      ])

      acknowledgementGate.resolve(acknowledgement)

      await expect(resultPromise).resolves.toEqual(acknowledgement)
      expect(controller.getNotice()).toBe(notice)
      expect(controller.isBusy()).toBe(false)
      expect(observations).toEqual([
        {
          busy: true,
          notice: null,
          revision: baselineRevision + 1,
        },
        {
          busy: false,
          notice,
          revision: baselineRevision + 2,
        },
      ])
    },
  )

  it('rejects a RuntimePort throw after publishing the final non-busy revision', async () => {
    const runtimeFailure = new Error('sidecar disconnected')
    const commandGate = deferred<CommandAcknowledgement>()
    const runtime = createBoundaryRuntime(() => commandGate.promise)
    const controller = await attachController(runtime)
    const baselineRevision = controller.getRevision()
    const observations: Array<{ busy: boolean; revision: number }> = []
    controller.subscribe(() => {
      observations.push({
        busy: controller.isBusy(),
        revision: controller.getRevision(),
      })
    })

    const resultPromise = controller.cancelActiveRun()
    commandGate.reject(runtimeFailure)

    await expect(resultPromise).rejects.toBe(runtimeFailure)
    expect(controller.isBusy()).toBe(false)
    expect(controller.getRevision()).toBe(baselineRevision + 2)
    expect(observations).toEqual([
      { busy: true, revision: baselineRevision + 1 },
      { busy: false, revision: baselineRevision + 2 },
    ])
  })

  it('keeps an accepted result and notice when acknowledgement persistence fails', async () => {
    const acknowledgement = {
      status: 'accepted',
      commandId: 'c4:command:2',
      acceptedAt: ISSUED_AT,
    } satisfies CommandAcknowledgement
    const runtime = createBoundaryRuntime(async () => acknowledgement)
    const eventStore = createBoundaryEventStore()
    const controller = await attachController(runtime, eventStore)
    eventStore.failAcknowledgementWrites = true

    await expect(controller.cancelActiveRun()).resolves.toEqual(acknowledgement)
    expect(controller.getNotice()).toBe(
      '已请求取消（本机 VoltAgent Runtime，非远程生产集群）',
    )
    expect(controller.isBusy()).toBe(false)
  })

  it('submits a locally queued follow-up after a terminal Runtime event', async () => {
    const unsupported = {
      status: 'unsupported',
      commandId: 'c4:command:2',
      reasonCode: 'queue_follow_up_unavailable',
      message: 'queueFollowUp is unavailable',
    } satisfies CommandAcknowledgement
    const runtime = createBoundaryRuntime(async (command) => {
      if (command.type === 'queueFollowUp') return unsupported
      return {
        status: 'accepted',
        commandId: command.commandId,
        acceptedAt: ISSUED_AT,
      }
    })
    const controller = await attachController(runtime)
    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'run.queued', {
        taskSequence: 1,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
      }),
    })
    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'run.started', {
        taskSequence: 2,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
      }),
    })

    await expect(controller.queueFollowUp('  排队后继续  ')).resolves.toEqual(
      unsupported,
    )
    expect(controller.getNotice()).toBe(
      '已本地排队（Runtime 未实现 queueFollowUp）',
    )
    expect(
      runtime.receivedCommands.some(
        (command) =>
          command.type === 'submitTurn' && command.inputText === '排队后继续',
      ),
    ).toBe(false)

    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'run.completed', {
        taskSequence: 3,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
      }),
    })

    expect(
      runtime.receivedCommands.some(
        (command) =>
          command.type === 'submitTurn' && command.inputText === '排队后继续',
      ),
    ).toBe(true)
  })
})

describe('TaskRuntimeController projection coalescing', () => {
  it('keeps deltas buffered until flush, then applies them in order', async () => {
    const runtime = createBoundaryRuntime(async () => ({
      status: 'accepted',
      commandId: 'c4:command:2',
      acceptedAt: ISSUED_AT,
    }))
    const controller = await attachController(runtime)

    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'run.started', {
        taskSequence: 1,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
      }),
    })
    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'output.delta', {
        taskSequence: 2,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
        payload: { text: '你好' },
      }),
    })
    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'output.delta', {
        taskSequence: 3,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
        payload: { text: '世界' },
      }),
    })

    expect(
      controller.readModel.timeline.some((item) => item.category === 'assistant-message'),
    ).toBe(false)

    controller.flushPendingProjection()

    const assistant = controller.readModel.timeline.find(
      (item) => item.category === 'assistant-message',
    )
    expect(assistant?.body).toBe('你好世界')
  })

  it('flushes buffered deltas before applying a tool.called event', async () => {
    const runtime = createBoundaryRuntime(async () => ({
      status: 'accepted',
      commandId: 'c4:command:2',
      acceptedAt: ISSUED_AT,
    }))
    const controller = await attachController(runtime)

    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'run.started', {
        taskSequence: 1,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
      }),
    })
    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'output.delta', {
        taskSequence: 2,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
        payload: { text: '先看目录。' },
      }),
    })
    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'tool.called', {
        taskSequence: 3,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
        payload: { toolId: 'ls-1', name: 'ls', args: { path: '/' } },
      }),
    })

    const categories = controller.readModel.timeline.map((item) => item.category)
    expect(categories).toEqual(['run-terminal', 'assistant-message', 'tool-group'])
    expect(
      controller.readModel.timeline.find((item) => item.category === 'assistant-message')
        ?.body,
    ).toBe('先看目录。')
    expect(
      controller.readModel.timeline.find((item) => item.category === 'tool-group')?.status,
    ).toBe('running')
  })

  it('discards a pending delta buffer when attach switches tasks', async () => {
    const runtime = createBoundaryRuntime(async () => ({
      status: 'accepted',
      commandId: 'c4:command:2',
      acceptedAt: ISSUED_AT,
    }))
    const controller = await attachController(runtime)

    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'run.started', {
        taskSequence: 1,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
      }),
    })
    runtime.push('task-c4', {
      kind: 'event',
      envelope: envelope('task-c4', 'output.delta', {
        taskSequence: 2,
        runId: 'run-c4',
        turnId: 'turn-c4',
        projectId: 'project-c4',
        payload: { text: '不应出现在新任务' },
      }),
    })

    await controller.attach('task-c5', { title: '另一任务' })
    controller.flushPendingProjection()

    expect(controller.readModel.taskId).toBe('task-c5')
    expect(
      controller.readModel.timeline.some((item) =>
        item.body?.includes('不应出现在新任务'),
      ),
    ).toBe(false)
  })
})

