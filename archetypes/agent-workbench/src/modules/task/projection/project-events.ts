/**
 * Pure event → TaskReadModel projection (Phase 4C–4F).
 *
 * Rules:
 * - Dedupe by eventId
 * - Sequence gap (sequence > last+1) → recoveryRequired
 * - Coalesce multi-event categories via sourceEventIds
 * - Known 4D types never push unsupported-event
 */

import {
  isTerminalRunStatus,
  type RunId,
  type RunStatus,
  type TaskId,
  type TitleSource,
  type TurnId,
} from '../model/lifecycle'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { normalizeToolOutput } from '../runtime/tool-output-normalize'
import { emptyProjectionState } from './empty-read-model'
import { parsePlanSnapshot } from './plan-snapshot'
import {
  classifyToolActivity,
  extractToolObject,
  formatToolActivityCopy,
  liveStatusForToolActivity,
  toolKindHint,
} from './tool-activity-copy'
import type {
  AssistantMessageRole,
  ProjectionState,
  TaskReadModel,
  TimelineFollowMode,
  TimelineItem,
  TimelineItemCategory,
  TimelineItemMeta,
  ProcessStepKind,
} from './types'

type MutableState = {
  readModel: TaskReadModel
  seenEventIds: Set<string>
}

function cloneState(state: ProjectionState): MutableState {
  return {
    readModel: {
      ...state.readModel,
      timeline: state.readModel.timeline.map((item) => ({
        ...item,
        sourceEventIds: [...item.sourceEventIds],
        sourceEventRange: item.sourceEventRange
          ? { ...item.sourceEventRange }
          : undefined,
      })),
      scroll: { ...state.readModel.scroll },
    },
    seenEventIds: new Set(state.seenEventIds),
  }
}

function freezeState(state: MutableState): ProjectionState {
  return {
    readModel: state.readModel,
    seenEventIds: state.seenEventIds,
  }
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload != null && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>
  }
  return {}
}

