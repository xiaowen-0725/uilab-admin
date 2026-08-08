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
import type { TurnComposerContext } from '../protocol/commands'
import type { DeterministicFakeRuntime } from '../runtime/fake-runtime'
import {
  runtimeHonestyCopy,
  type RuntimeHonestyMode,
} from '../runtime/runtime-honesty'
import { CommandFactory, type CommandClock } from './command-factory'
import { dispatchCommand } from './dispatch'

export type EventStoreHonestyKind = 'memory' | 'idb' | 'degraded'

export interface TaskRuntimeControllerOptions {
  runtime: RuntimePort
  projectId: string
  /** Optional EventStore (Memory or IndexedDB). */
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
  /**
   * How rehydrate notices describe the EventStore (D14).
   * Default `memory` for test harness; product path should pass `idb`.
   */
  eventStoreKind?: EventStoreHonestyKind
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
  private projectId: string
  private readonly eventStore: EventStorePort | null
  private readonly autoFlush: boolean
  private readonly honesty: ReturnType<typeof runtimeHonestyCopy>
  private readonly eventStoreKind: EventStoreHonestyKind
  private readonly commands: CommandFactory
  private readonly listeners = new Set<TaskRuntimeListener>()

  private taskId: string | null = null
  private createdTasks = new Set<string>()
  private unsub: (() => void) | null = null
  private projection: ProjectionState
  private notice: string | null = null
  private pending = false
  private persistenceDegraded = false
  /** Monotonic revision for useSyncExternalStore snapshots. */
  private revision = 0
  /** Invalidates async attach work when task selection changes. */
  private attachGeneration = 0
  /**
   * Controller-side follow-up queue (product UX).
   * Fake also supports queueFollowUp; controller prefers dispatching to runtime.
   */
  private localFollowUps: string[] = []
  /** Optional listener for runStatus changes (Navigator RunStatusIndex). */
  private runStatusListener: ((taskId: string, status: RunStatus | null) => void) | null =
    null

