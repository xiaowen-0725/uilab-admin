/**
 * VoltAgentRuntimeAdapter — RuntimePort client for a local VoltAgent sidecar.
 *
 * Browser-safe: only fetch/EventSource-style streaming. No Node built-ins.
 * Fake ≠ this adapter. Requires VITE_RUNTIME_ADAPTER=voltagent + running sidecar.
 */
import type {
  RuntimeCapabilities,
  RuntimePort,
  RuntimeSnapshot,
  RuntimeSubscriptionEvent,
  RunStartInput,
} from '@/modules/task'
import type {
  ApplicationCommand,
  CommandAcknowledgement,
  ProvideRunInputCommand,
  QuestionAnswer,
  RespondToApprovalCommand,
  SubmitTurnCommand,
} from '@/modules/task'
import type { TurnComposerContext } from '@/modules/task'
import type { AgentRuntimeEventEnvelope } from '@/modules/task'
import {
  parseQuestionOptionsFromInput,
  questionAnswerToToolOutput,
} from '@/modules/task'
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
  /**
   * Renderer-side executor for client-side board tools.
   * Composition can pass a stable closure over a ref.
   */
  clientToolExecutor?: ClientToolExecutor
}

export type ClientToolExecutor = (input: {
  toolName: string
  args: unknown
  taskId: string
  turnId: string
}) => Promise<unknown>

type PendingApproval = {
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
  /** User prompt that started this turn (for resume UIMessages). */
  userText: string
  turnId: string
}

type PendingQuestion = {
  requestId: string
  toolCallId: string
  input: unknown
  userText: string
  turnId: string
}

type PendingClientTool = {
  toolCallId: string
  toolName: string
  input: unknown
  userText: string
  turnId: string
}

const BOARD_CLIENT_TOOL_NAMES = new Set(['board_status', 'board_commit'])

function isBoardClientTool(name: string): boolean {
  return BOARD_CLIENT_TOOL_NAMES.has(name)
}

type TaskStreamState = {
  nextSequence: number
  activeAbort: AbortController | null
  lastTurnId: string | null
  /** Last user text for this task (approval resume). */
  lastUserText: string | null
  /** Immutable connector selection captured when this Turn started. */
  lastCapabilityConnectorIds: string[]
  /** Pending tool approvals keyed by approvalId. */
  pendingApprovals: Map<string, PendingApproval>
  /** Pending Question Requests keyed by toolCallId / requestId. */
  pendingQuestions: Map<string, PendingQuestion>
  /** Pending client-side board tools keyed by toolCallId. */
  pendingClientTools: Map<string, PendingClientTool>
  /** In-flight `update_plan` call ids for mapper tool-result suppression. */
  updatePlanCallIds: Set<string>
}

type Listener = (event: RuntimeSubscriptionEvent) => void

/** VoltAgent/AI SDK UIMessage tool part for approval / question resume. */
type UiToolPart = {
  type: string
  toolCallId: string
  toolName: string
  state: 'approval-responded' | 'output-available' | 'output-error'
  errorText?: string
  input: unknown
  output?: unknown
  approval?: { id: string; approved: boolean; reason?: string }
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
  context: TurnComposerContext | undefined
): string {
  if (!context) return text
  const lines: string[] = []
  if (context.attachments?.length) {
    lines.push(
      `附件元数据（未上传文件内容）：${context.attachments
        .map((item) => `${item.name} [${item.kind}]`)
        .join('、')}`
    )
  }
  const selectedConnectors = context.connectors?.filter(
    (connector) => connector.taskSelected
  )
  if (selectedConnectors?.length) {
    lines.push(
      `本 Task 已选连接器：${selectedConnectors
        .map((item) => {
          const flags = [
            item.connected ? '已连接' : '未连接',
            item.capabilityEffective ? '能力面已进入' : '能力面未进入',
          ].join('·')
          return `${item.label}(${item.id}; ${flags})`
        })
        .join('、')}`
    )
    lines.push(
      '只使用当前 Turn 实际暴露的 Connector 工具或命令；能力面未进入时，不要假装已经调用。'
    )
  }
  if (context.expert) {
    lines.push(
      `本 Task 专家配置包：${context.expert.label}(${context.expert.id})`
    )
    const instruction = context.expert.instruction?.trim()
    if (instruction) {
      lines.push(`专家指令（配置包 overlay，非子 Agent）：\n${instruction}`)
    } else {
      lines.push(
        '专家目录未提供 instruction 时，仅按 id/label 与默认技能偏好工作；勿虚构专家能力。'
      )
    }
  }
  if (context.skills?.length) {
    lines.push(
      `已选技能：${context.skills.map((item) => item.label).join('、')}`
    )
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
    if (
      v.includes('/Users/') ||
      v.includes('/home/') ||
      /^[A-Za-z]:\\/.test(v)
    ) {
      const base = v.split(/[/\\]/).filter(Boolean).pop()
      if (base) rec[key] = `/output/${base}`
    }
  }
  return rec
}

