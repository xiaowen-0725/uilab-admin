/**
 * Deterministic Fake Runtime (Phase 4B–4F) — design §11.
 *
 * Scenarios:
 * - normal-stream-complete (s01): queued → started → output.delta* → completed
 * - cancel-run (s03): stays running until cancelRun
 * - reasoning-tools-complete (s02 class): full reasoning / plan / tool / command / file / source
 * - fixture-workflow: gold plan → reads → command → file.changed(diff) → output
 * - approval-approve | approval-reject: pause on approval.requested until respondToApproval
 * - waiting-input: pause on run.input_requested until provideRunInput
 * - fail-once-retry: first run fails; retryTurn (or next run) completes
 * - long-content: many output.delta chunks (>2k chars total) for 4F fold tests
 *
 * Default scenario stays `normal-stream-complete`.
 * Optional demo keyword auto-pick when default is normal-stream-complete and no pin
 * (工作流 / fixture / 审批 / 工具 / 澄清 / 长文 / 失败).
 *
 * Concurrency: submitTurn while busy → rejected task_busy.
 * queueFollowUp enqueues (4E); drains on run terminal.
 * steerRun while running → accepted + mid-stream note (4E).
 *
 * Fake success ≠ production Runtime. No network, Date.now, or Math.random.
 */

import {
  emptyTaskExecutionContext,
  type TaskExecutionContext,
} from '../model/execution-context'
import {
  asRunId,
  asTaskId,
  asTurnId,
  isTerminalRunStatus,
  type ProjectId,
  type Run,
  type RunId,
  type Task,
  type TaskId,
  type Turn,
  type TurnId,
} from '../model/lifecycle'
import { applyRunTransition } from '../model/run-transitions'
import { localTitleFromPrompt } from '../model/title-policy'
import type {
  ApplicationCommand,
  CommandAcknowledgement,
  CreateTaskCommand,
  ProvideRunInputCommand,
  QueueFollowUpCommand,
  ReconcileInterruptedRunCommand,
  RespondToApprovalCommand,
  RetryTurnCommand,
  SteerRunCommand,
  SubmitTurnCommand,
} from '../protocol/commands'
import type { AgentRuntimeEventEnvelope, AgentRuntimeEventType } from '../protocol/events'
import type {
  RuntimeCapabilities,
  RuntimePort,
  RuntimeSnapshot,
  RuntimeSubscriptionEvent,
  RunStartInput,
} from '../ports/runtime-port'
import { accepted, rejected, unsupported } from './command-acks'
import {
  buildLongContentDeltas,
  resolveScenarioFromKeywords,
  FIXTURE_WORKFLOW_STEPS,
  REASONING_TOOLS_STEPS,
  type FakeScenarioName,
} from './fake-scenario-data'
import { VirtualClock } from './virtual-clock'

export type { FakeScenarioName } from './fake-scenario-data'

export interface DeterministicFakeRuntimeOptions {
  /** Deterministic seed prefix for event/run ids (default "fake"). */
  seed?: string
  clock?: VirtualClock
  /** Default scenario for submitTurn streams (default normal-stream-complete). */
  defaultScenario?: FakeScenarioName
  /** Virtual ms between stream steps (default 10). */
  stepMs?: number
  /** Output delta chunks for normal-stream-complete (default 2 fixed strings). */
  outputDeltas?: readonly string[]
  /**
   * Build delta chunks from the submitted turn text (demo-friendly).
   * When set, overrides static `outputDeltas` for that turn.
   * Keyword scenarios still take precedence via resolveScenario.
   */
  buildOutputDeltas?: (inputText: string) => readonly string[]
  schemaVersion?: number
  /**
   * When true (default), if defaultScenario is normal-stream-complete and no pin,
   * pick scenario from prompt keywords (审批 / 工具 / 澄清 / 长文 / 失败).
   */
  keywordScenarios?: boolean
}

interface QueuedFollowUp {
  inputText: string
  proposedTurnId?: string
  proposedRunId?: string
}

interface PendingApproval {
  requestId: string
  runId: RunId
  turnId: TurnId
}

interface PendingInput {
  requestId: string
  runId: RunId
  turnId: TurnId
  prompt: string
}

interface TaskRecord {
  task: Task
  turns: Map<TurnId, Turn>
  runs: Map<RunId, Run>
  /** Task-local monotonic event sequence. */
  taskSequence: number
  events: AgentRuntimeEventEnvelope[]
  executionContext: TaskExecutionContext
  /** Foreground active run id if any non-terminal. */
  activeRunId: RunId | null
  turnCounter: number
  runCounter: number
  pendingApproval: PendingApproval | null
  pendingInput: PendingInput | null
  /** fail-once-retry: first run of this task already failed. */
  failOnceUsed: boolean
  followUpQueue: QueuedFollowUp[]
}

