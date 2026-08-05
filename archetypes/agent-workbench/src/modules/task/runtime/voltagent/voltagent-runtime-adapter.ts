/**
 * VoltAgentRuntimeAdapter — RuntimePort client for a local VoltAgent sidecar.
 *
 * Browser-safe: only fetch/EventSource-style streaming. No Node built-ins.
 * Fake ≠ this adapter. Requires VITE_RUNTIME_ADAPTER=voltagent + running sidecar.
 */

import type {
  ApplicationCommand,
  CommandAcknowledgement,
  RespondToApprovalCommand,
  SubmitTurnCommand,
} from '../../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../../protocol/events'
import type {
  RuntimeCapabilities,
  RuntimePort,
  RuntimeSnapshot,
  RuntimeSubscriptionEvent,
  RunStartInput,
} from '../../ports/runtime-port'
import { accepted, rejected, unsupported } from '../command-acks'
import {
  mapFullStreamChunk,
  type FullStreamChunk,
} from './fullstream-to-envelope'

export interface VoltAgentRuntimeAdapterOptions {
  baseUrl: string
  agentId: string
  projectId: string
  schemaVersion?: number
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch
  /** Fixed user id for VoltAgent memory scoping. */
  userId?: string
  nowIso?: () => string
  /**
   * Optional per-request maxSteps override for stream calls.
   * When omitted, the sidecar Agent's configured maxSteps applies (preferred).
   */
  maxSteps?: number
  /**
   * Static tools list for getCapabilities when sidecar metadata is unavailable.
   * Prefer live fetch from the sidecar agent endpoint when possible.
   */
  tools?: string[]
}

type PendingApproval = {
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
  /** User prompt that started this turn (for resume UIMessages). */
  userText: string
  runId: string
  turnId: string
}

type TaskStreamState = {
  nextSequence: number
  activeAbort: AbortController | null
  lastRunId: string | null
  lastTurnId: string | null
  /** Last user text for this task (approval resume). */
  lastUserText: string | null
  /** Pending tool approvals keyed by approvalId. */
  pendingApprovals: Map<string, PendingApproval>
}

type Listener = (event: RuntimeSubscriptionEvent) => void

/** VoltAgent/AI SDK UIMessage tool part for approval resume. */
type UiToolPart = {
  type: string
  toolCallId: string
  toolName: string
  state: 'approval-responded'
  input: unknown
  approval: { id: string; approved: boolean; reason?: string }
}

type StreamInput =
  | string
  | Array<{
      id: string
      role: 'user' | 'assistant'
      parts: Array<{ type: string; text?: string } | UiToolPart>
    }>

/**
 * Workspace tools use virtual paths (start with `/` under the authorized root).
 * Models sometimes emit host absolute paths; map known shapes back to virtual
 * so resume executes against the real workspace file.
 */
export function normalizeWorkspaceToolInput(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input
  const rec = { ...(input as Record<string, unknown>) }
  for (const key of ['file_path', 'path', 'filePath'] as const) {
    const v = rec[key]
    if (typeof v !== 'string' || v.length === 0) continue
    // Already a short virtual path — keep.
    if (/^\/(output|notes|skills)(\/|$)/i.test(v) && !v.includes('/Users/')) {
      continue
    }
    // Host absolute path: take the last /output/ or /notes/ segment.
    const idx = Math.max(v.lastIndexOf('/output/'), v.lastIndexOf('/notes/'))
    if (idx >= 0) {
      rec[key] = v.slice(idx)
      continue
    }
    // Fallback: basename under virtual /output/
    if (v.includes('/Users/') || v.includes('/home/') || /^[A-Za-z]:\\/.test(v)) {
      const base = v.split(/[/\\]/).filter(Boolean).pop()
      if (base) rec[key] = `/output/${base}`
    }
  }
  return rec
}

/** Fallback tools when sidecar metadata cannot be loaded (minimal DIY). */
const FALLBACK_TOOLS = ['read_file', 'write_file', 'run_command'] as const

export class VoltAgentRuntimeAdapter implements RuntimePort {
  private readonly baseUrl: string
  private readonly agentId: string
  private readonly projectId: string
  private readonly schemaVersion: number
  private readonly fetchImpl: typeof fetch
  private readonly userId: string
  private readonly nowIso: () => string
  private readonly maxSteps: number | undefined
  private readonly toolsOverride: string[] | undefined
  private toolsCache: string[] | null = null

  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly taskState = new Map<string, TaskStreamState>()
  private seq = 0