  constructor(options: TaskRuntimeControllerOptions) {
    this.runtime = options.runtime
    this.projectId = options.projectId
    this.eventStore = options.eventStore ?? null
    this.autoFlush = options.autoFlush ?? true
    this.honesty = runtimeHonestyCopy(options.honestyMode ?? 'fake')
    this.eventStoreKind = options.eventStoreKind ?? 'memory'
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

  /** Update projectId when user switches Project (same controller instance). */
  setProjectId(projectId: string): void {
    this.projectId = projectId
  }

  setRunStatusListener(
    listener: ((taskId: string, status: RunStatus | null) => void) | null,
  ): void {
    this.runStatusListener = listener
  }

  isPersistenceDegraded(): boolean {
    return this.persistenceDegraded
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
   * Bind controller to a task id: ensure createTask once, rehydrate from store
   * (snapshot + tail, D8), subscribe from last sequence.
   */
  async attach(taskId: string, options?: { title?: string }): Promise<void> {
    if (this.taskId === taskId && this.unsub) return

    const generation = ++this.attachGeneration
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
    if (generation !== this.attachGeneration || this.taskId !== taskId) return

    let cursor = 0
    if (this.eventStore) {
      try {
        const snapshot = await this.eventStore.getSnapshot(taskId)
        if (generation !== this.attachGeneration || this.taskId !== taskId) return

        let base = emptyProjectionState({
          taskId,
          projectId: this.projectId,
          title: options?.title,
        })
        let fromSequence = 1

        if (snapshot && snapshot.lastTaskSequence > 0) {
          // Snapshot accelerates tail read; projection still needs events for full timeline.
          // Load all events from 1 when no rich projection blob is stored (thin snapshot).
          // Tail optimization: if we only need sequence cursor, still replay from 1 for UI.
          const from = 1
          const stored = await this.eventStore.read({
            taskId,
            fromSequence: from,
          })
          if (generation !== this.attachGeneration || this.taskId !== taskId) return
          if (stored.length > 0) {
            this.projection = projectEvents(base, stored)
            cursor = this.projection.readModel.lastTaskSequence
            this.notice = this.rehydrateNotice()
            this.emitRunStatus()
            this.emit()
          } else {
            cursor = snapshot.lastTaskSequence
          }
        } else {
          const stored = await this.eventStore.read({
            taskId,
            fromSequence: 1,
          })
          if (generation !== this.attachGeneration || this.taskId !== taskId) return
          if (stored.length > 0) {
            this.projection = projectEvents(base, stored)
            cursor = this.projection.readModel.lastTaskSequence
            this.notice = this.rehydrateNotice()
            this.emitRunStatus()
            this.emit()
          }
        }

        // D8: non-terminal rehydrate → append run.interrupted fact then optional reconcile.
        await this.ensureInterruptedOnRehydrate(taskId, generation)
        if (generation !== this.attachGeneration || this.taskId !== taskId) return
        cursor = this.projection.readModel.lastTaskSequence
        void fromSequence
      } catch {
        this.persistenceDegraded = true
        this.notice =
          '本地事件恢复失败，当前会话可能无法在刷新后完整保留'
        this.emit()
      }
    }

    this.unsub = this.runtime.subscribe(taskId, cursor, (event) => {
      if (generation !== this.attachGeneration || this.taskId !== taskId) return
      this.onSubscriptionEvent(event)
    })
  }

  detach(): void {
    this.attachGeneration += 1
    this.detachSubscription()
    this.taskId = null
    this.localFollowUps = []
  }

  async submitText(
    text: string,
    composerContext?: TurnComposerContext,
  ): Promise<CommandAcknowledgement | null> {
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
      currentTitle === '新任务' ||
      currentTitle === '新对话'
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
        composerContext,
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
        this.notice = this.honesty.retryAccepted
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
        this.notice = this.honesty.queueAccepted
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
        this.notice = this.honesty.steerAccepted
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
        this.notice = this.honesty.reconcileAccepted
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
      if (event.envelope.taskId !== this.taskId) return
      this.projection = applyRuntimeEvent(this.projection, event.envelope)
      void this.persistEnvelope(event.envelope)
      // Drain local queue after terminal (Fake also drains its own queue).
      const status = this.projection.readModel.runStatus
      if (status && isTerminalRunStatus(status)) {
        this.maybeDrainLocalQueue()
      }
      this.emitRunStatus()
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
    const snapshot = {
      taskId: envelope.taskId,
      runId: envelope.runId,
      protocolVersion: envelope.schemaVersion,
      runStatus: this.projection.readModel.runStatus ?? undefined,
      lastTaskSequence: this.projection.readModel.lastTaskSequence,
      runtimeCursor: envelope.runtimeCursor,
      projectionVersion: this.projection.readModel.projectionVersion,
    }
    try {
      const result = await this.eventStore.appendWithCheckpoint({
        envelope,
        snapshot,
      })
      if (result.append.status === 'conflict') {
        this.persistenceDegraded = true
        this.notice = '事件序号冲突，本地持久化可能不完整'
        this.emit()
      }
    } catch {
      this.persistenceDegraded = true
      this.notice =
        '本地持久化写入失败；当前投影仍可用，但刷新后不一定能恢复'
      this.emit()
    }
  }

  private rehydrateNotice(): string {
    if (this.eventStoreKind === 'idb') {
      return '已从本地存储恢复时间线'
    }
    if (this.eventStoreKind === 'degraded') {
      return '已从降级内存恢复时间线（刷新后不可靠）'
    }
    return '已从本地 EventStore 恢复时间线（Memory，非生产持久化）'
  }

  /**
   * When rehydrated run is non-terminal, append run.interrupted as recovery fact (D8).
   */
  private async ensureInterruptedOnRehydrate(
    taskId: string,
    generation: number,
  ): Promise<void> {
    const status = this.projection.readModel.runStatus
    if (!status || isTerminalRunStatus(status) || status === 'interrupted') {
      return
    }
    if (!this.eventStore) return

    const nextSeq = this.projection.readModel.lastTaskSequence + 1
    const now = new Date().toISOString()
    const envelope: import('../protocol/events').AgentRuntimeEventEnvelope = {
      eventId: `${taskId}:rehydrate-interrupt:${nextSeq}`,
      eventType: 'run.interrupted',
      schemaVersion: 1,
      projectId: this.projectId,
      taskId,
      turnId: this.projection.readModel.activeTurnId ?? undefined,
      runId: this.projection.readModel.activeRunId ?? undefined,
      taskSequence: nextSeq,
      occurredAt: now,
      receivedAt: now,
      payload: { reason: 'rehydrate' },
    }

    this.projection = applyRuntimeEvent(this.projection, envelope)
    await this.persistEnvelope(envelope)
    if (generation !== this.attachGeneration || this.taskId !== taskId) return
    this.notice =
      (this.notice ? `${this.notice} · ` : '') +
      '上次运行在刷新前未结束，已标记为中断'
    this.emitRunStatus()
    this.emit()
  }

  private emitRunStatus(): void {
    if (!this.runStatusListener || !this.taskId) return
    this.runStatusListener(this.taskId, this.projection.readModel.runStatus)
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