interface IdempotencyEntry {
  commandId: string
  acknowledgement: CommandAcknowledgement
}

interface Subscriber {
  taskId: string
  /** Last delivered taskSequence (0 = from start). */
  cursor: number
  listener: (event: RuntimeSubscriptionEvent) => void
}

const DEFAULT_DELTAS = ['Hello', ' world'] as const

export class DeterministicFakeRuntime implements RuntimePort {
  readonly clock: VirtualClock
  private readonly seed: string
  private readonly defaultScenario: FakeScenarioName
  private readonly stepMs: number
  private readonly outputDeltas: readonly string[]
  private readonly buildOutputDeltas?: (inputText: string) => readonly string[]
  private readonly schemaVersion: number
  private readonly keywordScenarios: boolean

  private readonly tasks = new Map<TaskId, TaskRecord>()
  private readonly idempotency = new Map<string, IdempotencyEntry>()
  private readonly subscribers = new Set<Subscriber>()
  /** Per-task scenario override for the next submit (tests). */
  private readonly scenarioByTask = new Map<TaskId, FakeScenarioName>()

  constructor(options: DeterministicFakeRuntimeOptions = {}) {
    this.seed = options.seed ?? 'fake'
    this.clock = options.clock ?? new VirtualClock({ startMs: 0 })
    this.defaultScenario = options.defaultScenario ?? 'normal-stream-complete'
    this.stepMs = options.stepMs ?? 10
    this.outputDeltas = options.outputDeltas ?? DEFAULT_DELTAS
    this.buildOutputDeltas = options.buildOutputDeltas
    this.schemaVersion = options.schemaVersion ?? 1
    this.keywordScenarios = options.keywordScenarios ?? true
  }

  private deltasForTurn(inputText: string): readonly string[] {
    if (this.buildOutputDeltas) return this.buildOutputDeltas(inputText)
    return this.outputDeltas
  }

  /** Pin scenario for a task's subsequent submitTurn streams. */
  setTaskScenario(taskId: string, scenario: FakeScenarioName): void {
    this.scenarioByTask.set(asTaskId(taskId), scenario)
  }

  /** Test helper: all envelopes for a task in sequence order. */
  getTaskEvents(taskId: string): readonly AgentRuntimeEventEnvelope[] {
    const rec = this.tasks.get(asTaskId(taskId))
    return rec ? [...rec.events] : []
  }

  /** Resolve scenario: pin → keyword (if enabled) → default. */
  resolveScenario(taskId: string, inputText: string): FakeScenarioName {
    const tid = asTaskId(taskId)
    const pinned = this.scenarioByTask.get(tid)
    if (pinned) return pinned
    if (
      this.keywordScenarios &&
      this.defaultScenario === 'normal-stream-complete'
    ) {
      const fromKeywords = resolveScenarioFromKeywords(inputText)
      if (fromKeywords) return fromKeywords
    }
    return this.defaultScenario
  }

  async sendCommand(command: ApplicationCommand): Promise<CommandAcknowledgement> {
    const dup = this.lookupIdempotency(command.idempotencyKey, command.commandId)
    if (dup) return dup

    let ack: CommandAcknowledgement

    switch (command.type) {
      case 'createTask':
        ack = this.handleCreateTask(command)
        break
      case 'submitTurn':
        ack = this.handleSubmitTurn(command)
        break
      case 'cancelRun':
        ack = this.handleCancelRun(command)
        break
      case 'retryTurn':
        ack = this.handleRetryTurn(command)
        break
      case 'respondToApproval':
        ack = this.handleRespondToApproval(command)
        break
      case 'provideRunInput':
        ack = this.handleProvideRunInput(command)
        break
      case 'queueFollowUp':
        ack = this.handleQueueFollowUp(command)
        break
      case 'steerRun':
        ack = this.handleSteerRun(command)
        break
      case 'reconcileInterruptedRun':
        ack = this.handleReconcileInterruptedRun(command)
        break
      default: {
        const _never: never = command
        ack = unsupported(
          (command as ApplicationCommand).commandId,
          'unknown_command',
          `Unknown command: ${JSON.stringify(_never)}`,
        )
      }
    }

    this.rememberIdempotency(command.idempotencyKey, command.commandId, ack)
    return ack
  }

  subscribe(
    taskId: string,
    cursor: number | string | null | undefined,
    listener: (event: RuntimeSubscriptionEvent) => void,
  ): () => void {
    const startCursor = normalizeCursor(cursor)
    const sub: Subscriber = { taskId, cursor: startCursor, listener }
    this.subscribers.add(sub)

    // Replay existing events after cursor.
    const rec = this.tasks.get(asTaskId(taskId))
    if (rec) {
      for (const envelope of rec.events) {
        if (envelope.taskSequence > startCursor) {
          listener({ kind: 'event', envelope })
          sub.cursor = envelope.taskSequence
        }
      }
    }

    return () => {
      this.subscribers.delete(sub)
    }
  }

