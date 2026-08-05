/**
 * Task Runtime controller — subscribe RuntimePort, reduce into TaskReadModel.
 * Pure class + listener fan-out; React hook is a thin adapter.
 *
 * Phase 4D: approval / input / retry command surface.
 * Phase 4E: MemoryEventStore append + rehydrate; queueFollowUp / steer / reconcile.
 *
 * UI must not mutate Run status except via projection from events.
 */

import { isTerminalRunStatus, type RunStatus } from '../model/lifecycle'
import { localTitleFromPrompt } from '../model/title-policy'
import type { EventStorePort } from '../ports/event-store-port'
import type { RuntimePort, RuntimeSubscriptionEvent } from '../ports/runtime-port'
import { emptyProjectionState } from '../projection/empty-read-model'
import {
  applyRuntimeEvent,
  projectEvents,
  setTimelineFollowMode,
} from '../projection/project-events'
import type {
  ProjectionState,
  TaskReadModel,
  TimelineFollowMode,
} from '../projection/types'
import type { CommandAcknowledgement } from '../protocol/commands'
import type { DeterministicFakeRuntime } from '../runtime/fake-runtime'
import {
  runtimeHonestyCopy,
  type RuntimeHonestyMode,
} from '../runtime/runtime-honesty'
import { CommandFactory, type CommandClock } from './command-factory'
import { dispatchCommand } from './dispatch'

export interface TaskRuntimeControllerOptions {
  runtime: RuntimePort
  projectId: string
  /** Optional EventStore (MemoryEventStore for 4E demo/tests). */
  eventStore?: EventStorePort
  /** Command id seed prefix (default "wb"). */
  seed?: string
  /**
   * When true (default), after accepted submit/cancel flush Fake virtual clock
   * so stream steps apply synchronously (tests + demo).
   */
  autoFlush?: boolean
  /**
   * Honesty copy mode for user notices.
   * Default `fake` for Deterministic Fake; pass `voltagent` for local sidecar.
   */
  honestyMode?: RuntimeHonestyMode
}

export type TaskRuntimeListener = () => void

function isFakeRuntime(port: RuntimePort): port is DeterministicFakeRuntime {
  return (
    typeof port === 'object' &&
    port !== null &&
    'clock' in port &&
    typeof (port as DeterministicFakeRuntime).clock?.flush === 'function'
  )
}

/** Latest waiting timeline item id after `prefix` (e.g. approval-request: / input-request:). */
function pendingRequestId(
  model: TaskReadModel,
  category: 'approval-request' | 'input-request',
): string | null {
  const prefix = `${category}:`
  for (let i = model.timeline.length - 1; i >= 0; i -= 1) {
    const item = model.timeline[i]!
    if (item.category === category && item.status === 'waiting' && item.id.startsWith(prefix)) {
      return item.id.slice(prefix.length)
    }
  }
  return null
}

function pendingApprovalRequestId(model: TaskReadModel): string | null {
  return pendingRequestId(model, 'approval-request')
}

function pendingInputRequestId(model: TaskReadModel): string | null {
  return pendingRequestId(model, 'input-request')
}

export class TaskRuntimeController {
  private readonly runtime: RuntimePort
  private readonly projectId: string
  private readonly eventStore: EventStorePort | null
  private readonly autoFlush: boolean
  private readonly honesty: ReturnType<typeof runtimeHonestyCopy>
  private readonly commands: CommandFactory
  private readonly listeners = new Set<TaskRuntimeListener>()

  private taskId: string | null = null
  private createdTasks = new Set<string>()
  private unsub: (() => void) | null = null
  private projection: ProjectionState
  private notice: string | null = null
  private pending = false
  /** Monotonic revision for useSyncExternalStore snapshots. */
  private revision = 0
  /**
   * Controller-side follow-up queue (product UX).
   * Fake also supports queueFollowUp; controller prefers dispatching to runtime.
   */
  private localFollowUps: string[] = []

