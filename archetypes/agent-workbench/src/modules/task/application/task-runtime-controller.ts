/**
 * Task Runtime controller — subscribe RuntimePort, reduce into TaskReadModel.
 * Pure class + listener fan-out; React hook is a thin adapter.
 *
 * Phase 4D: approval / input / retry command surface.
 * Phase 4E: MemoryEventStore append + rehydrate; queueFollowUp / steer / reconcile.
 *
 * UI must not mutate Run status except via projection from events.
 */

import { isTerminalTurnStatus, type TurnStatus } from '../model/lifecycle'
import { localTitleFromPrompt } from '../model/title-policy'
import type { EventStorePort } from '../ports/event-store-port'
import type { RuntimePort, RuntimeSubscriptionEvent } from '../ports/runtime-port'
import { emptyProjectionState } from '../projection/empty-read-model'
import {
  isStreamingDeltaEvent,
  projectEvents,
  setTimelineFollowMode,
} from '../projection/project-events'
import type {
  ProjectionState,
  TaskReadModel,
  TimelineFollowMode,
} from '../projection/types'
import type {
  ApplicationCommand,
  CommandAcknowledgement,
  QuestionAnswer,
  TurnComposerContext,
} from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { questionAnswerToInputText } from '../protocol/question-answer'
import { runtimeHonestyCopy } from '../runtime/runtime-honesty'
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
   * Command clock for envelope timestamps (default: system wall-clock).
   * Pass a deterministic clock only in test harnesses that need stable ids.
   */
  clock?: CommandClock
  /**
   * How rehydrate notices describe the EventStore (D14).
   * Default `memory` for test harness; product path should pass `idb`.
   */
  eventStoreKind?: EventStoreHonestyKind
}

export type TaskRuntimeListener = () => void

/** Payload subset for Composition open Work Surface (spec §7). */
export type WorkSurfaceOpenRequestedPayload = {
  kind?: string
  resourceKey: string
  title?: string
  focus?: 'pane' | 'tab' | 'none'
  reason?: string
  relatedEventId?: string
  relatedArtifactId?: string
}