  async getSnapshot(taskId: string, runId?: string): Promise<RuntimeSnapshot | null> {
    const rec = this.tasks.get(asTaskId(taskId))
    if (!rec) return null
    const run = runId
      ? rec.runs.get(asRunId(runId))
      : rec.activeRunId
        ? rec.runs.get(rec.activeRunId)
        : undefined
    return {
      taskId,
      runId: run?.runId,
      protocolVersion: this.schemaVersion,
      runStatus: run?.status,
      lastTaskSequence: rec.taskSequence,
      runtimeCursor: run?.runtimeCursor ?? String(rec.taskSequence),
      projectionVersion: rec.taskSequence,
      taskExecutionContextSnapshot: rec.executionContext,
      capabilitiesSnapshot: rec.executionContext.capabilities,
    }
  }

  async getCapabilities(
    projectId: string,
    environmentId: string,
  ): Promise<RuntimeCapabilities> {
    return {
      projectId,
      environmentId,
      features: {
        steer: true,
        queueFollowUp: true,
        approval: true,
        runInput: true,
        cancel: true,
      },
      models: ['fake-model'],
      tools: ['fake-tool', 'fake-shell'],
    }
  }

  async startRun(
    input: RunStartInput,
    idempotencyKey: string,
  ): Promise<CommandAcknowledgement> {
    const commandId = `${this.seed}:startRun:${input.proposedRunId}`
    const dup = this.lookupIdempotency(idempotencyKey, commandId)
    if (dup) return dup

    const taskId = asTaskId(input.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      const ack = rejected(commandId, 'task_not_found', `Task ${input.taskId} not found`)
      this.rememberIdempotency(idempotencyKey, commandId, ack)
      return ack
    }

    if (this.hasActiveForegroundRun(rec)) {
      const ack = rejected(
        commandId,
        'task_busy',
        'Task already has an active foreground Run (submit concurrent → reject; use queueFollowUp)',
      )
      this.rememberIdempotency(idempotencyKey, commandId, ack)
      return ack
    }

    const turnId = asTurnId(input.turnId)
    let turn = rec.turns.get(turnId)
    if (!turn) {
      turn = {
        turnId,
        taskId,
        sequence: rec.turnCounter + 1,
        inputText: '',
        createdAt: this.clock.nowIso(),
        runIds: [],
      }
      rec.turnCounter += 1
      rec.turns.set(turnId, turn)
      this.emit(rec, 'turn.created', {
        turnId,
        payload: { sequence: turn.sequence },
      })
    }

    const runId = asRunId(input.proposedRunId)
    const scenario = this.resolveScenario(taskId, turn.inputText)
    this.beginRunStream(rec, turn, runId, input.taskExecutionContextSnapshot, scenario)
    const ack = accepted(commandId, this.clock.nowIso())
    this.rememberIdempotency(idempotencyKey, commandId, ack)
    return ack
  }

  // --- command handlers ---

  private handleCreateTask(command: CreateTaskCommand): CommandAcknowledgement {
    const taskId = asTaskId(command.proposedTaskId)
    if (this.tasks.has(taskId)) {
      return rejected(command.commandId, 'task_exists', `Task ${taskId} already exists`)
    }

    const title =
      command.title?.trim() ||
      (command.initialPrompt ? localTitleFromPrompt(command.initialPrompt) : '未命名任务')

    const executionContext =
      command.executionContext ?? emptyTaskExecutionContext()

    const task: Task = {
      taskId,
      projectId: command.projectId as ProjectId,
      title,
      titleSource: 'local',
      lastAcceptedSuggestionVersion: 0,
      createdAt: this.clock.nowIso(),
    }

    const rec: TaskRecord = {
      task,
      turns: new Map(),
      runs: new Map(),
      taskSequence: 0,
      events: [],
      executionContext,
      activeRunId: null,
      turnCounter: 0,
      runCounter: 0,
      pendingApproval: null,
      pendingInput: null,
      failOnceUsed: false,
      followUpQueue: [],
    }
    this.tasks.set(taskId, rec)

    this.emit(rec, 'task.created', {
      payload: {
        title: task.title,
        titleSource: task.titleSource,
        projectId: task.projectId,
      },
    })

    return accepted(command.commandId, this.clock.nowIso())
  }

