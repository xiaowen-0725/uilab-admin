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
}

type TaskStreamState = {
  nextSequence: number
  activeAbort: AbortController | null
  lastRunId: string | null
  lastTurnId: string | null
}

type Listener = (event: RuntimeSubscriptionEvent) => void

export class VoltAgentRuntimeAdapter implements RuntimePort {
  private readonly baseUrl: string
  private readonly agentId: string
  private readonly projectId: string
  private readonly schemaVersion: number
  private readonly fetchImpl: typeof fetch
  private readonly userId: string
  private readonly nowIso: () => string

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
      // Honest superset: minimal DIY tools + Office Workspace FS names (sidecar profile decides which are live).
      tools: [
        'read_file',
        'write_file',
        'run_command',
        'ls',
        'edit_file',
        'delete_file',
        'stat',
        'mkdir',
        'rmdir',
        'list_tree',
        'list_files',
        'glob',
        'grep',
      ],
    }
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
    state.activeAbort = new AbortController()
    const abort = state.activeAbort

    this.pushBookkeeping(taskId, turnId, runId, command.inputText)

    const ack = accepted(command.commandId, this.nowIso())

    // Fire-and-forget stream; errors emit run.failed.
    void this.streamAgent({
      taskId,
      turnId,
      runId,
      inputText: command.inputText,
      signal: abort.signal,
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
    if (!state?.activeAbort) {
      return rejected(commandId, 'no_active_run', '没有可取消的 Run')
    }
    const runId = state.lastRunId ?? `run-${taskId}`
    const turnId = state.lastTurnId ?? undefined
    state.activeAbort.abort('user_cancel')
    state.activeAbort = null

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
    // Sidecar may expose approval via POST; best-effort notify + local resolve event.
    const taskId = command.taskId
    const state = this.ensureTask(taskId)
    const runId = command.runId ?? state.lastRunId ?? `run-${taskId}`
    const turnId = command.turnId ?? state.lastTurnId ?? undefined
    const occurredAt = this.nowIso()

    // Best-effort notify. VoltAgent server-hono has no dedicated /approvals route;
    // full tool resume uses conversation message parts (tool-approval-response).
    // We still emit approval.resolved so Timeline HITL unblocks; a follow-up
    // submitTurn may re-drive the model for write completion.
    try {
      const approved = command.payload.decision === 'approved'
      await this.fetchImpl(
        `${this.baseUrl}/agents/${encodeURIComponent(this.agentId)}/approvals`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvalId: command.payload.requestId,
            requestId: command.payload.requestId,
            approved,
            reason: command.payload.reason,
            options: {
              memory: {
                userId: this.userId,
                conversationId: taskId,
              },
            },
          }),
        },
      )
    } catch {
      // Local resolve still emitted so UI unblocks when sidecar uses client-driven approval.
    }

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
        requestId: command.payload.requestId,
        decision: command.payload.decision,
        reason: command.payload.reason,
      },
    })
    state.nextSequence += 1
    return accepted(command.commandId, this.nowIso())
  }

  private async streamAgent(args: {
    taskId: string
    turnId: string
    runId: string
    inputText: string
    signal: AbortSignal
  }): Promise<void> {
    const { taskId, turnId, runId, inputText, signal } = args
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
          input: inputText,
          options: {
            memory: {
              userId: this.userId,
              conversationId: taskId,
            },
            maxSteps: 12,
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
          if (chunk.type === 'finish' || chunk.type === 'abort' || chunk.type === 'error') {
            sawFinish = true
          }
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
          // Skip duplicate run.started from stream if we already bookkept.
          for (const env of mapped.envelopes) {
            if (env.eventType === 'run.started') continue
            this.emitEnvelope(taskId, {
              ...env,
              taskSequence: state.nextSequence,
              eventId: `va-${runId}-${state.nextSequence}`,
            })
            state.nextSequence += 1
          }
        }
      }

      if (!sawFinish && !signal.aborted) {
        // Ensure terminal state for incomplete streams.
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
        // cancel path already emitted cancelled
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