function payloadText(payload: unknown, keys: string[] = ['text', 'inputText']): string | null {
  const rec = asRecord(payload)
  for (const key of keys) {
    const value = rec[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function payloadString(payload: unknown, key: string): string | null {
  const value = asRecord(payload)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function approvalResolvedStatus(decision: string | null): string {
  if (decision === 'approved') return 'approved'
  if (decision === 'rejected') return 'rejected'
  return 'resolved'
}

function approvalDecisionLabel(
  decision: string | null,
  reason: string | null,
): string {
  if (decision === 'approved') {
    return reason ? '自动批准' : '允许一次'
  }
  if (decision === 'rejected') return '拒绝'
  return ''
}

function touchItem(
  item: TimelineItem,
  envelope: AgentRuntimeEventEnvelope,
  projectionVersion: number,
): TimelineItem {
  const ids = item.sourceEventIds.includes(envelope.eventId)
    ? item.sourceEventIds
    : [...item.sourceEventIds, envelope.eventId]
  const seq = envelope.taskSequence
  const sequenceFrom = item.sequenceFrom == null ? seq : Math.min(item.sequenceFrom, seq)
  const sequenceTo = item.sequenceTo == null ? seq : Math.max(item.sequenceTo, seq)
  return {
    ...item,
    sourceEventIds: ids,
    sequenceFrom,
    sequenceTo,
    sourceEventRange: { from: sequenceFrom, to: sequenceTo },
    projectionVersion,
    turnId: (envelope.turnId as TurnId | undefined) ?? item.turnId,
    runId: (envelope.runId as RunId | undefined) ?? item.runId,
  }
}

function findIndex(
  timeline: TimelineItem[],
  predicate: (item: TimelineItem) => boolean,
): number {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    if (predicate(timeline[i]!)) return i
  }
  return -1
}

function replaceItem(state: MutableState, index: number, item: TimelineItem): void {
  const next = [...state.readModel.timeline]
  next[index] = item
  state.readModel = { ...state.readModel, timeline: next }
}

function pushItem(state: MutableState, item: TimelineItem): void {
  state.readModel = {
    ...state.readModel,
    timeline: [...state.readModel.timeline, item],
  }
}

function setLiveStatus(state: MutableState, liveStatus: string | null): void {
  if (state.readModel.liveStatus === liveStatus) return
  state.readModel = { ...state.readModel, liveStatus }
}

function setRunStatus(
  state: MutableState,
  status: RunStatus | null,
  envelope: AgentRuntimeEventEnvelope,
): void {
  state.readModel = {
    ...state.readModel,
    runStatus: status,
    activeRunId: (envelope.runId as RunId | undefined) ?? state.readModel.activeRunId,
    activeTurnId: (envelope.turnId as TurnId | undefined) ?? state.readModel.activeTurnId,
  }
  // Terminal runs clear the active run pointer; interrupted is recovery state (also clear).
  if (status != null && (isTerminalRunStatus(status) || status === 'interrupted')) {
    state.readModel = {
      ...state.readModel,
      activeRunId: null,
      liveStatus: null,
    }
  }
}

function parseDiffLines(raw: unknown): TimelineItemMeta['diffLines'] | undefined {
  if (!Array.isArray(raw)) return undefined
  const lines: NonNullable<TimelineItemMeta['diffLines']> = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const rec = entry as Record<string, unknown>
    const type =
      rec.type === 'add' || rec.type === 'del' || rec.type === 'context'
        ? rec.type
        : null
    if (!type || typeof rec.text !== 'string') continue
    lines.push({
      type,
      text: rec.text,
      line: typeof rec.line === 'number' ? rec.line : undefined,
    })
  }
  return lines.length > 0 ? lines : undefined
}

function parseChildren(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw
    .map((c) => {
      if (typeof c === 'string') return c
      if (c && typeof c === 'object' && 'path' in c) {
        return String((c as { path: unknown }).path)
      }
      if (c && typeof c === 'object' && 'title' in c) {
        return String((c as { title: unknown }).title)
      }
      return null
    })
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
  return out.length > 0 ? out : undefined
}

function mergeMeta(
  base: TimelineItemMeta | undefined,
  patch: TimelineItemMeta | undefined,
): TimelineItemMeta | undefined {
  if (!base && !patch) return undefined
  return { ...base, ...patch }
}

function baseItem(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  partial: Pick<TimelineItem, 'id' | 'category'> &
    Partial<Omit<TimelineItem, 'id' | 'category' | 'sourceEventIds' | 'taskId' | 'projectionVersion'>>,
): TimelineItem {
  const version = state.readModel.projectionVersion
  return {
    title: partial.title,
    body: partial.body,
    status: partial.status,
    meta: partial.meta,
    sourceEventIds: [envelope.eventId],
    sourceEventRange: {
      from: envelope.taskSequence,
      to: envelope.taskSequence,
    },
    taskId: envelope.taskId as TaskId,
    turnId: (envelope.turnId as TurnId | undefined) ?? partial.turnId,
    runId: (envelope.runId as RunId | undefined) ?? partial.runId,
    sequenceFrom: envelope.taskSequence,
    sequenceTo: envelope.taskSequence,
    projectionVersion: version,
    id: partial.id,
    category: partial.category,
  }
}

function ensureUserMessage(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  text: string,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const version = state.readModel.projectionVersion
  const existingIdx = findIndex(
    state.readModel.timeline,
    (item) =>
      item.category === 'user-message' &&
      (turnId ? item.turnId === turnId && item.body === text : item.body === text),
  )
  if (existingIdx >= 0) {
    const updated = touchItem(state.readModel.timeline[existingIdx]!, envelope, version)
    replaceItem(state, existingIdx, { ...updated, body: updated.body || text })
    return
  }
  pushItem(
    state,
    baseItem(state, envelope, {
      id: `user:${turnId ?? envelope.eventId}:${envelope.eventId}`,
      category: 'user-message',
      body: text,
      turnId,
    }),
  )
}

function ensureRunTerminal(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  status: RunStatus,
  title: string,
  metaPatch?: TimelineItemMeta,
): void {
  const runId = envelope.runId as RunId | undefined
  const version = state.readModel.projectionVersion
  const match = (item: TimelineItem) =>
    item.category === 'run-terminal' &&
    (runId ? item.runId === runId : item.id === `run-terminal:${envelope.eventId}`)

  const idx = findIndex(state.readModel.timeline, match)
  if (idx >= 0) {
    const base = touchItem(state.readModel.timeline[idx]!, envelope, version)
    replaceItem(state, idx, {
      ...base,
      status,
      title,
      meta: mergeMeta(base.meta, metaPatch),
    })
    return
  }
  pushItem(
    state,
    baseItem(state, envelope, {
      id: `run-terminal:${runId ?? envelope.eventId}`,
      category: 'run-terminal',
      title,
      status,
      runId,
      meta: metaPatch,
    }),
  )
}

function isProcessBreakingCategory(category: TimelineItemCategory): boolean {
  return (
    category === 'tool-group' ||
    category === 'command-execution' ||
    category === 'reasoning-section' ||
    category === 'plan-update' ||
    category === 'source-group' ||
    category === 'approval-request' ||
    category === 'file-change' ||
    category === 'input-request'
  )
}

function resolveOutputPhase(
  envelope: AgentRuntimeEventEnvelope,
  runStatus: RunStatus | null,
): AssistantMessageRole {
  const raw = payloadString(envelope.payload, 'phase')
  if (raw === 'commentary' || raw === 'final') return raw
  // Heuristic: mid-run text is commentary; idle/terminal defaults final.
  if (runStatus === 'running' || runStatus === 'queued' || runStatus === 'cancelling') {
    return 'commentary'
  }
  return 'final'
}

/**
 * Append assistant text. Opens a new segment after tools/approvals so
 * commentary can interleave with tool rows (Codex-style process fold).
 */
function appendAssistantDelta(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  delta: string,
  role: AssistantMessageRole,
): void {
  const runId = envelope.runId as RunId | undefined
  const version = state.readModel.projectionVersion
  const timeline = state.readModel.timeline

  let openIdx = -1
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]!
    if (runId && item.runId && item.runId !== runId) continue
    if (item.category !== 'assistant-message') {
      if (isProcessBreakingCategory(item.category)) break
      continue
    }
    const itemRole = item.meta?.messageRole ?? 'final'
    if (itemRole !== role) break
    // text-end/output.completed seals a segment. A later text-delta is a new
    // narrative segment even when no tool row appears between them.
    if (item.status === 'completed') break
    // Nothing process-breaking after this assistant → keep appending.
    const brokenAfter = timeline
      .slice(i + 1)
      .some(
        (x) =>
          (!runId || !x.runId || x.runId === runId) &&
          isProcessBreakingCategory(x.category),
      )
    if (!brokenAfter) openIdx = i
    break
  }

  if (openIdx >= 0) {
    const base = touchItem(timeline[openIdx]!, envelope, version)
    replaceItem(state, openIdx, {
      ...base,
      body: `${base.body ?? ''}${delta}`,
      status: 'streaming',
      meta: mergeMeta(base.meta, { messageRole: role }),
    })
    return
  }

  const seg = timeline.filter(
    (i) =>
      i.category === 'assistant-message' &&
      (!runId || i.runId === runId) &&
      (i.meta?.messageRole ?? 'final') === role,
  ).length

  pushItem(
    state,
    baseItem(state, envelope, {
      id: `assistant:${runId ?? envelope.eventId}:${role}:${seg}`,
      category: 'assistant-message',
      body: delta,
      status: 'streaming',
      runId,
      meta: { messageRole: role },
    }),
  )
}