  constructor(options: TaskRuntimeControllerOptions) {
    this.runtime = options.runtime
    this.projectId = options.projectId
    this.eventStore = options.eventStore ?? null
    this.autoFlush = options.autoFlush ?? true
    this.honesty = runtimeHonestyCopy(options.honestyMode ?? 'fake')
    const clock: CommandClock = isFakeRuntime(options.runtime)
      ? options.runtime.clock
      : { nowIso: () => new Date().toISOString() }
    this.commands = new CommandFactory({
      clock,
      seed: options.seed ?? 'wb',
    })
    this.projection = emptyProjectionState({
      taskId: '',
      projectId: options.projectId,
    })
  }

  get readModel(): TaskReadModel {
    return this.projection.readModel
  }

  getNotice(): string | null {
    return this.notice
  }

  /** True while a non-terminal Run is active or a command is in flight. */
  isBusy(): boolean {
    if (this.pending) return true
    const status = this.projection.readModel.runStatus
    if (!status) return false
    return !isTerminalRunStatus(status)
  }

  getRunStatus(): RunStatus | null {
    return this.projection.readModel.runStatus
  }

  /** Stable snapshot key for React external store. */
  getRevision(): number {
    return this.revision
  }

  /** Access Fake clock for tests (advance / flush). */
  getFakeRuntime(): DeterministicFakeRuntime | null {
    return isFakeRuntime(this.runtime) ? this.runtime : null
  }