  constructor(options: VoltAgentRuntimeAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.agentId = options.agentId
    this.projectId = options.projectId
    this.schemaVersion = options.schemaVersion ?? 1
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
    this.userId = options.userId ?? 'workbench-user'
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
    this.maxSteps = options.maxSteps
    this.toolsOverride =
      options.tools && options.tools.length > 0 ? [...options.tools] : undefined
  }

  subscribe(
    taskId: string,
    _cursor: number | string | null | undefined,
    listener: Listener,
  ): () => void {
    let set = this.listeners.get(taskId)
    if (!set) {
      set = new Set()
      this.listeners.set(taskId, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.listeners.delete(taskId)
    }
  }

  async getSnapshot(taskId: string, runId?: string): Promise<RuntimeSnapshot | null> {
    const state = this.taskState.get(taskId)
    if (!state) return null
    return {
      taskId,
      runId: runId ?? state.lastRunId ?? undefined,
      protocolVersion: this.schemaVersion,
      lastTaskSequence: Math.max(0, state.nextSequence - 1),
    }
  }

  async getCapabilities(
    _projectId: string,
    _environmentId: string,
  ): Promise<RuntimeCapabilities> {
    const tools = await this.resolveActiveTools()
    return {
      projectId: this.projectId,
      environmentId: 'local-voltagent',
      features: {
        steer: false,
        queueFollowUp: false,
        approval: true,
        runInput: false,
        cancel: true,
      },
      models: ['voltagent-sidecar'],
      tools,
    }
  }

  /** Prefer live sidecar agent tools; fall back to override / minimal DIY. */
  private async resolveActiveTools(): Promise<string[]> {
    if (this.toolsOverride) return [...this.toolsOverride]
    if (this.toolsCache) return [...this.toolsCache]
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl}/agents/${encodeURIComponent(this.agentId)}`,
        { method: 'GET' },
      )
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { tools?: Array<{ name?: string }> }
          tools?: Array<{ name?: string }>
        }
        const raw = json.data?.tools ?? json.tools ?? []
        const names = raw
          .map((t) => (typeof t?.name === 'string' ? t.name : ''))
          .filter(Boolean)
        if (names.length > 0) {
          this.toolsCache = names
          return [...names]
        }
      }
    } catch {
      // Sidecar down — honest minimal fallback.
    }
    return [...FALLBACK_TOOLS]
  }

  async startRun(
    input: RunStartInput,
    _idempotencyKey: string,
  ): Promise<CommandAcknowledgement> {
    this.ensureTask(input.taskId)
    const state = this.taskState.get(input.taskId)!
    state.lastRunId = input.proposedRunId
    state.lastTurnId = input.turnId
    return accepted(`start-${input.proposedRunId}`, this.nowIso())
  }

  async sendCommand(command: ApplicationCommand): Promise<CommandAcknowledgement> {
    switch (command.type) {
      case 'createTask':
        this.ensureTask(command.proposedTaskId)
        return accepted(command.commandId, this.nowIso())
      case 'submitTurn':
        return this.handleSubmitTurn(command)
      case 'cancelRun':
        return this.handleCancel(command.commandId, command.taskId)
      case 'respondToApproval':
        return this.handleApproval(command)
      case 'retryTurn':
        return rejected(
          command.commandId,
          'retry_via_submit',
          '请通过新的 submitTurn 重试（VoltAgent Adapter 首版）',
        )
      case 'provideRunInput':
      case 'queueFollowUp':
      case 'steerRun':
      case 'reconcileInterruptedRun':
        return unsupported(
          command.commandId,
          `${command.type}_unsupported`,
          `VoltAgent Adapter 暂不支持 ${command.type}`,
        )
      default:
        return unsupported(
          (command as ApplicationCommand).commandId,
          'unknown_command',
          '未知命令',
        )
    }
  }

  private ensureTask(taskId: string): TaskStreamState {
    let state = this.taskState.get(taskId)
    if (!state) {
      state = {
        nextSequence: 1,
        activeAbort: null,
        lastRunId: null,
        lastTurnId: null,
        lastUserText: null,
        pendingApprovals: new Map(),
      }
      this.taskState.set(taskId, state)
    }
    return state
  }

  private emit(taskId: string, event: RuntimeSubscriptionEvent): void {
    const set = this.listeners.get(taskId)
    if (!set) return
    for (const listener of set) listener(event)
  }

  private emitEnvelope(taskId: string, envelope: AgentRuntimeEventEnvelope): void {
    this.emit(taskId, { kind: 'event', envelope })
  }

  private allocateIds(taskId: string, command: SubmitTurnCommand) {
    this.seq += 1
    const turnId =
      command.proposedTurnId ?? command.turnId ?? `turn-${taskId}-${this.seq}`
    const runId =
      command.proposedRunId ?? command.runId ?? `run-${taskId}-${this.seq}`
    return { turnId, runId }
  }

  private pushBookkeeping(
    taskId: string,
    turnId: string,
    runId: string,
    inputText: string,
  ): void {
    const state = this.ensureTask(taskId)
    const push = (eventType: string, payload: unknown) => {
      const occurredAt = this.nowIso()
      const envelope: AgentRuntimeEventEnvelope = {
        eventId: `va-book-${runId}-${state.nextSequence}`,
        eventType,
        schemaVersion: this.schemaVersion,
        projectId: this.projectId,
        taskId,
        turnId,
        runId,
        taskSequence: state.nextSequence,
        occurredAt,
        receivedAt: occurredAt,
        payload,
      }
      state.nextSequence += 1
      this.emitEnvelope(taskId, envelope)
    }
    push('turn.created', { turnId })
    push('message.accepted', { text: inputText, role: 'user' })
    push('run.queued', {})
    push('run.started', { source: 'voltagent-adapter' })
  }

  private async handleSubmitTurn(
    command: SubmitTurnCommand,
  ): Promise<CommandAcknowledgement> {
    const taskId = command.taskId
    const state = this.ensureTask(taskId)
    if (state.activeAbort) {
      return rejected(command.commandId, 'task_busy', '当前任务已有进行中的 Run')
    }

    const { turnId, runId } = this.allocateIds(taskId, command)
    state.lastRunId = runId
    state.lastTurnId = turnId
    state.lastUserText = command.inputText
    state.pendingApprovals.clear()
    state.activeAbort = new AbortController()
    const abort = state.activeAbort

    this.pushBookkeeping(taskId, turnId, runId, command.inputText)

    const ack = accepted(command.commandId, this.nowIso())

    void this.streamAgent({
      taskId,
      turnId,
      runId,
      input: command.inputText,
      signal: abort.signal,
      completeIfNoTerminal: true,
    }).finally(() => {
      if (state.activeAbort === abort) state.activeAbort = null
    })

    return ack
  }

  private async handleCancel(
    commandId: string,
    taskId: string,
  ): Promise<CommandAcknowledgement> {
    const state = this.taskState.get(taskId)
    if (!state) {
      return rejected(commandId, 'no_active_run', '没有可取消的 Run')
    }
    if (!state.activeAbort && state.pendingApprovals.size === 0) {
      return rejected(commandId, 'no_active_run', '没有可取消的 Run')
    }
    const runId = state.lastRunId ?? `run-${taskId}`
    const turnId = state.lastTurnId ?? undefined
    if (state.activeAbort) {
      state.activeAbort.abort('user_cancel')
      state.activeAbort = null
    }
    state.pendingApprovals.clear()

    const occurredAt = this.nowIso()
    this.emitEnvelope(taskId, {
      eventId: `va-cancel-${runId}-${state.nextSequence}`,
      eventType: 'run.cancel_requested',
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      taskId,
      turnId,
      runId,
      taskSequence: state.nextSequence,
      occurredAt,
      receivedAt: occurredAt,
      payload: { reason: 'user_cancel' },
    })
    state.nextSequence += 1
    this.emitEnvelope(taskId, {
      eventId: `va-cancelled-${runId}-${state.nextSequence}`,
      eventType: 'run.cancelled',
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      taskId,
      turnId,
      runId,
      taskSequence: state.nextSequence,
      occurredAt: this.nowIso(),
      receivedAt: this.nowIso(),
      payload: { reason: 'user_cancel' },
    })
    state.nextSequence += 1
    return accepted(commandId, this.nowIso())
  }

  private async handleApproval(
    command: RespondToApprovalCommand,
  ): Promise<CommandAcknowledgement> {
    const taskId = command.taskId
    const state = this.ensureTask(taskId)
    const approvalId = command.payload.requestId
    const pending = state.pendingApprovals.get(approvalId)
    const runId =
      command.runId ?? pending?.runId ?? state.lastRunId ?? `run-${taskId}`
    const turnId =
      command.turnId ?? pending?.turnId ?? state.lastTurnId ?? `turn-${taskId}`
    const approved = command.payload.decision === 'approved'

    // Validate resumability *before* mutating approval state (Codex P2).
    if (!pending) {
      return rejected(
        command.commandId,
        'approval_not_found',
        '未找到待审批请求，或已过期（请重新提交写操作）',
      )
    }
    if (state.activeAbort) {
      return rejected(
        command.commandId,
        'task_busy',
        '当前任务仍有进行中的流，请稍后再批准',
      )
    }

    state.pendingApprovals.delete(approvalId)

    const occurredAt = this.nowIso()
    this.emitEnvelope(taskId, {
      eventId: `va-apr-${runId}-${state.nextSequence}`,
      eventType: 'approval.resolved',
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      taskId,
      turnId,
      runId,
      taskSequence: state.nextSequence,
      occurredAt,
      receivedAt: occurredAt,
      payload: {
        requestId: approvalId,
        decision: command.payload.decision,
        reason: command.payload.reason,
      },
    })
    state.nextSequence += 1

    // Resume: UIMessage tool part with state=approval-responded (proven against VoltAgent).
    const userText = pending.userText || state.lastUserText || ''
    const toolPart: UiToolPart = {
      type: `tool-${pending.toolName}`,
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      state: 'approval-responded',
      input: pending.input,
      approval: {
        id: pending.approvalId,
        approved,
        reason: command.payload.reason,
      },
    }
    const resumeInput: StreamInput = [
      {
        id: `user-${taskId}-${this.seq}`,
        role: 'user',
        parts: [{ type: 'text', text: userText }],
      },
      {
        id: `asst-${taskId}-${this.seq}`,
        role: 'assistant',
        parts: [toolPart],
      },
    ]

    state.activeAbort = new AbortController()
    const abort = state.activeAbort
    void this.streamAgent({
      taskId,
      turnId,
      runId,
      input: resumeInput,
      signal: abort.signal,
      completeIfNoTerminal: true,
    }).finally(() => {
      if (state.activeAbort === abort) state.activeAbort = null
    })

    return accepted(command.commandId, this.nowIso())
  }

  private rememberApprovalFromChunk(
    taskId: string,
    runId: string,
    turnId: string,
    chunk: FullStreamChunk,
  ): void {
    if (chunk.type !== 'tool-approval-request') return
    const state = this.ensureTask(taskId)
    const nested =
      typeof chunk.toolCall === 'object' && chunk.toolCall !== null
        ? (chunk.toolCall as FullStreamChunk)
        : undefined
    const approvalId =
      (typeof chunk.approvalId === 'string' && chunk.approvalId) ||
      (typeof chunk.requestId === 'string' && chunk.requestId) ||
      null
    if (!approvalId || !nested) return
    const toolCallId =
      (typeof nested.toolCallId === 'string' && nested.toolCallId) ||
      (typeof nested.id === 'string' && nested.id) ||
      approvalId
    const toolName =
      (typeof nested.toolName === 'string' && nested.toolName) ||
      (typeof nested.name === 'string' && nested.name) ||
      'tool'
    const input = nested.input ?? nested.args ?? nested.arguments
    state.pendingApprovals.set(approvalId, {
      approvalId,
      toolCallId,
      toolName,
      input: normalizeWorkspaceToolInput(input),
      userText: state.lastUserText ?? '',
      runId,
      turnId,
    })
  }

  private async streamAgent(args: {
    taskId: string
    turnId: string
    runId: string
    input: StreamInput
    signal: AbortSignal
    completeIfNoTerminal?: boolean
  }): Promise<void> {
    const { taskId, turnId, runId, input, signal, completeIfNoTerminal } = args
    const state = this.ensureTask(taskId)
    const url = `${this.baseUrl}/agents/${encodeURIComponent(this.agentId)}/stream`

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          input,
          options: {
            memory: {
              userId: this.userId,
              conversationId: taskId,
            },
            // Only override when explicitly configured; else sidecar Agent maxSteps wins.
            ...(this.maxSteps != null ? { maxSteps: this.maxSteps } : {}),
          },
        }),
        signal,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        this.failRun(
          taskId,
          turnId,
          runId,
          `侧车 HTTP ${response.status}: ${body.slice(0, 200) || response.statusText}`,
        )
        return
      }

      if (!response.body) {
        this.failRun(taskId, turnId, runId, '侧车未返回流式 body')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawFinish = false
      let sawTerminalMapped = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() ?? ''
        for (const line of parts) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          if (trimmed === 'data: [DONE]') {
            sawFinish = true
            continue
          }
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (!data) continue
          let chunk: FullStreamChunk
          try {
            chunk = JSON.parse(data) as FullStreamChunk
          } catch {
            continue
          }
          if (
            chunk.type === 'finish' ||
            chunk.type === 'abort' ||
            chunk.type === 'error'
          ) {
            sawFinish = true
          }

          // Record pending approvals *before* mapping finish → run.completed
          // so we can suppress terminal completion while HITL is open (Codex P1).
          this.rememberApprovalFromChunk(taskId, runId, turnId, chunk)
          const pausedForApproval = state.pendingApprovals.size > 0

          const mapped = mapFullStreamChunk(chunk, {
            projectId: this.projectId,
            taskId,
            turnId,
            runId,
            nextSequence: state.nextSequence,
            schemaVersion: this.schemaVersion,
            nowIso: this.nowIso,
            eventIdPrefix: 'va',
          })
          for (const env of mapped.envelopes) {
            if (env.eventType === 'run.started') continue
            // Do not complete the Run while tools are waiting for approval.
            if (
              pausedForApproval &&
              (env.eventType === 'run.completed' || env.eventType === 'run.failed')
            ) {
              continue
            }
            if (
              env.eventType === 'run.completed' ||
              env.eventType === 'run.failed' ||
              env.eventType === 'run.cancelled'
            ) {
              sawTerminalMapped = true
            }
            this.emitEnvelope(taskId, {
              ...env,
              taskSequence: state.nextSequence,
              eventId: `va-${runId}-${state.nextSequence}`,
            })
            state.nextSequence += 1
          }
        }
      }

      const pausedForApproval = state.pendingApprovals.size > 0

      if (
        completeIfNoTerminal &&
        !sawFinish &&
        !sawTerminalMapped &&
        !signal.aborted &&
        !pausedForApproval
      ) {
        const occurredAt = this.nowIso()
        this.emitEnvelope(taskId, {
          eventId: `va-complete-${runId}-${state.nextSequence}`,
          eventType: 'run.completed',
          schemaVersion: this.schemaVersion,
          projectId: this.projectId,
          taskId,
          turnId,
          runId,
          taskSequence: state.nextSequence,
          occurredAt,
          receivedAt: occurredAt,
          payload: { reason: 'stream_ended' },
        })
        state.nextSequence += 1
      }
    } catch (err) {
      if (signal.aborted) {
        return
      }
      const message =
        err instanceof Error ? err.message : '连接 VoltAgent 侧车失败'
      this.failRun(taskId, turnId, runId, message)
      this.emit(taskId, {
        kind: 'error',
        code: 'voltagent_stream_error',
        message,
      })
    }
  }

  private failRun(
    taskId: string,
    turnId: string,
    runId: string,
    message: string,
  ): void {
    const state = this.ensureTask(taskId)
    const occurredAt = this.nowIso()
    this.emitEnvelope(taskId, {
      eventId: `va-fail-${runId}-${state.nextSequence}`,
      eventType: 'run.failed',
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      taskId,
      turnId,
      runId,
      taskSequence: state.nextSequence,
      occurredAt,
      receivedAt: occurredAt,
      payload: { message },
    })
    state.nextSequence += 1
  }
}

export function createVoltAgentRuntimeAdapter(
  options: VoltAgentRuntimeAdapterOptions,
): VoltAgentRuntimeAdapter {
  return new VoltAgentRuntimeAdapter(options)
}