function finalizeAssistant(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  finalText: string | null,
): void {
  const runId = envelope.runId as RunId | undefined
  const version = state.readModel.projectionVersion
  // Prefer open commentary/final segment for this run (last assistant).
  let idx = -1
  for (let i = state.readModel.timeline.length - 1; i >= 0; i--) {
    const item = state.readModel.timeline[i]!
    if (item.category !== 'assistant-message') continue
    if (runId && item.runId && item.runId !== runId) continue
    idx = i
    break
  }
  if (idx >= 0) {
    const base = touchItem(state.readModel.timeline[idx]!, envelope, version)
    replaceItem(state, idx, {
      ...base,
      body: finalText && finalText.length > 0 ? finalText : base.body,
      status: 'completed',
      meta: mergeMeta(base.meta, {
        messageRole: base.meta?.messageRole ?? 'final',
      }),
    })
    return
  }
  if (finalText && finalText.length > 0) {
    pushItem(
      state,
      baseItem(state, envelope, {
        id: `assistant:${runId ?? envelope.eventId}:final:0`,
        category: 'assistant-message',
        body: finalText,
        status: 'completed',
        runId,
        meta: { messageRole: 'final' },
      }),
    )
  }
}

/** On run complete: last assistant segment → final; earlier ones → commentary. */
function promoteAssistantRolesOnRunComplete(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): void {
  const runId = envelope.runId as RunId | undefined
  const indices: number[] = []
  state.readModel.timeline.forEach((item, i) => {
    if (item.category !== 'assistant-message') return
    if (runId && item.runId && item.runId !== runId) return
    indices.push(i)
  })
  if (indices.length === 0) return
  const lastIdx = indices[indices.length - 1]!
  for (const i of indices) {
    // Do not touch sourceEventIds — role promotion is presentation-only.
    const base = state.readModel.timeline[i]!
    const role: AssistantMessageRole = i === lastIdx ? 'final' : 'commentary'
    replaceItem(state, i, {
      ...base,
      status: 'completed',
      meta: mergeMeta(base.meta, { messageRole: role }),
    })
  }
}

function ensureReasoning(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  reasoningKey: string,
  delta: string | null,
  title?: string | null,
  completed = false,
): void {
  const runId = envelope.runId as RunId | undefined
  const version = state.readModel.projectionVersion
  const idx = findIndex(
    state.readModel.timeline,
    (item) =>
      item.category === 'reasoning-section' &&
      item.runId === runId &&
      item.id === `reasoning:${runId ?? 'run'}:${reasoningKey}`,
  )
  if (idx >= 0) {
    const base = touchItem(state.readModel.timeline[idx]!, envelope, version)
    replaceItem(state, idx, {
      ...base,
      title: title || base.title || '思考过程',
      body: delta ? `${base.body ?? ''}${delta}` : base.body,
      status: completed ? 'completed' : 'streaming',
    })
    return
  }
  pushItem(
    state,
    baseItem(state, envelope, {
      id: `reasoning:${runId ?? 'run'}:${reasoningKey}`,
      category: 'reasoning-section',
      title: title || '思考过程',
      body: delta ?? '',
      status: completed ? 'completed' : 'streaming',
      runId,
    }),
  )
}