  private handleSubmitTurn(command: SubmitTurnCommand): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }

    if (this.hasActiveForegroundRun(rec)) {
      return rejected(
        command.commandId,
        'task_busy',
        'Task already has an active foreground Run (use queueFollowUp while busy)',
      )
    }

    return this.startTurnStream(
      rec,
      command.inputText,
      command.proposedTurnId,
      command.proposedRunId,
      command.commandId,
    )
  }

  private startTurnStream(
    rec: TaskRecord,
    inputText: string,
    proposedTurnId: string | undefined,
    proposedRunId: string | undefined,
    commandId: string,
  ): CommandAcknowledgement {
    rec.turnCounter += 1
    const turnId = asTurnId(
      proposedTurnId ?? `${this.seed}:turn:${rec.task.taskId}:${rec.turnCounter}`,
    )
    const turn: Turn = {
      turnId,
      taskId: rec.task.taskId,
      sequence: rec.turnCounter,
      inputText,
      createdAt: this.clock.nowIso(),
      runIds: [],
    }
    rec.turns.set(turnId, turn)

    this.emit(rec, 'turn.created', {
      turnId,
      payload: { sequence: turn.sequence, inputText },
    })
    this.emit(rec, 'message.accepted', {
      turnId,
      payload: { text: inputText },
    })

    rec.runCounter += 1
    const runId = asRunId(
      proposedRunId ?? `${this.seed}:run:${rec.task.taskId}:${rec.runCounter}`,
    )
    const scenario = this.resolveScenario(rec.task.taskId, inputText)
    this.beginRunStream(rec, turn, runId, rec.executionContext, scenario)

    return accepted(commandId, this.clock.nowIso())
  }

  private handleCancelRun(command: ApplicationCommand & { type: 'cancelRun' }): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }

    const run =
      (command.runId ? rec.runs.get(asRunId(command.runId)) : undefined) ??
      (rec.activeRunId ? rec.runs.get(rec.activeRunId) : undefined)

    if (!run) {
      return rejected(command.commandId, 'run_not_found', 'No active run to cancel')
    }

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return rejected(
        command.commandId,
        'run_already_terminal',
        `Run is already ${run.status}`,
        { currentRunStatus: run.status },
      )
    }

    if (run.status === 'cancelling') {
      return accepted(command.commandId, this.clock.nowIso())
    }

    const toCancelling = applyRunTransition(run.status, { type: 'cancel_requested' })
    if (!toCancelling.ok) {
      return rejected(command.commandId, 'illegal_transition', toCancelling.error.message, {
        currentRunStatus: run.status,
      })
    }

    run.status = toCancelling.status
    rec.pendingApproval = null
    rec.pendingInput = null
    this.emit(rec, 'run.cancel_requested', {
      turnId: run.turnId,
      runId: run.runId,
      payload: { reasonCode: 'user_cancel' },
    })

    this.clock.schedule(this.stepMs, () => {
      const latest = rec.runs.get(run.runId)
      if (!latest || latest.status !== 'cancelling') return
      const done = applyRunTransition(latest.status, { type: 'cancel_completed' })
      if (!done.ok) return
      latest.status = done.status
      latest.endedAt = this.clock.nowIso()
      if (rec.activeRunId === latest.runId) rec.activeRunId = null
      this.emit(rec, 'run.cancelled', {
        turnId: latest.turnId,
        runId: latest.runId,
        payload: { reasonCode: 'user_cancel' },
      })
      this.drainFollowUpQueue(rec)
    })

    return accepted(command.commandId, this.clock.nowIso())
  }

  private handleRetryTurn(command: RetryTurnCommand): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }
    if (this.hasActiveForegroundRun(rec)) {
      return rejected(
        command.commandId,
        'task_busy',
        'Cannot retry while a foreground Run is active',
      )
    }
    const turnId = asTurnId(command.turnId)
    const turn = rec.turns.get(turnId)
    if (!turn) {
      return rejected(command.commandId, 'turn_not_found', `Turn ${command.turnId} not found`)
    }

    rec.runCounter += 1
    const runId = asRunId(
      command.proposedRunId ?? `${this.seed}:run:${taskId}:${rec.runCounter}`,
    )
    // After a failed attempt, force complete path even if scenario is fail-once-retry.
    const scenario = rec.failOnceUsed
      ? 'normal-stream-complete'
      : this.resolveScenario(taskId, turn.inputText)
    this.beginRunStream(rec, turn, runId, rec.executionContext, scenario)
    return accepted(command.commandId, this.clock.nowIso())
  }

  private handleRespondToApproval(
    command: RespondToApprovalCommand,
  ): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }
    const pending = rec.pendingApproval
    if (!pending || pending.requestId !== command.payload.requestId) {
      return rejected(
        command.commandId,
        'approval_not_found',
        `No pending approval for requestId=${command.payload.requestId}`,
      )
    }
    const run = rec.runs.get(pending.runId)
    if (!run || run.status !== 'waiting_for_approval') {
      return rejected(
        command.commandId,
        'invalid_run_status',
        'Run is not waiting_for_approval',
        { currentRunStatus: run?.status },
      )
    }

    const decision = command.payload.decision
    const transition = applyRunTransition(run.status, {
      type: 'approval_resolved',
      decision,
    })
    if (!transition.ok) {
      return rejected(command.commandId, 'illegal_transition', transition.error.message, {
        currentRunStatus: run.status,
      })
    }

    rec.pendingApproval = null
    run.status = transition.status

    this.emit(rec, 'approval.resolved', {
      turnId: run.turnId,
      runId: run.runId,
      payload: {
        requestId: pending.requestId,
        decision,
        reason: command.payload.reason,
      },
    })

    if (decision === 'rejected') {
      run.endedAt = this.clock.nowIso()
      if (rec.activeRunId === run.runId) rec.activeRunId = null
      this.emit(rec, 'run.cancelled', {
        turnId: run.turnId,
        runId: run.runId,
        payload: { reasonCode: 'approval_rejected' },
      })
      this.drainFollowUpQueue(rec)
      return accepted(command.commandId, this.clock.nowIso())
    }

    // approved → running → short output → complete
    this.clock.schedule(this.stepMs, () => {
      const current = rec.runs.get(run.runId)
      if (!current || current.status !== 'running') return
      this.emit(rec, 'output.delta', {
        turnId: current.turnId,
        runId: current.runId,
        payload: { index: 0, text: '审批已通过，继续执行。' },
      })
    })
    this.clock.schedule(this.stepMs * 2, () => {
      const current = rec.runs.get(run.runId)
      if (!current || current.status !== 'running') return
      this.emit(rec, 'output.completed', {
        turnId: current.turnId,
        runId: current.runId,
        payload: { text: '审批已通过，继续执行。' },
      })
    })
    this.clock.schedule(this.stepMs * 3, () => {
      this.transitionRun(rec, run.runId, { type: 'complete' }, 'run.completed', {
        attempt: run.attempt,
      })
      this.drainFollowUpQueue(rec)
    })

    return accepted(command.commandId, this.clock.nowIso())
  }

  private handleProvideRunInput(
    command: ProvideRunInputCommand,
  ): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }
    const pending = rec.pendingInput
    if (!pending) {
      return rejected(command.commandId, 'input_not_requested', 'No pending run input request')
    }
    if (command.requestId && command.requestId !== pending.requestId) {
      return rejected(
        command.commandId,
        'input_request_mismatch',
        `requestId mismatch: expected ${pending.requestId}`,
      )
    }
    const run = rec.runs.get(pending.runId)
    if (!run || run.status !== 'waiting_for_input') {
      return rejected(
        command.commandId,
        'invalid_run_status',
        'Run is not waiting_for_input',
        { currentRunStatus: run?.status },
      )
    }

    const transition = applyRunTransition(run.status, { type: 'input_provided' })
    if (!transition.ok) {
      return rejected(command.commandId, 'illegal_transition', transition.error.message, {
        currentRunStatus: run.status,
      })
    }

    rec.pendingInput = null
    run.status = transition.status

    this.emit(rec, 'run.input_provided', {
      turnId: run.turnId,
      runId: run.runId,
      payload: {
        requestId: pending.requestId,
        text: command.inputText,
      },
    })
    // Also surface the user clarification as a user-message style note.
    this.emit(rec, 'message.accepted', {
      turnId: run.turnId,
      payload: { text: command.inputText, inputRequestId: pending.requestId },
    })

    this.clock.schedule(this.stepMs, () => {
      const current = rec.runs.get(run.runId)
      if (!current || current.status !== 'running') return
      this.emit(rec, 'output.delta', {
        turnId: current.turnId,
        runId: current.runId,
        payload: {
          index: 0,
          text: `已收到补充：${command.inputText}`,
        },
      })
    })
    this.clock.schedule(this.stepMs * 2, () => {
      const current = rec.runs.get(run.runId)
      if (!current || current.status !== 'running') return
      this.emit(rec, 'output.completed', {
        turnId: current.turnId,
        runId: current.runId,
        payload: { text: `已收到补充：${command.inputText}` },
      })
    })
    this.clock.schedule(this.stepMs * 3, () => {
      this.transitionRun(rec, run.runId, { type: 'complete' }, 'run.completed', {
        attempt: run.attempt,
      })
      this.drainFollowUpQueue(rec)
    })

    return accepted(command.commandId, this.clock.nowIso())
  }

  private handleQueueFollowUp(command: QueueFollowUpCommand): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }
    const text = command.inputText.trim()
    if (!text) {
      return rejected(command.commandId, 'empty_input', 'queueFollowUp requires inputText')
    }

    // If idle, start immediately (convenience).
    if (!this.hasActiveForegroundRun(rec)) {
      return this.startTurnStream(
        rec,
        text,
        command.proposedTurnId,
        undefined,
        command.commandId,
      )
    }

    rec.followUpQueue.push({
      inputText: text,
      proposedTurnId: command.proposedTurnId,
    })
    return accepted(command.commandId, this.clock.nowIso())
  }

  private handleSteerRun(command: SteerRunCommand): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }
    const run = rec.runs.get(asRunId(command.runId))
    if (!run) {
      return rejected(command.commandId, 'run_not_found', `Run ${command.runId} not found`)
    }
    if (run.status !== 'running') {
      return rejected(
        command.commandId,
        'run_not_running',
        'steerRun requires an active running Run',
        { currentRunStatus: run.status },
      )
    }

    this.emit(rec, 'message.accepted', {
      turnId: run.turnId,
      runId: run.runId,
      payload: {
        text: command.inputText,
        steer: true,
      },
    })
    this.emit(rec, 'output.delta', {
      turnId: run.turnId,
      runId: run.runId,
      payload: {
        index: -1,
        text: `\n\n> [转向] ${command.inputText}\n\n`,
        steer: true,
      },
    })
    return accepted(command.commandId, this.clock.nowIso())
  }

  private handleReconcileInterruptedRun(
    command: ReconcileInterruptedRunCommand,
  ): CommandAcknowledgement {
    const taskId = asTaskId(command.taskId)
    const rec = this.tasks.get(taskId)
    if (!rec) {
      return rejected(command.commandId, 'task_not_found', `Task ${taskId} not found`)
    }
    const run = rec.runs.get(asRunId(command.runId))
    if (!run) {
      return rejected(command.commandId, 'run_not_found', `Run ${command.runId} not found`)
    }

    // Simplified recovery: mark interrupted (if non-terminal), then reconcile → cancelled.
    if (!isTerminalRunStatus(run.status) && run.status !== 'interrupted') {
      const interrupted = applyRunTransition(run.status, { type: 'interrupt' })
      if (interrupted.ok) {
        run.status = interrupted.status
        this.emit(rec, 'run.interrupted', {
          turnId: run.turnId,
          runId: run.runId,
          payload: {
            runtimeCursor: command.runtimeCursor,
            reasonCode: 'reconcile',
          },
        })
      }
    }

    this.emit(rec, 'run.reconciled', {
      turnId: run.turnId,
      runId: run.runId,
      payload: {
        runtimeCursor: command.runtimeCursor,
        outcome: 'cancelled',
      },
    })

    if (run.status !== 'cancelled' && run.status !== 'completed' && run.status !== 'failed') {
      run.status = 'cancelled'
      run.endedAt = this.clock.nowIso()
      if (rec.activeRunId === run.runId) rec.activeRunId = null
      this.emit(rec, 'run.cancelled', {
        turnId: run.turnId,
        runId: run.runId,
        payload: { reasonCode: 'reconciled' },
      })
    }

    rec.pendingApproval = null
    rec.pendingInput = null
    this.drainFollowUpQueue(rec)
    return accepted(command.commandId, this.clock.nowIso())
  }

  // --- stream orchestration ---

  private beginRunStream(
    rec: TaskRecord,
    turn: Turn,
    runId: RunId,
    context: TaskExecutionContext,
    scenario: FakeScenarioName,
  ): void {
    const attempt = turn.runIds.length + 1
    const run: Run = {
      runId,
      turnId: turn.turnId,
      taskId: rec.task.taskId,
      status: 'queued',
      attempt,
      startedAt: this.clock.nowIso(),
      runtimeCursor: '0',
    }
    turn.runIds.push(runId)
    rec.runs.set(runId, run)
    rec.activeRunId = runId
    rec.executionContext = context

    this.emit(rec, 'run.queued', {
      turnId: turn.turnId,
      runId,
      payload: { attempt },
    })

    // Step 1: queued → running
    this.clock.schedule(this.stepMs, () => {
      this.transitionRun(rec, runId, { type: 'start' }, 'run.started', {
        attempt,
      })

      switch (scenario) {
        case 'cancel-run':
          // Leave running; caller issues cancelRun.
          return
        case 'reasoning-tools-complete':
          this.scheduleReasoningToolsStream(rec, turn, runId, attempt)
          return
        case 'fixture-workflow':
          this.scheduleFixtureWorkflowStream(rec, turn, runId, attempt)
          return
        case 'approval-approve':
        case 'approval-reject':
          this.scheduleApprovalPause(rec, turn, runId, scenario)
          return
        case 'waiting-input':
          this.scheduleWaitingInput(rec, turn, runId)
          return
        case 'fail-once-retry':
          this.scheduleFailOnce(rec, turn, runId, attempt)
          return
        case 'long-content':
          this.scheduleOutputComplete(
            rec,
            turn,
            runId,
            attempt,
            buildLongContentDeltas(),
          )
          return
        case 'normal-stream-complete':
        default:
          this.scheduleOutputComplete(
            rec,
            turn,
            runId,
            attempt,
            this.deltasForTurn(turn.inputText),
          )
      }
    })
  }

  private scheduleOutputComplete(
    rec: TaskRecord,
    turn: Turn,
    runId: RunId,
    attempt: number,
    deltas: readonly string[],
  ): void {
    let delay = this.stepMs
    deltas.forEach((text, index) => {
      this.clock.schedule(delay, () => {
        const current = rec.runs.get(runId)
        if (!current || current.status !== 'running') return
        this.emit(rec, 'output.delta', {
          turnId: turn.turnId,
          runId,
          payload: { index, text },
        })
      })
      delay += this.stepMs
    })

    this.clock.schedule(delay, () => {
      const current = rec.runs.get(runId)
      if (!current || current.status !== 'running') return
      this.emit(rec, 'output.completed', {
        turnId: turn.turnId,
        runId,
        payload: { text: deltas.join('') },
      })
    })
    delay += this.stepMs

    this.clock.schedule(delay, () => {
      this.transitionRun(rec, runId, { type: 'complete' }, 'run.completed', {
        attempt,
      })
      this.drainFollowUpQueue(rec)
    })
  }

  private scheduleReasoningToolsStream(
    rec: TaskRecord,
    turn: Turn,
    runId: RunId,
    attempt: number,
  ): void {
    this.scheduleStepScript(rec, turn, runId, attempt, REASONING_TOOLS_STEPS)
  }

  private scheduleFixtureWorkflowStream(
    rec: TaskRecord,
    turn: Turn,
    runId: RunId,
    attempt: number,
  ): void {
    this.scheduleStepScript(rec, turn, runId, attempt, FIXTURE_WORKFLOW_STEPS)
  }

  private scheduleStepScript(
    rec: TaskRecord,
    turn: Turn,
    runId: RunId,
    attempt: number,
    steps: readonly { type: AgentRuntimeEventType; payload: unknown }[],
  ): void {
    let delay = this.stepMs
    for (const step of steps) {
      this.clock.schedule(delay, () => {
        const current = rec.runs.get(runId)
        if (!current || current.status !== 'running') return
        this.emit(rec, step.type, {
          turnId: turn.turnId,
          runId,
          payload: step.payload,
        })
      })
      delay += this.stepMs
    }

    this.clock.schedule(delay, () => {
      this.transitionRun(rec, runId, { type: 'complete' }, 'run.completed', {
        attempt,
      })
      this.drainFollowUpQueue(rec)
    })
  }

  private scheduleApprovalPause(
    rec: TaskRecord,
    turn: Turn,
    runId: RunId,
    scenario: 'approval-approve' | 'approval-reject',
  ): void {
    const requestId = `${this.seed}:approval:${runId}`
    this.clock.schedule(this.stepMs, () => {
      const current = rec.runs.get(runId)
      if (!current || current.status !== 'running') return
      const next = applyRunTransition(current.status, { type: 'request_approval' })
      if (!next.ok) return
      current.status = next.status
      rec.pendingApproval = {
        requestId,
        runId,
        turnId: turn.turnId,
      }
      this.emit(rec, 'approval.requested', {
        turnId: turn.turnId,
        runId,
        payload: {
          requestId,
          title: '请求执行敏感操作',
          detail:
            scenario === 'approval-reject'
              ? '（演示拒绝路径）删除临时缓存'
              : '写入本地演示文件（Fake，无真实副作用）',
          scenario,
        },
      })
    })
  }

  private scheduleWaitingInput(rec: TaskRecord, turn: Turn, runId: RunId): void {
    const requestId = `${this.seed}:input:${runId}`
    this.clock.schedule(this.stepMs, () => {
      const current = rec.runs.get(runId)
      if (!current || current.status !== 'running') return
      const next = applyRunTransition(current.status, { type: 'request_input' })
      if (!next.ok) return
      current.status = next.status
      const prompt = '请补充目标路径或约束条件'
      rec.pendingInput = {
        requestId,
        runId,
        turnId: turn.turnId,
        prompt,
      }
      this.emit(rec, 'run.input_requested', {
        turnId: turn.turnId,
        runId,
        payload: {
          requestId,
          prompt,
        },
      })
    })
  }

  private scheduleFailOnce(
    rec: TaskRecord,
    turn: Turn,
    runId: RunId,
    attempt: number,
  ): void {
    if (!rec.failOnceUsed) {
      this.clock.schedule(this.stepMs, () => {
        const current = rec.runs.get(runId)
        if (!current || current.status !== 'running') return
        rec.failOnceUsed = true
        this.transitionRun(rec, runId, { type: 'fail' }, 'run.failed', {
          attempt,
          reasonCode: 'fake_transient_error',
          message: '模拟瞬时失败（可用 retryTurn 重试）',
        })
        // Do not auto-drain queue on fail — product may retry first.
      })
      return
    }
    this.scheduleOutputComplete(rec, turn, runId, attempt, [
      '重试成功：',
      '本轮 Fake 运行已完成。',
    ])
  }

  private drainFollowUpQueue(rec: TaskRecord): void {
    if (this.hasActiveForegroundRun(rec)) return
    const next = rec.followUpQueue.shift()
    if (!next) return
    // Schedule so callers can observe terminal before next turn starts.
    this.clock.schedule(this.stepMs, () => {
      if (this.hasActiveForegroundRun(rec)) {
        rec.followUpQueue.unshift(next)
        return
      }
      this.startTurnStream(
        rec,
        next.inputText,
        next.proposedTurnId,
        next.proposedRunId,
        `${this.seed}:queue-drain:${rec.task.taskId}:${rec.turnCounter + 1}`,
      )
    })
  }

  private transitionRun(
    rec: TaskRecord,
    runId: RunId,
    event: Parameters<typeof applyRunTransition>[1],
    eventType: AgentRuntimeEventType,
    payload: unknown,
  ): void {
    const run = rec.runs.get(runId)
    if (!run) return
    const result = applyRunTransition(run.status, event)
    if (!result.ok) return
    run.status = result.status
    if (result.status === 'running' && event.type === 'start') {
      run.startedAt = this.clock.nowIso()
    }
    if (isTerminalRunStatus(result.status)) {
      run.endedAt = this.clock.nowIso()
      if (rec.activeRunId === runId) rec.activeRunId = null
      rec.pendingApproval = null
      rec.pendingInput = null
    }
    this.emit(rec, eventType, {
      turnId: run.turnId,
      runId,
      payload,
    })
  }

  private hasActiveForegroundRun(rec: TaskRecord): boolean {
    if (!rec.activeRunId) return false
    const run = rec.runs.get(rec.activeRunId)
    if (!run) return false
    return (
      run.status === 'queued' ||
      run.status === 'running' ||
      run.status === 'waiting_for_approval' ||
      run.status === 'waiting_for_input' ||
      run.status === 'cancelling'
    )
  }

  private emit(
    rec: TaskRecord,
    eventType: AgentRuntimeEventType,
    parts: {
      turnId?: string
      runId?: string
      parentRunId?: string
      payload: unknown
    },
  ): void {
    rec.taskSequence += 1
    const seq = rec.taskSequence
    const iso = this.clock.nowIso()
    const envelope: AgentRuntimeEventEnvelope = {
      eventId: `${this.seed}:evt:${rec.task.taskId}:${seq}`,
      eventType,
      schemaVersion: this.schemaVersion,
      projectId: rec.task.projectId,
      taskId: rec.task.taskId,
      turnId: parts.turnId,
      runId: parts.runId,
      parentRunId: parts.parentRunId,
      taskSequence: seq,
      runtimeCursor: String(seq),
      occurredAt: iso,
      receivedAt: iso,
      payload: parts.payload,
    }
    rec.events.push(envelope)
    if (parts.runId) {
      const run = rec.runs.get(asRunId(parts.runId))
      if (run) {
        run.lastTaskSequence = seq
        run.runtimeCursor = String(seq)
      }
    }
    this.publish(envelope)
  }

  private publish(envelope: AgentRuntimeEventEnvelope): void {
    for (const sub of this.subscribers) {
      if (sub.taskId !== envelope.taskId) continue
      if (envelope.taskSequence <= sub.cursor) continue
      sub.listener({ kind: 'event', envelope })
      sub.cursor = envelope.taskSequence
    }
  }

  private lookupIdempotency(
    key: string,
    commandId: string,
  ): CommandAcknowledgement | null {
    const existing = this.idempotency.get(key)
    if (!existing) return null
    return {
      status: 'duplicate',
      commandId,
      reasonCode: 'duplicate_idempotency_key',
      originalCommandId: existing.commandId,
      originalAcknowledgement: {
        commandId: existing.acknowledgement.commandId,
        status: existing.acknowledgement.status,
        acceptedAt: existing.acknowledgement.acceptedAt,
      },
    }
  }

  private rememberIdempotency(
    key: string,
    commandId: string,
    ack: CommandAcknowledgement,
  ): void {
    if (this.idempotency.has(key)) return
    this.idempotency.set(key, { commandId, acknowledgement: ack })
  }
}


function normalizeCursor(cursor: number | string | null | undefined): number {
  if (cursor == null || cursor === '') return 0
  if (typeof cursor === 'number') return Number.isFinite(cursor) ? cursor : 0
  const n = Number(cursor)
  return Number.isFinite(n) ? n : 0
}



/** Factory for tests / optional composition harness. */
export function createDeterministicFakeRuntime(
  options?: DeterministicFakeRuntimeOptions,
): DeterministicFakeRuntime {
  return new DeterministicFakeRuntime(options)
}