/** Parse one SSE text line; null = ignore, 'done' = stream end marker. */
export function parseSseDataLine(
  line: string
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

function isTerminalTurnEvent(eventType: string): boolean {
  return (
    eventType === 'turn.completed' ||
    eventType === 'turn.failed' ||
    eventType === 'turn.cancelled'
  )
}

/** Read first non-empty string field from a chunk-like object. */
function pickString(
  source: Record<string, unknown> | undefined,
  keys: readonly string[]
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
  private readonly clientToolExecutor: ClientToolExecutor | undefined
  private toolsCache: string[] | null = null

  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly taskState = new Map<string, TaskStreamState>()
  private seq = 0

  constructor(options: VoltAgentRuntimeAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.agentId = options.agentId
    this.projectId = options.projectId
    this.schemaVersion = options.schemaVersion ?? 2
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
    this.userId = options.userId ?? 'workbench-user'
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
    this.maxSteps = options.maxSteps
    this.toolsOverride =
      options.tools && options.tools.length > 0 ? [...options.tools] : undefined
    this.clientToolExecutor = options.clientToolExecutor
  }

  private resolveClientToolExecutor(): ClientToolExecutor | null {
    return this.clientToolExecutor ?? null
  }

  subscribe(
    taskId: string,
    cursor: number | string | null | undefined,
    listener: Listener
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
      state.nextSequence = Math.max(
        state.nextSequence,
        Math.floor(cursorNum) + 1
      )
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

  async getSnapshot(taskId: string): Promise<RuntimeSnapshot | null> {
    const state = this.taskState.get(taskId)
    if (!state) return null
    return {
      taskId,
      protocolVersion: this.schemaVersion,
      lastTaskSequence: Math.max(0, state.nextSequence - 1),
    }
  }

  async getCapabilities(
    _projectId: string,
    _environmentId: string
  ): Promise<RuntimeCapabilities> {
    const tools = await this.resolveActiveTools()
    return {
      projectId: this.projectId,
      environmentId: 'local-voltagent',
      features: {
        steer: false,
        queueFollowUp: false,
        approval: true,
        runInput: true,
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
        { method: 'GET' }
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
    _idempotencyKey: string
  ): Promise<CommandAcknowledgement> {
    this.ensureTask(input.taskId)
    const state = this.taskState.get(input.taskId)!
    state.lastTurnId = input.turnId
    return accepted(`start-${input.turnId}`, this.nowIso())
  }

  async sendCommand(
    command: ApplicationCommand
  ): Promise<CommandAcknowledgement> {
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
      case 'provideRunInput':
        return this.handleProvideRunInput(command)
      case 'retryTurn':
        return rejected(
          command.commandId,
          'retry_via_submit',
          '请通过新的 submitTurn 重试（VoltAgent Adapter 首版）'
        )
      case 'queueFollowUp':
      case 'steerRun':
      case 'reconcileInterruptedRun':
        return unsupported(
          command.commandId,
          `${command.type}_unsupported`,
          `VoltAgent Adapter 暂不支持 ${command.type}`
        )
      default:
        return unsupported(
          (command as ApplicationCommand).commandId,
          'unknown_command',
          '未知命令'
        )
    }
  }

  private ensureTask(taskId: string): TaskStreamState {
    let state = this.taskState.get(taskId)
    if (!state) {
      state = {
        nextSequence: 1,
        activeAbort: null,
        lastTurnId: null,
        lastUserText: null,
        lastCapabilityConnectorIds: [],
        pendingApprovals: new Map(),
        pendingQuestions: new Map(),
        pendingClientTools: new Map(),
        updatePlanCallIds: new Set(),
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

  private emitEnvelope(
    taskId: string,
    envelope: AgentRuntimeEventEnvelope
  ): void {
    this.emit(taskId, { kind: 'event', envelope })
  }

  /**
   * Allocate sequence + emit one envelope. eventId = `${idPrefix}-${turnId}-${seq}`.
   * `freshReceivedAt` matches cancel-path historical dual nowIso() calls.
   */
  private pushTaskEnvelope(
    taskId: string,
    ids: { turnId: string },
    idPrefix: string,
    eventType: string,
    payload: unknown,
    opts?: { freshReceivedAt?: boolean }
  ): void {
    const state = this.ensureTask(taskId)
    const occurredAt = this.nowIso()
    const receivedAt = opts?.freshReceivedAt ? this.nowIso() : occurredAt
    this.emitEnvelope(taskId, {
      eventId: `${idPrefix}-${ids.turnId}-${state.nextSequence}`,
      eventType,
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      taskId,
      turnId: ids.turnId,
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
    return { turnId }
  }

  private pushBookkeeping(
    taskId: string,
    turnId: string,
    inputText: string
  ): void {
    this.pushTaskEnvelope(taskId, { turnId }, 'va-book', 'turn.started', {
      inputText,
      text: inputText,
      source: 'voltagent-adapter',
    })
  }

  /** Start stream with AbortController lifecycle (submit + approval resume). */
  private launchStream(args: {
    taskId: string
    turnId: string
    input: StreamInput
    capabilityConnectorIds: readonly string[]
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
    command: SubmitTurnCommand
  ): Promise<CommandAcknowledgement> {
    const taskId = command.taskId
    const state = this.ensureTask(taskId)
    if (state.activeAbort) {
      return rejected(
        command.commandId,
        'task_busy',
        '当前任务已有进行中的轮次'
      )
    }

    const { turnId } = this.allocateIds(taskId, command)
    state.lastTurnId = turnId
    const modelInput = modelInputWithComposerContext(
      command.inputText,
      command.composerContext
    )
    state.lastUserText = modelInput
    state.lastCapabilityConnectorIds = [
      ...new Set(
        command.composerContext?.connectors
          ?.filter((connector) => connector.taskSelected)
          .map((connector) => connector.id) ?? []
      ),
    ]
    state.pendingApprovals.clear()
    state.pendingQuestions.clear()
    state.pendingClientTools.clear()

    this.pushBookkeeping(taskId, turnId, command.inputText)
    this.launchStream({
      taskId,
      turnId,
      input: modelInput,
      capabilityConnectorIds: state.lastCapabilityConnectorIds,
      completeIfNoTerminal: true,
    })

    return accepted(command.commandId, this.nowIso())
  }

  private async handleCancel(
    commandId: string,
    taskId: string
  ): Promise<CommandAcknowledgement> {
    const state = this.taskState.get(taskId)
    if (!state) {
      return rejected(commandId, 'no_active_run', '没有可取消的轮次')
    }
    if (
      !state.activeAbort &&
      state.pendingApprovals.size === 0 &&
      state.pendingQuestions.size === 0 &&
      state.pendingClientTools.size === 0
    ) {
      return rejected(commandId, 'no_active_run', '没有可取消的轮次')
    }
    const turnId = state.lastTurnId ?? undefined
    if (state.activeAbort) {
      state.activeAbort.abort('user_cancel')
      state.activeAbort = null
    }
    state.pendingApprovals.clear()
    state.pendingQuestions.clear()
    state.pendingClientTools.clear()

    const ids = { turnId: turnId ?? `turn-${taskId}` }
    this.pushTaskEnvelope(taskId, ids, 'va-cancel', 'turn.cancel_requested', {
      reason: 'user_cancel',
    })
    this.pushTaskEnvelope(
      taskId,
      ids,
      'va-cancelled',
      'turn.cancelled',
      { reason: 'user_cancel' },
      { freshReceivedAt: true }
    )
    return accepted(commandId, this.nowIso())
  }

  private async handleApproval(
    command: RespondToApprovalCommand
  ): Promise<CommandAcknowledgement> {
    const taskId = command.taskId
    const state = this.ensureTask(taskId)
    const approvalId = command.payload.requestId
    const pending = state.pendingApprovals.get(approvalId)
    const turnId =
      command.turnId ?? pending?.turnId ?? state.lastTurnId ?? `turn-${taskId}`
    const approved = command.payload.decision === 'approved'

    // Validate resumability *before* mutating approval state (Codex P2).
    if (!pending) {
      return rejected(
        command.commandId,
        'approval_not_found',
        '未找到待审批请求，或已过期（请重新提交写操作）'
      )
    }
    // A pending approval arrives while the SSE is still draining (finish/done).
    // Abort the paused stream so resume can start immediately — required for
    // renderer-side auto-approve (humans are slow enough that this rarely races).
    // Known limitation: aborting here may cut off a previous resume stream if
    // multiple approvals are pending in parallel (VoltAgent usually suspends
    // on the first approval, so this is rare).
    if (state.activeAbort) {
      state.activeAbort.abort('approval_resume')
      state.activeAbort = null
    }

    state.pendingApprovals.delete(approvalId)

    this.pushTaskEnvelope(
      taskId,
      { turnId },
      'va-apr',
      'approval.resolved',
      {
        requestId: approvalId,
        decision: command.payload.decision,
        reason: command.payload.reason,
      }
    )

    // Resume: UIMessage tool part with state=approval-responded (proven against VoltAgent).
    this.resumeWithToolPart(
      taskId,
      turnId,
      pending.userText || state.lastUserText || '',
      {
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
    )

    return accepted(command.commandId, this.nowIso())
  }

  private async handleProvideRunInput(
    command: ProvideRunInputCommand
  ): Promise<CommandAcknowledgement> {
    const taskId = command.taskId
    const state = this.ensureTask(taskId)
    const requestId = command.requestId
    if (!requestId) {
      return rejected(
        command.commandId,
        'missing_request_id',
        '缺少提问 requestId'
      )
    }
    const pending = state.pendingQuestions.get(requestId)
    if (!pending) {
      return rejected(
        command.commandId,
        'question_not_found',
        '未找到待回答的提问，或已过期'
      )
    }

    const turnId =
      command.turnId ?? pending.turnId ?? state.lastTurnId ?? `turn-${taskId}`
    const answer: QuestionAnswer =
      command.answer ?? { kind: 'freeText', text: command.inputText }
    const output = questionAnswerToToolOutput(
      answer,
      parseQuestionOptionsFromInput(pending.input)
    )

    if (state.activeAbort) {
      state.activeAbort.abort('question_resume')
      state.activeAbort = null
    }

    state.pendingQuestions.delete(requestId)

    this.pushTaskEnvelope(
      taskId,
      { turnId },
      'va-input',
      'input.provided',
      {
        requestId,
        answer,
        answeredAt: this.nowIso(),
      }
    )

    this.resumeWithToolPart(
      taskId,
      turnId,
      pending.userText || state.lastUserText || '',
      {
        type: 'tool-ask_user_question',
        toolCallId: pending.toolCallId,
        toolName: 'ask_user_question',
        state: 'output-available',
        input: pending.input,
        output,
      }
    )

    return accepted(command.commandId, this.nowIso())
  }

  private resumeWithToolPart(
    taskId: string,
    turnId: string,
    userText: string,
    toolPart: UiToolPart
  ): void {
    const state = this.ensureTask(taskId)
    this.launchStream({
      taskId,
      turnId,
      input: [
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
      ],
      capabilityConnectorIds: state.lastCapabilityConnectorIds,
      completeIfNoTerminal: true,
    })
  }

  private rememberApprovalFromChunk(
    taskId: string,
    turnId: string,
    chunk: FullStreamChunk
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
    const toolCallId = pickString(nested, ['toolCallId', 'id']) ?? approvalId
    const toolName = pickString(nested, ['toolName', 'name']) ?? 'tool'
    const input = nested.input ?? nested.args ?? nested.arguments
    state.pendingApprovals.set(approvalId, {
      approvalId,
      toolCallId,
      toolName,
      input: normalizeWorkspaceToolInput(input),
      userText: state.lastUserText ?? '',
      turnId,
    })
  }

  private rememberQuestionFromChunk(
    taskId: string,
    turnId: string,
    chunk: FullStreamChunk
  ): void {
    if (chunk.type !== 'tool-call') return
    const rec = chunk as unknown as Record<string, unknown>
    if (pickString(rec, ['toolName', 'name']) !== 'ask_user_question') return
    const state = this.ensureTask(taskId)
    const callId = pickString(rec, ['toolCallId', 'id']) ?? 'tool-call'
    const input = chunk.args ?? chunk.input ?? chunk.arguments
    state.pendingQuestions.set(callId, {
      requestId: callId,
      toolCallId: callId,
      input,
      userText: state.lastUserText ?? '',
      turnId,
    })
  }

  private rememberClientToolFromChunk(
    taskId: string,
    turnId: string,
    chunk: FullStreamChunk
  ): void {
    if (chunk.type !== 'tool-call') return
    const rec = chunk as unknown as Record<string, unknown>
    const toolName = pickString(rec, ['toolName', 'name'])
    if (!toolName || !isBoardClientTool(toolName)) return
    const state = this.ensureTask(taskId)
    const callId = pickString(rec, ['toolCallId', 'id']) ?? 'tool-call'
    state.pendingClientTools.set(callId, {
      toolCallId: callId,
      toolName,
      input: chunk.args ?? chunk.input ?? chunk.arguments,
      userText: state.lastUserText ?? '',
      turnId,
    })
  }

  private async flushClientTools(taskId: string, turnId: string): Promise<void> {
    const state = this.taskState.get(taskId)
    if (!state || state.pendingClientTools.size === 0) return
    const pending = state.pendingClientTools.values().next().value as
      | PendingClientTool
      | undefined
    if (!pending) return
    state.pendingClientTools.delete(pending.toolCallId)

    let output: unknown
    const executor = this.resolveClientToolExecutor()
    try {
      output = executor
        ? await executor({
            toolName: pending.toolName,
            args: pending.input,
            taskId,
            turnId,
          })
        : {
            ok: false,
            error: 'runtime_unavailable',
            hint: '看板控制面尚未接通，无法提交',
          }
    } catch (err) {
      output = {
        ok: false,
        error: 'runtime_unavailable',
        hint: err instanceof Error ? err.message : '看板控制面执行失败',
      }
    }

    this.pushTaskEnvelope(taskId, { turnId }, 'va-board', 'tool.completed', {
      toolId: pending.toolCallId,
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      name: pending.toolName,
      label: pending.toolName,
      args: pending.input,
      output,
      status:
        output &&
        typeof output === 'object' &&
        'ok' in output &&
        (output as { ok: unknown }).ok === false
          ? 'error'
          : 'completed',
    })

    this.resumeWithToolPart(
      taskId,
      turnId,
      pending.userText || state.lastUserText || '',
      {
        type: `tool-${pending.toolName}`,
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        state: 'output-available',
        input: pending.input,
        output,
      }
    )
  }

  private async streamAgent(args: {
    taskId: string
    turnId: string
    input: StreamInput
    capabilityConnectorIds: readonly string[]
    signal: AbortSignal
    completeIfNoTerminal?: boolean
  }): Promise<void> {
    const { taskId, turnId, input, signal, completeIfNoTerminal } = args
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
            context: {
              capabilityConnectorIds: [...args.capabilityConnectorIds],
            },
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
        this.failTurn(
          taskId,
          turnId,
          `侧车 HTTP ${response.status}: ${body.slice(0, 200) || response.statusText}`
        )
        return
      }

      if (!response.body) {
        this.failTurn(taskId, turnId, '侧车未返回流式 body')
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
          state.pendingApprovals.size > 0 ||
          state.pendingQuestions.size > 0 ||
          state.pendingClientTools.size > 0
        ) {
          return
        }
        this.pushTaskEnvelope(
          taskId,
          { turnId },
          'va-complete',
          'turn.completed',
          { reason }
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

        // Record pending HITL before deciding whether a terminal event is legal.
        this.rememberApprovalFromChunk(taskId, turnId, chunk)
        this.rememberQuestionFromChunk(taskId, turnId, chunk)
        this.rememberClientToolFromChunk(taskId, turnId, chunk)
        const pausedForHitl =
          state.pendingApprovals.size > 0 ||
          state.pendingQuestions.size > 0 ||
          state.pendingClientTools.size > 0

        const mapped = mapFullStreamChunk(chunk, {
          projectId: this.projectId,
          taskId,
          turnId,
          nextSequence: state.nextSequence,
          schemaVersion: this.schemaVersion,
          nowIso: this.nowIso,
          eventIdPrefix: 'va',
          updatePlanCallIds: state.updatePlanCallIds,
        })
        for (const env of mapped.envelopes) {
          if (env.eventType === 'turn.started') continue
          const terminal = isTerminalTurnEvent(env.eventType)
          if (terminal && (pausedForHitl || sawTerminalEvent)) continue
          this.emitEnvelope(taskId, {
            ...env,
            taskSequence: state.nextSequence,
            eventId: `va-${turnId}-${state.nextSequence}`,
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
      await this.flushClientTools(taskId, turnId)
    } catch (err) {
      if (signal.aborted) {
        return
      }
      const message =
        err instanceof Error ? err.message : '连接 VoltAgent 侧车失败'
      this.failTurn(taskId, turnId, message)
      this.emit(taskId, {
        kind: 'error',
        code: 'voltagent_stream_error',
        message,
      })
    }
  }

  private failTurn(
    taskId: string,
    turnId: string,
    message: string
  ): void {
    this.pushTaskEnvelope(taskId, { turnId }, 'va-fail', 'turn.failed', {
      message,
    })
  }
}

export function createVoltAgentRuntimeAdapter(
  options: VoltAgentRuntimeAdapterOptions
): VoltAgentRuntimeAdapter {
  return new VoltAgentRuntimeAdapter(options)
}