function syncProcessSummary(
  state: MutableState,
  runId: RunId | undefined,
): void {
  const terminalIdx = findIndex(
    state.readModel.timeline,
    (item) =>
      item.category === 'run-terminal' &&
      (!runId || item.runId === runId),
  )
  if (terminalIdx < 0) return

  const steps = state.readModel.timeline.filter(
    (item) =>
      (!runId || item.runId === runId) &&
      (item.category === 'tool-group' ||
        item.category === 'command-execution'),
  )
  const counts: Partial<Record<ProcessStepKind, number>> = {}
  for (const step of steps) {
    const kind = step.meta?.processKind ?? 'other'
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  const terminal = state.readModel.timeline[terminalIdx]!
  replaceItem(state, terminalIdx, {
    ...terminal,
    meta: mergeMeta(terminal.meta, {
      processSummary: { stepCount: steps.length, counts },
    }),
  })
}

function upsertByKey(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  category: TimelineItemCategory,
  key: string,
  patch: {
    title?: string
    body?: string
    status?: string
    meta?: TimelineItemMeta
  },
): void {
  const version = state.readModel.projectionVersion
  const id = `${category}:${key}`
  const idx = findIndex(
    state.readModel.timeline,
    (item) => item.category === category && item.id === id,
  )
  if (idx >= 0) {
    const base = touchItem(state.readModel.timeline[idx]!, envelope, version)
    const nextMeta = mergeMeta(base.meta, patch.meta)
    // Append children rather than replace when both exist.
    if (base.meta?.children && patch.meta?.children) {
      const merged = [
        ...base.meta.children,
        ...patch.meta.children.filter((c) => !base.meta!.children!.includes(c)),
      ]
      nextMeta!.children = merged
    }
    replaceItem(state, idx, {
      ...base,
      title: patch.title ?? base.title,
      body: patch.body != null ? `${base.body ?? ''}${patch.body}` : base.body,
      status: patch.status ?? base.status,
      meta: nextMeta,
    })
    return
  }
  pushItem(
    state,
    baseItem(state, envelope, {
      id,
      category,
      title: patch.title,
      body: patch.body,
      status: patch.status,
      meta: patch.meta,
    }),
  )
}

function pushError(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  message: string,
): void {
  const runId = envelope.runId as RunId | undefined
  const idx = findIndex(
    state.readModel.timeline,
    (item) => item.category === 'error' && item.runId === runId,
  )
  if (idx >= 0) {
    const base = touchItem(
      state.readModel.timeline[idx]!,
      envelope,
      state.readModel.projectionVersion,
    )
    replaceItem(state, idx, {
      ...base,
      body: message || base.body,
      status: 'failed',
    })
    return
  }
  pushItem(
    state,
    baseItem(state, envelope, {
      id: `error:${runId ?? envelope.eventId}`,
      category: 'error',
      title: '运行失败',
      body: message,
      status: 'failed',
      runId,
    }),
  )
}

function pushWarning(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): void {
  const title =
    payloadString(envelope.payload, 'title') ?? '警告'
  const body =
    payloadString(envelope.payload, 'message') ??
    payloadText(envelope.payload) ??
    ''
  pushItem(
    state,
    baseItem(state, envelope, {
      id: `warning:${envelope.eventId}`,
      category: 'warning',
      title,
      body: body || undefined,
    }),
  )
}

function pushUnsupported(state: MutableState, envelope: AgentRuntimeEventEnvelope): void {
  pushItem(
    state,
    baseItem(state, envelope, {
      id: `unsupported:${envelope.eventId}`,
      category: 'unsupported-event' satisfies TimelineItemCategory,
      title: String(envelope.eventType),
      body: '未识别的 Runtime 事件（已保留原文，不阻断时间线）',
    }),
  )
}

/**
 * Duration for completed turn chrome from payload.durationMs or
 * run-terminal meta.startedAt (legacy: meta.path `startedAt:ISO`).
 */
function computeRunDurationMs(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): number | null {
  const rec = asRecord(envelope.payload)
  if (typeof rec.durationMs === 'number' && Number.isFinite(rec.durationMs)) {
    return Math.max(0, rec.durationMs)
  }
  const runId = envelope.runId as RunId | undefined
  const terminal = state.readModel.timeline.find(
    (item) =>
      item.category === 'run-terminal' &&
      (runId ? item.runId === runId : true),
  )
  const startedAt =
    terminal?.meta?.startedAt ??
    (terminal?.meta?.path?.startsWith('startedAt:')
      ? terminal.meta.path.slice('startedAt:'.length)
      : undefined)
  if (startedAt && envelope.occurredAt) {
    const start = Date.parse(startedAt)
    const end = Date.parse(envelope.occurredAt)
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return end - start
    }
  }
  return null
}

/**
 * Apply a single envelope. Pure: returns a new ProjectionState.
 */