export type WorkSurfaceOpenRequestedListener = (
  envelope: {
    taskId: string
    payload: WorkSurfaceOpenRequestedPayload
  },
) => void

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
   * Runtime also supports queueFollowUp; controller prefers dispatching to runtime.
   */
  private localFollowUps: string[] = []
  /** Optional listener for runStatus changes (Navigator TurnStatusIndex). */
  private turnStatusListener: ((taskId: string, status: TurnStatus | null) => void) | null =
    null
  /**
   * Composition-only: work_surface.open_requested (does not mutate projection open set).
   */
  private workSurfaceOpenListener: WorkSurfaceOpenRequestedListener | null = null
  /** Streaming deltas waiting for the next animation frame / 40ms flush. */
  private pendingEnvelopes: AgentRuntimeEventEnvelope[] = []
  private flushHandle: { kind: 'raf' | 'timeout'; id: number } | null = null
  /** Serializes EventStore writes so a flush is one async chain, not N races. */
  private persistQueue: Promise<void> = Promise.resolve()

  constructor(options: TaskRuntimeControllerOptions) {
    this.runtime = options.runtime
    this.projectId = options.projectId
    this.eventStore = options.eventStore ?? null
    this.honesty = runtimeHonestyCopy()
    this.eventStoreKind = options.eventStoreKind ?? 'memory'
    const clock: CommandClock =
      options.clock ?? { nowIso: () => new Date().toISOString() }
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

  setTurnStatusListener(
    listener: ((taskId: string, status: TurnStatus | null) => void) | null,
  ): void {
    this.turnStatusListener = listener
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

  /** True while a non-terminal Turn is active or a command is in flight. */
  isBusy(): boolean {
    if (this.pending) return true
    const status = this.projection.readModel.turnStatus
    if (!status) return false
    return !isTerminalTurnStatus(status)
  }

  getRunStatus(): TurnStatus | null {
    return this.projection.readModel.turnStatus
  }

  /** Stable snapshot key for React external store. */
  getRevision(): number {
    return this.revision
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
    this.clearPendingProjection()
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
            this.emitTurnStatus()
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
            this.emitTurnStatus()
            this.emit()
          }
        }

        // Non-terminal rehydrate: notice only. v2 does not invent an interrupted fact.
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
    this.clearPendingProjection()
    this.detachSubscription()
    this.taskId = null
    this.localFollowUps = []
  }

  /**
   * Apply any buffered streaming deltas now. Tests / VirtualClock use this
   * instead of waiting for rAF or the 40ms timer.
   */
  flushPendingProjection(): void {
    this.flushPendingProjectionInternal({ emit: true })
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
    if (this.projection.readModel.turnStatus === 'waiting_for_input') {
      return this.provideRunInput(trimmed, undefined, {
        kind: 'freeText',
        text: trimmed,
      })
    }

    // waiting_for_approval: do not accept free-form submit as turn
    if (this.projection.readModel.turnStatus === 'waiting_for_approval') {
      this.notice = '当前等待审批，请使用「允许一次」或「拒绝」'
      this.emit()
      return null
    }

    if (this.isBusy() && this.projection.readModel.turnStatus) {
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
    return this.runCommandTransaction(
      () => this.commands.cancelRun({
        taskId,
        turnId: this.projection.readModel.activeTurnId ?? undefined,
      }),
      (ack) => {
        if (ack.status === 'accepted' || ack.status === 'duplicate') {
          this.notice = this.honesty.cancelAccepted
        } else {
          this.notice =
            ack.message ??
            `取消未接受：${ack.status}${ack.reasonCode ? ` (${ack.reasonCode})` : ''}`
        }
      },
    )
  }

  async respondToApproval(
    requestId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    return this.runCommandTransaction(
      () => this.commands.respondToApproval({
        taskId,
        requestId,
        decision,
        reason,

        turnId: this.projection.readModel.activeTurnId ?? undefined,
      }),
      (ack) => {
        if (ack.status === 'accepted' || ack.status === 'duplicate') {
          this.notice =
            decision === 'approved'
              ? this.honesty.approvalApproved
              : this.honesty.approvalRejected
        } else {
          this.notice = ack.message ?? `审批响应未接受：${ack.status}`
        }
      },
    )
  }

  async provideRunInput(
    text: string,
    requestId?: string,
    answer?: QuestionAnswer,
  ): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const rid = requestId ?? pendingInputRequestId(this.projection.readModel)
    if (!rid) {
      this.notice = '当前没有待补充的输入请求'
      this.emit()
      return null
    }
    return this.runCommandTransaction(
      () => this.commands.provideRunInput({
        taskId,
        inputText: text,
        requestId: rid,

        turnId: this.projection.readModel.activeTurnId ?? undefined,
        answer,
      }),
      (ack) => {
        if (ack.status === 'accepted' || ack.status === 'duplicate') {
          this.notice = this.honesty.inputProvided
        } else {
          this.notice = ack.message ?? `补充输入未接受：${ack.status}`
        }
      },
    )
  }

  async respondToQuestion(
    requestId: string,
    answer: QuestionAnswer,
  ): Promise<CommandAcknowledgement | null> {
    const item = this.projection.readModel.timeline.find(
      (row) =>
        row.category === 'input-request' &&
        row.id === `input-request:${requestId}`,
    )
    const inputText = questionAnswerToInputText(
      answer,
      item?.meta?.question?.options ?? [],
    )
    return this.provideRunInput(inputText, requestId, answer)
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
    return this.runCommandTransaction(
      () => this.commands.retryTurn({
        taskId,
        turnId: tid,
      }),
      (ack) => {
        if (ack.status === 'accepted' || ack.status === 'duplicate') {
          this.notice = this.honesty.retryAccepted
        } else {
          this.notice = ack.message ?? `重试未接受：${ack.status}`
        }
      },
    )
  }

  async queueFollowUp(text: string): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const trimmed = text.trim()
    if (!trimmed) return null

    return this.runCommandTransaction(
      () => this.commands.queueFollowUp({
        taskId,
        inputText: trimmed,
      }),
      (ack) => {
        if (ack.status === 'accepted' || ack.status === 'duplicate') {
          this.notice = this.honesty.queueAccepted
        } else if (ack.status === 'unsupported') {
          // Fallback local queue + submit when idle
          this.localFollowUps.push(trimmed)
          this.notice = '已本地排队（Runtime 未实现 queueFollowUp）'
          this.maybeDrainLocalQueue()
        } else {
          this.notice = ack.message ?? `排队未接受：${ack.status}`
        }
      },
    )
  }

  async steerRun(text: string): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const turnId = this.projection.readModel.activeTurnId
    if (!turnId) {
      this.notice = '没有可转向的活动轮次'
      this.emit()
      return null
    }
    return this.runCommandTransaction(
      () => this.commands.steerRun({
        taskId,
        turnId,
        inputText: text,
      }),
      (ack) => {
        if (ack.status === 'accepted' || ack.status === 'duplicate') {
          this.notice = this.honesty.steerAccepted
        } else {
          this.notice = ack.message ?? `转向未接受：${ack.status}`
        }
      },
    )
  }

  async reconcileInterruptedRun(options?: {
    turnId?: string
    runtimeCursor?: string
  }): Promise<CommandAcknowledgement | null> {
    const taskId = this.taskId
    if (!taskId) return null
    const turnId = options?.turnId ?? this.projection.readModel.activeTurnId
    if (!turnId) {
      this.notice = '缺少 turnId，无法恢复'
      this.emit()
      return null
    }
    const cursor =
      options?.runtimeCursor ?? String(this.projection.readModel.lastTaskSequence)
    return this.runCommandTransaction(
      () => this.commands.reconcileInterruptedRun({
        taskId,
        turnId,
        runtimeCursor: cursor,
      }),
      (ack) => {
        if (ack.status === 'accepted' || ack.status === 'duplicate') {
          this.notice = this.honesty.reconcileAccepted
        } else {
          this.notice = ack.message ?? `对账未接受：${ack.status}`
        }
      },
    )
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
  }

  setWorkSurfaceOpenListener(
    listener: WorkSurfaceOpenRequestedListener | null,
  ): void {
    this.workSurfaceOpenListener = listener
  }

  private onSubscriptionEvent(event: RuntimeSubscriptionEvent): void {
    if (event.kind === 'event') {
      if (event.envelope.taskId !== this.taskId) return
      // Composition open channel — only for the attached (selected) task.
      if (String(event.envelope.eventType) === 'work_surface.open_requested') {
        this.dispatchWorkSurfaceOpen(event.envelope)
      }
      if (isStreamingDeltaEvent(String(event.envelope.eventType))) {
        this.pendingEnvelopes.push(event.envelope)
        this.scheduleProjectionFlush()
        return
      }
      this.flushPendingProjectionInternal({ emit: false })
      this.applyProjectedEnvelopes([event.envelope], { persist: true, emit: true })
      return
    }
    if (event.kind === 'gap') {
      this.flushPendingProjectionInternal({ emit: false })
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
      this.flushPendingProjectionInternal({ emit: false })
      this.notice = event.message || event.code
      this.emit()
    }
  }

  private dispatchWorkSurfaceOpen(
    envelope: AgentRuntimeEventEnvelope,
  ): void {
    if (!this.workSurfaceOpenListener) return
    const payload = (envelope.payload ?? {}) as Record<string, unknown>
    const resourceKey =
      typeof payload.resourceKey === 'string' ? payload.resourceKey : ''
    if (!resourceKey) return
    this.workSurfaceOpenListener({
      taskId: envelope.taskId,
      payload: {
        kind: typeof payload.kind === 'string' ? payload.kind : undefined,
        resourceKey,
        title: typeof payload.title === 'string' ? payload.title : undefined,
        focus:
          payload.focus === 'pane' ||
          payload.focus === 'tab' ||
          payload.focus === 'none'
            ? payload.focus
            : undefined,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
        relatedEventId:
          typeof payload.relatedEventId === 'string'
            ? payload.relatedEventId
            : undefined,
        relatedArtifactId:
          typeof payload.relatedArtifactId === 'string'
            ? payload.relatedArtifactId
            : undefined,
      },
    })
  }

  private applyProjectedEnvelopes(
    envelopes: readonly AgentRuntimeEventEnvelope[],
    options: { persist: boolean; emit: boolean },
  ): void {
    if (envelopes.length === 0) return
    this.projection = projectEvents(this.projection, envelopes)
    if (options.persist) {
      this.enqueuePersist(envelopes)
    }
    const status = this.projection.readModel.turnStatus
    if (status && isTerminalTurnStatus(status)) {
      this.maybeDrainLocalQueue()
    }
    if (options.emit) {
      this.emitTurnStatus()
      this.emit()
    }
  }

  private flushPendingProjectionInternal(options: { emit: boolean }): void {
    this.cancelScheduledFlush()
    if (this.pendingEnvelopes.length === 0) return
    const batch = this.pendingEnvelopes
    this.pendingEnvelopes = []
    this.applyProjectedEnvelopes(batch, { persist: true, emit: options.emit })
  }

  private scheduleProjectionFlush(): void {
    if (this.flushHandle) return
    const generation = this.attachGeneration
    const taskId = this.taskId
    const run = (): void => {
      this.flushHandle = null
      if (generation !== this.attachGeneration || this.taskId !== taskId) {
        this.pendingEnvelopes = []
        return
      }
      this.flushPendingProjectionInternal({ emit: true })
    }
    if (typeof requestAnimationFrame === 'function') {
      this.flushHandle = {
        kind: 'raf',
        id: requestAnimationFrame(run),
      }
      return
    }
    this.flushHandle = {
      kind: 'timeout',
      id: setTimeout(run, 40) as unknown as number,
    }
  }

  private cancelScheduledFlush(): void {
    if (!this.flushHandle) return
    if (this.flushHandle.kind === 'raf') {
      cancelAnimationFrame(this.flushHandle.id)
    } else {
      clearTimeout(this.flushHandle.id)
    }
    this.flushHandle = null
  }

  private clearPendingProjection(): void {
    this.cancelScheduledFlush()
    this.pendingEnvelopes = []
  }

  private enqueuePersist(
    envelopes: readonly AgentRuntimeEventEnvelope[],
  ): void {
    if (!this.eventStore || envelopes.length === 0) return
    this.persistQueue = this.persistQueue
      .catch(() => undefined)
      .then(() => this.persistEnvelopes(envelopes))
  }

  private async persistEnvelopes(
    envelopes: readonly AgentRuntimeEventEnvelope[],
  ): Promise<void> {
    if (!this.eventStore || envelopes.length === 0) return
    for (let i = 0; i < envelopes.length; i += 1) {
      const envelope = envelopes[i]!
      const checkpoint = i === envelopes.length - 1
      if (checkpoint) {
        await this.persistEnvelope(envelope)
        continue
      }
      try {
        const result = await this.eventStore.append(envelope)
        if (result.status === 'conflict') {
          this.markPersistenceDegraded('事件序号冲突，本地持久化可能不完整')
          return
        }
      } catch {
        this.markPersistenceDegraded(
          '本地持久化写入失败；当前投影仍可用，但刷新后不一定能恢复',
        )
        return
      }
    }
  }

  private markPersistenceDegraded(notice: string): void {
    this.persistenceDegraded = true
    this.notice = notice
    this.emit()
  }

  private async persistEnvelope(
    envelope: AgentRuntimeEventEnvelope,
  ): Promise<void> {
    if (!this.eventStore) return
    const snapshot = {
      taskId: envelope.taskId,

      protocolVersion: envelope.schemaVersion,
      turnStatus: this.projection.readModel.turnStatus ?? undefined,
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
        this.markPersistenceDegraded('事件序号冲突，本地持久化可能不完整')
      }
    } catch {
      this.markPersistenceDegraded(
        '本地持久化写入失败；当前投影仍可用，但刷新后不一定能恢复',
      )
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
   * When a rehydrated turn is still non-terminal, surface a notice.
   * v2 does not invent a `run.interrupted` fact.
   */
  private async ensureInterruptedOnRehydrate(
    taskId: string,
    generation: number,
  ): Promise<void> {
    const status = this.projection.readModel.turnStatus
    if (!status || isTerminalTurnStatus(status)) {
      return
    }
    if (generation !== this.attachGeneration || this.taskId !== taskId) return
    this.notice =
      (this.notice ? `${this.notice} · ` : '') +
      '上次轮次在刷新前未结束'
    this.emitTurnStatus()
    this.emit()
  }

  private emitTurnStatus(): void {
    if (!this.turnStatusListener || !this.taskId) return
    this.turnStatusListener(this.taskId, this.projection.readModel.turnStatus)
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

  private async runCommandTransaction(
    createCommand: () => ApplicationCommand,
    handleAcknowledgement: (ack: CommandAcknowledgement) => void,
  ): Promise<CommandAcknowledgement> {
    this.pending = true
    this.emit()
    try {
      const command = createCommand()
      const ack = await dispatchCommand(this.runtime, command)
      await this.rememberAck(command.commandId, ack)
      handleAcknowledgement(ack)
      return ack
    } finally {
      this.pending = false
      this.emit()
    }
  }

  private maybeDrainLocalQueue(): void {
    if (this.localFollowUps.length === 0) return
    if (this.isBusy()) return
    const next = this.localFollowUps.shift()
    if (!next) return
    void this.submitText(next)
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
