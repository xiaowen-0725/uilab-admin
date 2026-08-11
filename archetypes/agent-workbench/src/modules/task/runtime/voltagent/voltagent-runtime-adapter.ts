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
import type { TurnComposerContext } from '../../protocol/commands'
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

function modelInputWithComposerContext(
  text: string,
  context: TurnComposerContext | undefined,
): string {
  if (!context) return text
  const lines: string[] = []
  if (context.attachments?.length) {
    lines.push(
      `附件元数据（未上传文件内容）：${context.attachments
        .map((item) => `${item.name} [${item.kind}]`)
        .join('、')}`,
    )
  }
  if (context.connectors?.length) {
    lines.push(
      `本 Task 已选连接器：${context.connectors
        .map((item) => {
          const flags = [
            item.connected ? '已连接' : '未连接',
            item.capabilityEffective ? '能力面已进入' : '能力面未进入',
          ].join('·')
          return `${item.label}(${item.id}; ${flags})`
        })
        .join('、')}`,
    )
    lines.push(
      '若连接器能力面已进入，GitHub 使用官方 MCP 工具，飞书按官方 lark-* Skill 通过 execute_command 执行原生 lark-cli；未进入时不要假装已调用。',
    )
  }
  if (context.expert) {
    lines.push(`本 Task 专家配置包：${context.expert.label}(${context.expert.id})`)
    const instruction = context.expert.instruction?.trim()
    if (instruction) {
      lines.push(`专家指令（配置包 overlay，非子 Agent）：\n${instruction}`)
    } else {
      lines.push(
        '专家目录未提供 instruction 时，仅按 id/label 与默认技能偏好工作；勿虚构专家能力。',
      )
    }
  }
  if (context.skills?.length) {
    lines.push(`已选技能：${context.skills.map((item) => item.label).join('、')}`)
  }
  if (context.mode && context.mode !== 'default') {
    lines.push(`Workbench 模式：${context.mode}`)
  }
  return lines.length > 0
    ? `${text}\n\n<workbench_context>\n${lines.join('\n')}\n</workbench_context>`
    : text
}

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

/** Parse one SSE text line; null = ignore, 'done' = stream end marker. */
export function parseSseDataLine(
  line: string,
): FullStreamChunk | 'done' | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':')) return null
  if (trimmed === 'data: [DONE]') return 'done'
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data) return null
  try {
    return JSON.parse(data) as FullStreamChunk
  } catch {
    return null
  }
}

function isTerminalRunEvent(eventType: string): boolean {
  return (
    eventType === 'run.completed' ||
    eventType === 'run.failed' ||
    eventType === 'run.cancelled'
  )
}