export function applyRuntimeEvent(
  state: ProjectionState,
  envelope: AgentRuntimeEventEnvelope,
): ProjectionState {
  if (state.seenEventIds.has(envelope.eventId)) {
    return state
  }

  const next = cloneState(state)
  next.seenEventIds.add(envelope.eventId)

  const last = next.readModel.lastTaskSequence
  if (envelope.taskSequence > last + 1 && last > 0) {
    next.readModel = { ...next.readModel, recoveryRequired: true }
  } else if (envelope.taskSequence > last + 1 && last === 0 && envelope.taskSequence !== 1) {
    next.readModel = { ...next.readModel, recoveryRequired: true }
  }

  next.readModel = {
    ...next.readModel,
    lastTaskSequence: Math.max(next.readModel.lastTaskSequence, envelope.taskSequence),
    projectionVersion: next.readModel.projectionVersion + 1,
  }

  if (envelope.taskId) {
    next.readModel = {
      ...next.readModel,
      taskId: envelope.taskId as TaskId,
      projectId: (envelope.projectId as TaskReadModel['projectId']) || next.readModel.projectId,
    }
  }

  // Unread bump when user-pinned (4F helper field; UI may also use local state).
  if (next.readModel.scroll.followMode === 'user-pinned') {
    next.readModel = {
      ...next.readModel,
      scroll: {
        ...next.readModel.scroll,
        unreadCount: next.readModel.scroll.unreadCount + 1,
      },
    }
  }

  const type = String(envelope.eventType)
  const rec = asRecord(envelope.payload)

  switch (type) {
    case 'task.created': {
      const title = typeof rec.title === 'string' ? rec.title : next.readModel.title
      const titleSource =
        rec.titleSource === 'local' || rec.titleSource === 'runtime' || rec.titleSource === 'user'
          ? (rec.titleSource as TitleSource)
          : next.readModel.titleSource
      next.readModel = { ...next.readModel, title, titleSource }
      break
    }
    case 'turn.created': {
      const text = payloadText(envelope.payload, ['inputText', 'text'])
      if (text) ensureUserMessage(next, envelope, text)
      if (envelope.turnId) {
        next.readModel = {
          ...next.readModel,
          activeTurnId: envelope.turnId as TurnId,
        }
      }
      break
    }
    case 'message.accepted': {
      const text = payloadText(envelope.payload, ['text', 'inputText'])
      if (text) ensureUserMessage(next, envelope, text)
      break
    }
    case 'run.queued': {
      setRunStatus(next, 'queued', envelope)
      ensureRunTerminal(next, envelope, 'queued', '排队中')
      setLiveStatus(next, '排队中')
      break
    }
    case 'run.started': {
      setRunStatus(next, 'running', envelope)
      const startedAt =
        typeof envelope.occurredAt === 'string' ? envelope.occurredAt : null
      // Present-tense title while running (not 「已处理」— that is completed-only Chinese).
      ensureRunTerminal(next, envelope, 'running', '正在思考', {
        startedAt: startedAt ?? undefined,
        // Legacy stamp for older duration readers.
        path: startedAt ? `startedAt:${startedAt}` : undefined,
      })
      setLiveStatus(next, '正在思考')
      break
    }
    case 'output.delta': {
      const delta = payloadText(envelope.payload, ['text', 'delta']) ?? ''
      const phase = resolveOutputPhase(envelope, next.readModel.runStatus)
      if (delta) appendAssistantDelta(next, envelope, delta, phase)
      // Only show generic generating when no tool activity is more specific.
      if (
        next.readModel.runStatus === 'running' &&
        phase === 'commentary' &&
        !next.readModel.liveStatus?.startsWith('正在读') &&
        !next.readModel.liveStatus?.startsWith('正在列') &&
        !next.readModel.liveStatus?.startsWith('正在写') &&
        !next.readModel.liveStatus?.startsWith('正在搜') &&
        !next.readModel.liveStatus?.startsWith('正在执') &&
        !next.readModel.liveStatus?.startsWith('正在调')
      ) {
        // Keep tool liveStatus if already set; else light generating hint.
        if (
          !next.readModel.liveStatus ||
          next.readModel.liveStatus === '正在思考'
        ) {
          setLiveStatus(next, '正在生成回复…')
        }
      }
      break
    }
    case 'output.completed': {
      const text = payloadText(envelope.payload, ['text'])
      finalizeAssistant(next, envelope, text)
      break
    }
    case 'run.completed': {
      promoteAssistantRolesOnRunComplete(next, envelope)
      setRunStatus(next, 'completed', envelope)
      const durationMs = computeRunDurationMs(next, envelope)
      ensureRunTerminal(next, envelope, 'completed', '已处理', {
        durationMs: durationMs ?? undefined,
      })
      break
    }
    case 'run.cancel_requested': {
      setRunStatus(next, 'cancelling', envelope)
      ensureRunTerminal(next, envelope, 'cancelling', '取消中')
      setLiveStatus(next, '取消中')
      break
    }
    case 'run.cancelled': {
      setRunStatus(next, 'cancelled', envelope)
      const durationMs = computeRunDurationMs(next, envelope)
      ensureRunTerminal(next, envelope, 'cancelled', '已取消', {
        durationMs: durationMs ?? undefined,
      })
      break
    }
    case 'run.failed': {
      setRunStatus(next, 'failed', envelope)
      const durationMs = computeRunDurationMs(next, envelope)
      ensureRunTerminal(next, envelope, 'failed', '失败', {
        durationMs: durationMs ?? undefined,
      })
      const message =
        payloadString(envelope.payload, 'message') ??
        payloadString(envelope.payload, 'reasonCode') ??
        '运行失败'
      pushError(next, envelope, message)
      break
    }
    case 'run.interrupted': {
      setRunStatus(next, 'interrupted', envelope)
      ensureRunTerminal(next, envelope, 'interrupted', '已中断')
      break
    }
    case 'run.reconciled': {
      // Reconcile does not invent a new terminal by itself; status comes from follow-up events.
      const version = next.readModel.projectionVersion
      const runId = envelope.runId as RunId | undefined
      const idx = findIndex(
        next.readModel.timeline,
        (item) => item.category === 'run-terminal' && item.runId === runId,
      )
      if (idx >= 0) {
        const base = touchItem(next.readModel.timeline[idx]!, envelope, version)
        replaceItem(next, idx, {
          ...base,
          title: base.title ?? '已恢复对账',
          body: payloadString(envelope.payload, 'outcome') ?? base.body,
        })
      }
      break
    }
    case 'reasoning.started': {
      ensureReasoning(
        next,
        envelope,
        payloadString(envelope.payload, 'id') ?? 'default',
        null,
        payloadString(envelope.payload, 'title') ?? '思考过程',
        false,
      )
      setLiveStatus(next, '正在思考')
      break
    }
    case 'reasoning.delta': {
      const delta = payloadText(envelope.payload, ['text', 'delta']) ?? ''
      ensureReasoning(
        next,
        envelope,
        payloadString(envelope.payload, 'id') ?? 'default',
        delta,
        null,
        false,
      )
      setLiveStatus(next, '正在思考')
      break
    }
    case 'reasoning.section_completed': {
      ensureReasoning(
        next,
        envelope,
        payloadString(envelope.payload, 'id') ??
          payloadString(envelope.payload, 'sectionId') ??
          'default',
        null,
        payloadString(envelope.payload, 'title'),
        false,
      )
      break
    }
    case 'reasoning.completed': {
      ensureReasoning(
        next,
        envelope,
        payloadString(envelope.payload, 'id') ?? 'default',
        null,
        payloadString(envelope.payload, 'summary') ??
          payloadString(envelope.payload, 'title'),
        true,
      )
      break
    }
    case 'plan.updated': {
      const snapshot = parsePlanSnapshot(envelope.payload)
      next.readModel = { ...next.readModel, plan: snapshot }
      const version = next.readModel.projectionVersion
      const key = String(envelope.runId ?? envelope.eventId)
      const id = `plan-update:${key}`
      const idx = findIndex(
        next.readModel.timeline,
        (item) => item.category === 'plan-update' && item.id === id,
      )
      const patch = {
        title: '计划已更新',
        body: snapshot.explanation,
        status: 'updated' as const,
        meta: {
          plan: {
            explanation: snapshot.explanation,
            steps: snapshot.steps,
          },
        },
      }
      if (idx >= 0) {
        const base = touchItem(next.readModel.timeline[idx]!, envelope, version)
        replaceItem(next, idx, { ...base, ...patch })
      } else {
        pushItem(
          next,
          baseItem(next, envelope, {
            id,
            category: 'plan-update',
            ...patch,
          }),
        )
      }
      setLiveStatus(next, '正在更新计划…')
      break
    }
    case 'tool.called': {
      const toolId = payloadString(envelope.payload, 'toolId') ?? envelope.eventId
      const label =
        payloadString(envelope.payload, 'label') ??
        payloadString(envelope.payload, 'name')
      const name = payloadString(envelope.payload, 'name')
      const args = rec.args ?? rec.input ?? rec.arguments
      const children = parseChildren(rec.items ?? rec.children)
      const activity = {
        name,
        label,
        args,
        items: children,
      }
      const title = formatToolActivityCopy({ ...activity, status: 'running' })
      const kind = classifyToolActivity(name, label)
      upsertByKey(next, envelope, 'tool-group', toolId, {
        title,
        status: 'running',
        meta: {
          toolKind: toolKindHint(kind),
          processKind: kind === 'skill' || kind === 'plan' || kind === 'generic'
            ? 'other'
            : kind,
          children,
        },
      })
      syncProcessSummary(next, envelope.runId as RunId | undefined)
      setLiveStatus(next, liveStatusForToolActivity(activity))
      break
    }
    case 'tool.progress': {
      const toolId = payloadString(envelope.payload, 'toolId') ?? envelope.eventId
      const label = payloadString(envelope.payload, 'label')
      const name = payloadString(envelope.payload, 'name')
      const progress = rec.progress
      const body =
        typeof progress === 'number' ? `进度 ${Math.round(progress * 100)}%\n` : null
      const children = parseChildren(rec.items ?? rec.children)
      const args = rec.args ?? rec.input ?? rec.arguments
      const activity = { name, label, args, items: children }
      const title = formatToolActivityCopy({ ...activity, status: 'running' })
      upsertByKey(next, envelope, 'tool-group', toolId, {
        title,
        body: body ?? undefined,
        status: 'running',
        meta: children ? { children } : undefined,
      })
      syncProcessSummary(next, envelope.runId as RunId | undefined)
      setLiveStatus(next, liveStatusForToolActivity(activity))
      break
    }
    case 'tool.completed': {
      const toolId = payloadString(envelope.payload, 'toolId') ?? envelope.eventId
      const label = payloadString(envelope.payload, 'label')
      const name = payloadString(envelope.payload, 'name')
      // Prefer mapper summary/items; fall back to raw output for older streams.
      const fallback =
        rec.output !== undefined ? normalizeToolOutput(rec.output) : undefined
      const summary =
        payloadString(envelope.payload, 'summary') ?? fallback?.summary
      const children =
        parseChildren(rec.items ?? rec.children) ?? fallback?.items
      const args = rec.args ?? rec.input ?? rec.arguments
      const isError =
        rec.isError === true ||
        payloadString(envelope.payload, 'status') === 'error'
      const title = formatToolActivityCopy({
        name,
        label,
        args,
        items: children,
        status: isError ? 'error' : 'completed',
      })
      const kind = classifyToolActivity(name, label)
      upsertByKey(next, envelope, 'tool-group', toolId, {
        title,
        body: summary ? `${summary}\n` : undefined,
        status: isError ? 'error' : 'completed',
        meta: {
          toolKind: toolKindHint(kind),
          processKind: kind === 'skill' || kind === 'plan' || kind === 'generic'
            ? 'other'
            : kind,
          children,
        },
      })
      syncProcessSummary(next, envelope.runId as RunId | undefined)
      break
    }
    case 'command.started': {
      const commandId = payloadString(envelope.payload, 'commandId') ?? envelope.eventId
      const commandLine =
        payloadString(envelope.payload, 'command') ??
        payloadString(envelope.payload, 'text') ??
        commandId
      const title = formatToolActivityCopy({
        name: 'run_command',
        label: commandLine,
        args: { command: commandLine },
        status: 'running',
      })
      upsertByKey(next, envelope, 'command-execution', commandId, {
        title,
        status: 'running',
        meta: { toolKind: 'command', processKind: 'command' },
      })
      syncProcessSummary(next, envelope.runId as RunId | undefined)
      setLiveStatus(
        next,
        liveStatusForToolActivity({
          name: 'run_command',
          args: { command: commandLine },
        }),
      )
      break
    }
    case 'command.output': {
      const commandId = payloadString(envelope.payload, 'commandId') ?? envelope.eventId
      const text = payloadText(envelope.payload, ['text', 'output']) ?? ''
      upsertByKey(next, envelope, 'command-execution', commandId, {
        body: text,
        status: 'running',
      })
      syncProcessSummary(next, envelope.runId as RunId | undefined)
      break
    }
    case 'command.completed': {
      const commandId = payloadString(envelope.payload, 'commandId') ?? envelope.eventId
      const exitCode = rec.exitCode
      const commandLine =
        payloadString(envelope.payload, 'command') ??
        payloadString(envelope.payload, 'text')
      const title = commandLine
        ? formatToolActivityCopy({
            name: 'run_command',
            args: { command: commandLine },
            status: rec.isError === true || (typeof exitCode === 'number' && exitCode !== 0)
              ? 'error'
              : 'completed',
          })
        : undefined
      const summary = payloadString(envelope.payload, 'summary')
      const completionBody = [
        summary,
        typeof exitCode === 'number' ? `exit ${exitCode}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join('\n')
      upsertByKey(next, envelope, 'command-execution', commandId, {
        title,
        body: completionBody ? `\n${completionBody}` : undefined,
        status:
          rec.isError === true || (typeof exitCode === 'number' && exitCode !== 0)
            ? 'error'
            : 'completed',
        meta: { toolKind: 'command', processKind: 'command' },
      })
      syncProcessSummary(next, envelope.runId as RunId | undefined)
      break
    }
    case 'file.changed': {
      const path = payloadString(envelope.payload, 'path') ?? 'file'
      const summary = payloadString(envelope.payload, 'summary') ?? ''
      const additions =
        typeof rec.additions === 'number' ? rec.additions : undefined
      const deletions =
        typeof rec.deletions === 'number' ? rec.deletions : undefined
      const diffLines = parseDiffLines(rec.diffLines)
      const children = parseChildren(rec.children ?? rec.items)
      pushItem(
        next,
        baseItem(next, envelope, {
          id: `file-change:${envelope.eventId}`,
          category: 'file-change',
          title: path,
          body: summary,
          status: 'changed',
          meta: {
            path,
            additions,
            deletions,
            diffLines,
            children,
          },
        }),
      )
      setLiveStatus(next, '正在写入结果…')
      break
    }
    case 'source.grouped': {
      const title = payloadString(envelope.payload, 'title') ?? '来源'
      const sources = rec.sources
      const body = Array.isArray(sources)
        ? sources
            .map((s) => {
              if (s && typeof s === 'object' && 'path' in s) {
                return String((s as { path: unknown }).path)
              }
              return String(s)
            })
            .join('\n')
        : ''
      pushItem(
        next,
        baseItem(next, envelope, {
          id: `source-group:${envelope.eventId}`,
          category: 'source-group',
          title,
          body,
          status: 'grouped',
        }),
      )
      break
    }
    case 'approval.requested': {
      const requestId = payloadString(envelope.payload, 'requestId') ?? envelope.eventId
      const toolName =
        payloadString(envelope.payload, 'toolName') ??
        payloadString(envelope.payload, 'name')
      const args = rec.args ?? rec.input ?? rec.arguments
      const action = formatToolActivityCopy({
        name: toolName,
        args,
        status: 'running',
      }).replace(/^正在/, '')
      const target = extractToolObject({ name: toolName, args })
      const title =
        payloadString(envelope.payload, 'title') ??
        (action && action !== '思考' ? `请求${action}` : '需要审批')
      const detail =
        payloadString(envelope.payload, 'detail') ??
        (target ? `目标：${target}` : toolName ? `工具：${toolName}` : '')
      setRunStatus(next, 'waiting_for_approval', envelope)
      ensureRunTerminal(next, envelope, 'waiting_for_approval', '等待审批')
      setLiveStatus(next, '等待审批')
      upsertByKey(next, envelope, 'approval-request', requestId, {
        title,
        body: detail,
        status: 'waiting',
        meta: toolName ? { toolName } : undefined,
      })
      break
    }
    case 'approval.resolved': {
      const requestId = payloadString(envelope.payload, 'requestId') ?? envelope.eventId
      const decision = payloadString(envelope.payload, 'decision')
      const reason = payloadString(envelope.payload, 'reason')
      if (decision === 'approved') {
        setRunStatus(next, 'running', envelope)
        ensureRunTerminal(next, envelope, 'running', '正在思考')
        setLiveStatus(next, '正在思考')
      }
      const decisionLabel = approvalDecisionLabel(decision, reason)
      let extra = decisionLabel ? `\n决定：${decisionLabel}` : ''
      if (reason) extra += `\n${reason}`
      upsertByKey(next, envelope, 'approval-request', requestId, {
        status: approvalResolvedStatus(decision),
        body: extra || undefined,
      })
      break
    }
    case 'run.input_requested': {
      const requestId = payloadString(envelope.payload, 'requestId') ?? envelope.eventId
      const prompt = payloadString(envelope.payload, 'prompt') ?? '请补充输入'
      setRunStatus(next, 'waiting_for_input', envelope)
      ensureRunTerminal(next, envelope, 'waiting_for_input', '等待输入')
      setLiveStatus(next, '等待输入')
      upsertByKey(next, envelope, 'input-request', requestId, {
        title: '需要补充信息',
        body: prompt,
        status: 'waiting',
      })
      break
    }
    case 'run.input_provided': {
      const requestId = payloadString(envelope.payload, 'requestId') ?? envelope.eventId
      const text = payloadText(envelope.payload, ['text', 'inputText']) ?? ''
      setRunStatus(next, 'running', envelope)
      ensureRunTerminal(next, envelope, 'running', '正在思考')
      setLiveStatus(next, '正在思考')
      upsertByKey(next, envelope, 'input-request', requestId, {
        status: 'provided',
        body: text ? `\n已提供：${text}` : undefined,
      })
      break
    }
    case 'task.renamed':
    case 'task.title_suggested': {
      if (typeof rec.title === 'string' && rec.title.trim()) {
        next.readModel = {
          ...next.readModel,
          title: rec.title,
          titleSource:
            type === 'task.title_suggested' ? 'runtime' : next.readModel.titleSource,
        }
      }
      break
    }
    // Known but intentionally not projected as timeline rows (metadata / transport).
    case 'runtime.disconnected':
    case 'runtime.reconnected':
    case 'runtime.gap_detected':
    case 'runtime.snapshot_applied':
    case 'environment.selected':
    case 'capability.changed':
    case 'artifact.created':
    case 'artifact.updated':
    case 'artifact.linked':
    // Work Surface open is Session/Composition concern — never a timeline row / openTabs fact.
    case 'work_surface.open_requested':
      break
    case 'warning': {
      pushWarning(next, envelope)
      break
    }
    default: {
      pushUnsupported(next, envelope)
      break
    }
  }

  return freezeState(next)
}

/**
 * Reduce an ordered envelope list into a new read model / projection state.
 */
export function projectEvents(
  state: ProjectionState,
  envelopes: readonly AgentRuntimeEventEnvelope[],
): ProjectionState {
  let current = state
  for (const envelope of envelopes) {
    current = applyRuntimeEvent(current, envelope)
  }
  return current
}

/**
 * Convenience: project onto an empty state for a task.
 */
export function projectEventsFromEmpty(
  taskId: string,
  projectId: string,
  envelopes: readonly AgentRuntimeEventEnvelope[],
  title?: string,
): ProjectionState {
  return projectEvents(emptyProjectionState({ taskId, projectId, title }), envelopes)
}

/** Update follow mode / unread (4F); pure helper for controller or UI. */
export function setTimelineFollowMode(
  state: ProjectionState,
  mode: TimelineFollowMode,
  options?: { resetUnread?: boolean },
): ProjectionState {
  return {
    ...state,
    readModel: {
      ...state.readModel,
      scroll: {
        followMode: mode,
        unreadCount:
          options?.resetUnread || mode === 'follow'
            ? 0
            : state.readModel.scroll.unreadCount,
      },
    },
  }
}