  subscribe(listener: TaskRuntimeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Bind controller to a task id: ensure createTask once, rehydrate from store,
   * subscribe from last sequence.
   */
  async attach(taskId: string, options?: { title?: string }): Promise<void> {
    if (this.taskId === taskId && this.unsub) return

    this.detachSubscription()
    this.taskId = taskId
    this.localFollowUps = []
    this.projection = emptyProjectionState({
      taskId,
      projectId: this.projectId,
      title: options?.title,
    })
    this.notice = null
    this.emit()

    await this.ensureTaskCreated(taskId, options?.title)

    let cursor = 0
    if (this.eventStore) {
      const stored = await this.eventStore.read({
        taskId,
        fromSequence: 1,
      })
      if (stored.length > 0) {
        this.projection = projectEvents(
          emptyProjectionState({
            taskId,
            projectId: this.projectId,
            title: options?.title,
          }),
          stored,
        )
        cursor = this.projection.readModel.lastTaskSequence
        this.notice = '已从本地 EventStore 恢复时间线（Memory，非生产持久化）'
        this.emit()
      }
    }

    this.unsub = this.runtime.subscribe(taskId, cursor, (event) => {
      this.onSubscriptionEvent(event)
    })
  }

  detach(): void {
    this.detachSubscription()
    this.taskId = null
    this.localFollowUps = []
  }

  async submitText(text: string): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const trimmed = text.trim()
    if (!trimmed) return null

    // waiting_for_input: route to provideRunInput
    if (this.projection.readModel.runStatus === 'waiting_for_input') {
      return this.provideRunInput(trimmed)
    }

    // waiting_for_approval: do not accept free-form submit as turn
    if (this.projection.readModel.runStatus === 'waiting_for_approval') {
      this.notice = '当前等待审批，请使用「允许一次」或「拒绝」'
      this.emit()
      return null
    }

    if (this.isBusy() && this.projection.readModel.runStatus) {
      // Prefer queue while busy (4E).
      return this.queueFollowUp(trimmed)
    }

    this.pending = true
    this.notice = null
    this.emit()

    const currentTitle = this.projection.readModel.title
    if (
      !currentTitle ||
      currentTitle === '未命名任务' ||
      currentTitle === '新任务'
    ) {
      const localTitle = localTitleFromPrompt(trimmed)
      this.projection = {
        ...this.projection,
        readModel: {
          ...this.projection.readModel,
          title: localTitle,
          titleSource: 'local',
        },
      }
    }

    try {
      const command = this.commands.submitTurn({
        taskId,
        inputText: trimmed,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice = this.honesty.submitAccepted
        this.maybeFlush()
      } else {
        this.notice =
          ack.message ??
          `提交未接受：${ack.status}${ack.reasonCode ? ` (${ack.reasonCode})` : ''}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  async cancelActiveRun(): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const runId = this.projection.readModel.activeRunId ?? undefined

    this.pending = true
    this.emit()
    try {
      const command = this.commands.cancelRun({
        taskId,
        runId: runId ?? undefined,
        turnId: this.projection.readModel.activeTurnId ?? undefined,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice = this.honesty.cancelAccepted
        this.maybeFlush()
      } else {
        this.notice =
          ack.message ??
          `取消未接受：${ack.status}${ack.reasonCode ? ` (${ack.reasonCode})` : ''}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  async respondToApproval(
    requestId: string,
    decision: 'approved' | 'rejected',
  ): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    this.pending = true
    this.emit()
    try {
      const command = this.commands.respondToApproval({
        taskId,
        requestId,
        decision,
        runId: this.projection.readModel.activeRunId ?? undefined,
        turnId: this.projection.readModel.activeTurnId ?? undefined,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice =
          decision === 'approved'
            ? this.honesty.approvalApproved
            : this.honesty.approvalRejected
        this.maybeFlush()
      } else {
        this.notice = ack.message ?? `审批响应未接受：${ack.status}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  async provideRunInput(text: string, requestId?: string): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const rid = requestId ?? pendingInputRequestId(this.projection.readModel)
    if (!rid) {
      this.notice = '当前没有待补充的输入请求'
      this.emit()
      return null
    }
    this.pending = true
    this.emit()
    try {
      const command = this.commands.provideRunInput({
        taskId,
        inputText: text,
        requestId: rid,
        runId: this.projection.readModel.activeRunId ?? undefined,
        turnId: this.projection.readModel.activeTurnId ?? undefined,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice = this.honesty.inputProvided
        this.maybeFlush()
      } else {
        this.notice = ack.message ?? `补充输入未接受：${ack.status}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  async retryTurn(turnId?: string): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const tid = turnId ?? this.projection.readModel.activeTurnId
    if (!tid) {
      this.notice = '没有可重试的 Turn'
      this.emit()
      return null
    }
    this.pending = true
    this.emit()
    try {
      const command = this.commands.retryTurn({
        taskId,
        turnId: tid,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice = '已重试 Turn（Fake Runtime，非生产）'
        this.maybeFlush()
      } else {
        this.notice = ack.message ?? `重试未接受：${ack.status}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  async queueFollowUp(text: string): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const trimmed = text.trim()
    if (!trimmed) return null

    this.pending = true
    this.emit()
    try {
      const command = this.commands.queueFollowUp({
        taskId,
        inputText: trimmed,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice = '已排队后续消息（Fake queue，非生产）'
        this.maybeFlush()
      } else if (ack.status === 'unsupported') {
        // Fallback local queue + submit when idle
        this.localFollowUps.push(trimmed)
        this.notice = '已本地排队（Runtime 未实现 queueFollowUp）'
        this.maybeDrainLocalQueue()
      } else {
        this.notice = ack.message ?? `排队未接受：${ack.status}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  async steerRun(text: string): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const runId = this.projection.readModel.activeRunId
    if (!runId) {
      this.notice = '没有可转向的活动 Run'
      this.emit()
      return null
    }
    this.pending = true
    this.emit()
    try {
      const command = this.commands.steerRun({
        taskId,
        runId,
        inputText: text,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice = '已发送转向（Fake steer，非生产）'
        this.maybeFlush()
      } else {
        this.notice = ack.message ?? `转向未接受：${ack.status}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  async reconcileInterruptedRun(options?: {
    turnId?: string
    runId?: string
    runtimeCursor?: string
  }): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const runId = options?.runId ?? this.projection.readModel.activeRunId
    const turnId = options?.turnId ?? this.projection.readModel.activeTurnId
    if (!runId || !turnId) {
      this.notice = '缺少 runId/turnId，无法恢复'
      this.emit()
      return null
    }
    const cursor =
      options?.runtimeCursor ?? String(this.projection.readModel.lastTaskSequence)
    this.pending = true
    this.emit()
    try {
      const command = this.commands.reconcileInterruptedRun({
        taskId,
        turnId,
        runId,
        runtimeCursor: cursor,
      })
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      if (ack.status === 'accepted' || ack.status === 'duplicate') {
        this.notice = '已对账中断 Run（Fake reconcile，非生产）'
        this.maybeFlush()
      } else {
        this.notice = ack.message ?? `对账未接受：${ack.status}`
      }
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  /** Approve the latest waiting approval request. */
  async approveLatest(): Promise<CommandAcknowledgement | null> {
    const id = pendingApprovalRequestId(this.projection.readModel)
    if (!id) {
      this.notice = '当前没有待审批请求'
      this.emit()
      return null
    }
    return this.respondToApproval(id, 'approved')
  }

  async rejectLatest(): Promise<CommandAcknowledgement | null> {
    const id = pendingApprovalRequestId(this.projection.readModel)
    if (!id) {
      this.notice = '当前没有待审批请求'
      this.emit()
      return null
    }
    return this.respondToApproval(id, 'rejected')
  }

  setFollowMode(mode: TimelineFollowMode): void {
    this.projection = setTimelineFollowMode(this.projection, mode, {
      resetUnread: mode === 'follow',
    })
    this.emit()
  }

  /** Test / harness: flush Fake virtual clock. */
  flush(): void {
    const fake = this.getFakeRuntime()
    fake?.clock.flush()
    this.emit()
  }

  private async ensureTaskCreated(taskId: string, title?: string): Promise<void> {
    if (this.createdTasks.has(taskId)) return
    const command = this.commands.createTask({
      proposedTaskId: taskId,
      projectId: this.projectId,
      title,
    })
    const ack = await dispatchCommand(this.runtime, command)
    await this.rememberAck(command.commandId, ack)
    // accepted or rejected(task_exists) both mean the task is available.
    if (ack.status === 'accepted' || ack.reasonCode === 'task_exists') {
      this.createdTasks.add(taskId)
    }
    this.maybeFlush()
  }

  private onSubscriptionEvent(event: RuntimeSubscriptionEvent): void {
    if (event.kind === 'event') {
      this.projection = applyRuntimeEvent(this.projection, event.envelope)
      void this.persistEnvelope(event.envelope)
      // Drain local queue after terminal (Fake also drains its own queue).
      const status = this.projection.readModel.runStatus
      if (status && isTerminalRunStatus(status)) {
        this.maybeDrainLocalQueue()
      }
      this.emit()
      return
    }
    if (event.kind === 'gap') {
      this.projection = {
        ...this.projection,
        readModel: {
          ...this.projection.readModel,
          recoveryRequired: true,
        },
      }
      this.notice = event.message ?? '事件序列存在缺口，可尝试 reconcile'
      this.emit()
      return
    }
    if (event.kind === 'error') {
      this.notice = event.message || event.code
      this.emit()
    }
  }

  private async persistEnvelope(
    envelope: import('../protocol/events').AgentRuntimeEventEnvelope,
  ): Promise<void> {
    if (!this.eventStore) return
    try {
      await this.eventStore.append(envelope)
      await this.eventStore.putSnapshot({
        taskId: envelope.taskId,
        runId: envelope.runId,
        protocolVersion: envelope.schemaVersion,
        runStatus: this.projection.readModel.runStatus ?? undefined,
        lastTaskSequence: this.projection.readModel.lastTaskSequence,
        runtimeCursor: envelope.runtimeCursor,
        projectionVersion: this.projection.readModel.projectionVersion,
      })
    } catch {
      // Memory store should not throw; ignore for demo resilience.
    }
  }

  private async rememberAck(
    commandId: string,
    ack: CommandAcknowledgement,
  ): Promise<void> {
    if (!this.eventStore) return
    try {
      await this.eventStore.putCommandAcknowledgement(commandId, ack)
    } catch {
      // ignore
    }
  }

  private maybeDrainLocalQueue(): void {
    if (this.localFollowUps.length === 0) return
    if (this.isBusy()) return
    const next = this.localFollowUps.shift()
    if (!next) return
    void this.submitText(next)
  }

  private maybeFlush(): void {
    if (!this.autoFlush) return
    const fake = this.getFakeRuntime()
    if (!fake) return
    fake.clock.flush()
  }

  private detachSubscription(): void {
    if (this.unsub) {
      this.unsub()
      this.unsub = null
    }
  }

  private emit(): void {
    this.revision += 1
    for (const listener of this.listeners) {
      listener()
    }
  }
}