/** Read first non-empty string field from a chunk-like object. */
function pickString(
  source: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | null {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * When sidecar metadata cannot be loaded, return **no** tools rather than
 * inventing DIY/minimal names (honesty: do not claim run_command on office).
 */
const FALLBACK_TOOLS: readonly string[] = []

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
    cursor: number | string | null | undefined,
    listener: Listener,
  ): () => void {
    // EventStore owns rehydrate; seed live sequences so post-rehydrate appends
    // do not restart at 1 and collide with store checkpoints.
    const state = this.ensureTask(taskId)
    const cursorNum =
      cursor == null || cursor === ''
        ? null
        : typeof cursor === 'number'
          ? cursor
          : Number(cursor)
    if (cursorNum != null && Number.isFinite(cursorNum) && cursorNum >= 0) {
      state.nextSequence = Math.max(state.nextSequence, Math.floor(cursorNum) + 1)
    }

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

  /**
   * Allocate sequence + emit one envelope. eventId = `${idPrefix}-${runId}-${seq}`.
   * `freshReceivedAt` matches cancel-path historical dual nowIso() calls.
   */
  private pushTaskEnvelope(
    taskId: string,
    ids: { turnId?: string; runId: string },
    idPrefix: string,
    eventType: string,
    payload: unknown,
    opts?: { freshReceivedAt?: boolean },
  ): void {
    const state = this.ensureTask(taskId)
    const occurredAt = this.nowIso()
    const receivedAt = opts?.freshReceivedAt ? this.nowIso() : occurredAt
    this.emitEnvelope(taskId, {
      eventId: `${idPrefix}-${ids.runId}-${state.nextSequence}`,
      eventType,
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      taskId,
      turnId: ids.turnId,
      runId: ids.runId,
      taskSequence: state.nextSequence,
      occurredAt,
      receivedAt,
      payload,
    })
    state.nextSequence += 1
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
    const ids = { turnId, runId }
    this.pushTaskEnvelope(taskId, ids, 'va-book', 'turn.created', { turnId })
    this.pushTaskEnvelope(taskId, ids, 'va-book', 'message.accepted', {
      text: inputText,
      role: 'user',
    })
    this.pushTaskEnvelope(taskId, ids, 'va-book', 'run.queued', {})
    this.pushTaskEnvelope(taskId, ids, 'va-book', 'run.started', {
      source: 'voltagent-adapter',
    })
  }

  /** Start stream with AbortController lifecycle (submit + approval resume). */
  private launchStream(args: {
    taskId: string
    turnId: string
    runId: string
    input: StreamInput
    completeIfNoTerminal?: boolean
  }): void {
    const state = this.ensureTask(args.taskId)
    const abort = new AbortController()
    state.activeAbort = abort
    void this.streamAgent({
      ...args,
      signal: abort.signal,
    }).finally(() => {
      if (state.activeAbort === abort) state.activeAbort = null
    })
  }

  private async handleSubmitTurn(
    command: SubmitTurnCommand,
  ): Promise<CommandAcknowledgement> {
    const taskId = command.taskId
    const state = this.ensureTask(taskId)
    if (state.activeAbort) {
      return rejected(command.commandId, 'task_busy', '当前任务已有进行中的 Run')
    }

    // Bind sidecar capability active task BEFORE stream so tool gates see selection.
    await this.bindCapabilityActiveTask(taskId)

    const { turnId, runId } = this.allocateIds(taskId, command)
    state.lastRunId = runId
    state.lastTurnId = turnId
    const modelInput = modelInputWithComposerContext(
      command.inputText,
      command.composerContext,
    )
    state.lastUserText = modelInput
    state.pendingApprovals.clear()

    this.pushBookkeeping(taskId, turnId, runId, command.inputText)
    this.launchStream({
      taskId,
      turnId,
      runId,
      input: modelInput,
      completeIfNoTerminal: true,
    })

    return accepted(command.commandId, this.nowIso())
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

    const ids = { turnId, runId }
    this.pushTaskEnvelope(taskId, ids, 'va-cancel', 'run.cancel_requested', {
      reason: 'user_cancel',
    })
    this.pushTaskEnvelope(
      taskId,
      ids,
      'va-cancelled',
      'run.cancelled',
      { reason: 'user_cancel' },
      { freshReceivedAt: true },
    )
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

    this.pushTaskEnvelope(
      taskId,
      { turnId, runId },
      'va-apr',
      'approval.resolved',
      {
        requestId: approvalId,
        decision: command.payload.decision,
        reason: command.payload.reason,
      },
    )

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

    this.launchStream({
      taskId,
      turnId,
      runId,
      input: resumeInput,
      completeIfNoTerminal: true,
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
        ? (chunk.toolCall as Record<string, unknown>)
        : undefined
    const chunkRec = chunk as unknown as Record<string, unknown>
    const approvalId = pickString(chunkRec, ['approvalId', 'requestId'])
    if (!approvalId || !nested) return
    const toolCallId =
      pickString(nested, ['toolCallId', 'id']) ?? approvalId
    const toolName = pickString(nested, ['toolName', 'name']) ?? 'tool'
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

  /** Best-effort: tell sidecar which task is active for capability tool gates. */
  private async bindCapabilityActiveTask(taskId: string): Promise<void> {
    try {
      await this.fetchImpl(`${this.baseUrl}/capability/active-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ taskId }),
      })
    } catch {
      // Older sidecars may lack the route — tool gate stays transition-open.
    }
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
      // Exactly one terminal Runtime event per launched stream.
      let sawTerminalEvent = false

      const emitCompleted = (reason: 'done_marker' | 'stream_ended'): void => {
        if (
          sawTerminalEvent ||
          signal.aborted ||
          state.pendingApprovals.size > 0
        ) {
          return
        }
        this.pushTaskEnvelope(
          taskId,
          { turnId, runId },
          'va-complete',
          'run.completed',
          { reason },
        )
        sawTerminalEvent = true
      }

      const consumeLine = (line: string): void => {
        const parsed = parseSseDataLine(line)
        if (parsed === null) return
        if (parsed === 'done') {
          if (completeIfNoTerminal) emitCompleted('done_marker')
          return
        }
        const chunk = parsed

        // Record pending approvals before deciding whether a terminal event is legal.
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
          const terminal = isTerminalRunEvent(env.eventType)
          if (terminal && (pausedForApproval || sawTerminalEvent)) continue
          this.emitEnvelope(taskId, {
            ...env,
            taskSequence: state.nextSequence,
            eventId: `va-${runId}-${state.nextSequence}`,
          })
          state.nextSequence += 1
          if (terminal) sawTerminalEvent = true
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() ?? ''
        for (const line of parts) {
          consumeLine(line)
        }
      }

      buffer += decoder.decode()
      if (buffer.trim()) consumeLine(buffer)
      if (completeIfNoTerminal) emitCompleted('stream_ended')
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
    this.pushTaskEnvelope(
      taskId,
      { turnId, runId },
      'va-fail',
      'run.failed',
      { message },
    )
  }
}

export function createVoltAgentRuntimeAdapter(
  options: VoltAgentRuntimeAdapterOptions,
): VoltAgentRuntimeAdapter {
  return new VoltAgentRuntimeAdapter(options)
}
