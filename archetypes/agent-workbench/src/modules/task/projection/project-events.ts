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
  isTerminalTurnStatus,
  type TaskId,
  type TitleSource,
  type TurnId,
  type TurnStatus,
} from '../model/lifecycle'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import {
  parseQuestionAnswer,
  parseQuestionRequest,
  questionAnswerToInputText,
} from '../protocol/question-answer'
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
  DeliverableRef,
  FileChangeKind,
  LiveStatusKind,
  ProjectionState,
  TaskReadModel,
  TimelineFollowMode,
  TimelineItem,
  TimelineItemCategory,
  TimelineItemMeta,
  TokenUsage,
  ProcessStepKind,
} from './types'

type MutableState = {
  readModel: TaskReadModel
  seenEventIds: Set<string>
  hasStepBoundaries: boolean
  activeStepId?: string
  workAnchorAt?: string
}

const WORKING_STEP_CATEGORIES = new Set<TimelineItemCategory>([
  'reasoning-section',
  'tool-group',
  'command-execution',
  'plan-update',
])

const STREAMING_DELTA_EVENT_TYPES = new Set([
  'message.delta',
  'reasoning.delta',
  'command.delta',
])

const SOURCE_EVENT_IDS_CAP = 8

export function isStreamingDeltaEvent(eventType: string): boolean {
  return STREAMING_DELTA_EVENT_TYPES.has(eventType)
}

/**
 * Shallow-share the previous projection. The timeline array is copied;
 * items stay the same object until {@link replaceItem} / {@link pushItem}.
 * `seenEventIds` is copy-on-write so `applyRuntimeEvent` does not mutate
 * the input state's Set.
 */
function cloneState(state: ProjectionState): MutableState {
  return {
    readModel: {
      ...state.readModel,
      timeline: state.readModel.timeline.slice(),
    },
    seenEventIds: new Set(state.seenEventIds),
    hasStepBoundaries: state.hasStepBoundaries === true,
    activeStepId: state.activeStepId,
    workAnchorAt: state.workAnchorAt,
  }
}

function capSourceEventIds(ids: string[]): string[] {
  if (ids.length <= SOURCE_EVENT_IDS_CAP) return ids
  return [...ids.slice(0, SOURCE_EVENT_IDS_CAP - 1), ids[ids.length - 1]!]
}

function nextSourceEventIds(
  item: TimelineItem,
  envelope: AgentRuntimeEventEnvelope,
): string[] {
  const ids = item.sourceEventIds
  if (ids.includes(envelope.eventId)) return ids

  if (isStreamingDeltaEvent(String(envelope.eventType))) {
    if (ids.length === 0) return [envelope.eventId]
    if (ids.length === 1) return [ids[0]!, envelope.eventId]
    if (ids[ids.length - 1] === envelope.eventId) return ids
    return [ids[0]!, envelope.eventId]
  }

  return capSourceEventIds([...ids, envelope.eventId])
}

function freezeState(state: MutableState): ProjectionState {
  return {
    readModel: state.readModel,
    seenEventIds: state.seenEventIds,
    hasStepBoundaries: state.hasStepBoundaries,
    activeStepId: state.activeStepId,
    workAnchorAt: state.workAnchorAt,
  }
}


/**
 * Remember when the current working stretch began. Local sidecars deliver
 * reasoning as a near-instant burst after the model finished thinking, so
 * the wall-clock "thinking" time lives in the gap after the previous
 * user-visible boundary (turn start / user answer / approval / prose end).
 */
function setWorkAnchor(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): void {
  const time = envelopeTime(envelope)
  if (time) state.workAnchorAt = time
}

/**
 * Consume the pending work anchor for the first working row of a stretch.
 * Returns the earlier of anchor and envelope time; the anchor is cleared so
 * later rows in the same stretch use their own real timestamps.
 */
function takeWorkAnchor(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): string | undefined {
  const anchor = state.workAnchorAt
  state.workAnchorAt = undefined
  const now = envelopeTime(envelope)
  if (!anchor) return now
  if (!now) return anchor
  const anchorMs = Date.parse(anchor)
  const nowMs = Date.parse(now)
  if (!Number.isFinite(anchorMs) || !Number.isFinite(nowMs)) return now
  return anchorMs < nowMs ? anchor : now
}

function markStepBoundary(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  stepId?: string | null,
): void {
  state.hasStepBoundaries = true
  if (stepId) state.activeStepId = stepId
  sealOpenAssistant(state, envelope)
}

function withActiveStep(
  state: MutableState,
  category: TimelineItemCategory,
  meta: TimelineItemMeta | undefined,
): TimelineItemMeta | undefined {
  if (!state.activeStepId || !WORKING_STEP_CATEGORIES.has(category)) {
    return meta
  }
  if (meta?.stepId) return meta
  return mergeMeta(meta, { stepId: state.activeStepId })
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
  const ids = nextSourceEventIds(item, envelope)
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

const SOFT_GENERIC_LIVE_STATUS = new Set(['正在思考', '正在生成回复…'])

function setLiveStatus(
  state: MutableState,
  liveStatus: string | null,
  kind: LiveStatusKind = 'generic',
): void {
  if (liveStatus == null) {
    if (state.readModel.liveStatus === null && state.readModel.liveStatusKind == null) {
      return
    }
    state.readModel = {
      ...state.readModel,
      liveStatus: null,
      liveStatusKind: null,
    }
    return
  }
  if (
    kind === 'generic' &&
    state.readModel.liveStatusKind === 'tool' &&
    SOFT_GENERIC_LIVE_STATUS.has(liveStatus)
  ) {
    return
  }
  if (
    state.readModel.liveStatus === liveStatus &&
    state.readModel.liveStatusKind === kind
  ) {
    return
  }
  state.readModel = { ...state.readModel, liveStatus, liveStatusKind: kind }
}

function setTurnStatus(
  state: MutableState,
  status: TurnStatus | null,
  envelope: AgentRuntimeEventEnvelope,
): void {
  state.readModel = {
    ...state.readModel,
    turnStatus: status,
    activeTurnId: (envelope.turnId as TurnId | undefined) ?? state.readModel.activeTurnId,
  }
  if (status != null && (isTerminalTurnStatus(status) || status === 'interrupted')) {
    state.readModel = {
      ...state.readModel,
      liveStatus: null,
      liveStatusKind: null,
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

function ensureInlineUserResponse(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  requestId: string,
  answer: ReturnType<typeof parseQuestionAnswer>,
  fallbackText: string,
): void {
  const card = state.readModel.timeline.find(
    (item) => item.category === 'input-request' && item.id === `input-request:${requestId}`,
  )
  const body = answer
    ? questionAnswerToInputText(answer, card?.meta?.question?.options ?? [])
    : fallbackText.trim()
  if (!body) return
  const id = `user:inline:${requestId}`
  const existingIdx = findIndex(
    state.readModel.timeline,
    (item) => item.id === id,
  )
  if (existingIdx >= 0) {
    const updated = touchItem(
      state.readModel.timeline[existingIdx]!,
      envelope,
      state.readModel.projectionVersion,
    )
    replaceItem(state, existingIdx, {
      ...updated,
      body,
      meta: mergeMeta(updated.meta, { inlineResponse: true }),
    })
    return
  }
  pushItem(
    state,
    baseItem(state, envelope, {
      id,
      category: 'user-message',
      body,
      meta: { inlineResponse: true },
    }),
  )
}

function ensureTurnTerminal(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  status: TurnStatus,
  title: string,
  metaPatch?: TimelineItemMeta,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const version = state.readModel.projectionVersion
  const match = (item: TimelineItem) =>
    item.category === 'turn-terminal' &&
    (turnId ? item.turnId === turnId : item.id === `turn-terminal:${envelope.eventId}`)

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
      id: `turn-terminal:${turnId ?? envelope.eventId}`,
      category: 'turn-terminal',
      title,
      status,
      turnId,
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
    category === 'artifact' ||
    category === 'input-request' ||
    category === 'user-message' ||
    category === 'error' ||
    category === 'warning'
  )
}

function envelopeTime(envelope: AgentRuntimeEventEnvelope): string | undefined {
  return typeof envelope.occurredAt === 'string' ? envelope.occurredAt : undefined
}

/**
 * Append assistant text. Opens a new segment after tools / questions / cards.
 * Projection never writes `commentary` — all assistant text is first-class prose.
 */
function appendAssistantDelta(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  delta: string,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const version = state.readModel.projectionVersion
  const timeline = state.readModel.timeline
  const useHeuristic = !state.hasStepBoundaries

  let openIdx = -1
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]!
    if (turnId && item.turnId && item.turnId !== turnId) continue
    if (item.category !== 'assistant-message') {
      if (useHeuristic && isProcessBreakingCategory(item.category)) break
      continue
    }
    // text-end/output.completed seals a segment. A later text-delta is a new
    // narrative segment even when no tool row appears between them.
    if (item.status === 'completed') break
    if (useHeuristic) {
      const brokenAfter = timeline
        .slice(i + 1)
        .some(
          (x) =>
            (!turnId || !x.turnId || x.turnId === turnId) &&
            isProcessBreakingCategory(x.category),
        )
      if (!brokenAfter) openIdx = i
    } else {
      openIdx = i
    }
    break
  }

  if (openIdx >= 0) {
    const base = touchItem(timeline[openIdx]!, envelope, version)
    replaceItem(state, openIdx, {
      ...base,
      body: `${base.body ?? ''}${delta}`,
      status: 'streaming',
    })
    return
  }

  const seg = timeline.filter(
    (i) =>
      i.category === 'assistant-message' &&
      (!turnId || i.turnId === turnId),
  ).length

  pushItem(
    state,
    baseItem(state, envelope, {
      id: `assistant:${turnId ?? envelope.eventId}:${seg}`,
      category: 'assistant-message',
      body: delta,
      status: 'streaming',
      turnId,
    }),
  )
}

function finalizeAssistant(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  finalText: string | null,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const version = state.readModel.projectionVersion
  let idx = -1
  for (let i = state.readModel.timeline.length - 1; i >= 0; i--) {
    const item = state.readModel.timeline[i]!
    if (item.category !== 'assistant-message') continue
    if (turnId && item.turnId && item.turnId !== turnId) continue
    idx = i
    break
  }
  if (idx >= 0) {
    const base = touchItem(state.readModel.timeline[idx]!, envelope, version)
    replaceItem(state, idx, {
      ...base,
      body: finalText && finalText.length > 0 ? finalText : base.body,
      status: 'completed',
    })
    return
  }
  if (finalText && finalText.length > 0) {
    pushItem(
      state,
      baseItem(state, envelope, {
        id: `assistant:${turnId ?? envelope.eventId}:0`,
        category: 'assistant-message',
        body: finalText,
        status: 'completed',
        turnId,
      }),
    )
  }
}

/** Seal the open assistant segment so the next delta starts a new one. */
function sealOpenAssistant(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const version = state.readModel.projectionVersion
  for (let i = state.readModel.timeline.length - 1; i >= 0; i--) {
    const item = state.readModel.timeline[i]!
    if (item.category !== 'assistant-message') continue
    if (turnId && item.turnId && item.turnId !== turnId) continue
    if (item.status === 'completed') return
    replaceItem(state, i, {
      ...touchItem(item, envelope, version),
      status: 'completed',
    })
    return
  }
}

function asUsageCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function parseUsage(payload: unknown): TokenUsage | null {
  const rec = asRecord(payload)
  const nested =
    rec.usage != null && typeof rec.usage === 'object' && !Array.isArray(rec.usage)
      ? asRecord(rec.usage)
      : rec
  const inputTokens =
    asUsageCount(nested.inputTokens) ?? asUsageCount(nested.promptTokens)
  const outputTokens =
    asUsageCount(nested.outputTokens) ?? asUsageCount(nested.completionTokens)
  const totalTokens = asUsageCount(nested.totalTokens)
  if (inputTokens == null && outputTokens == null && totalTokens == null) {
    return null
  }
  return { inputTokens, outputTokens, totalTokens }
}

function applyUsage(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  usage: TokenUsage | null,
): void {
  if (!usage) return
  state.readModel = { ...state.readModel, usage }
  const turnId = envelope.turnId as TurnId | undefined
  const idx = findIndex(
    state.readModel.timeline,
    (item) =>
      item.category === 'turn-terminal' &&
      (turnId ? item.turnId === turnId : true),
  )
  if (idx < 0) return
  const terminal = state.readModel.timeline[idx]!
  replaceItem(state, idx, {
    ...terminal,
    meta: mergeMeta(terminal.meta, { usage }),
  })
}

function parseChangeKind(value: unknown): FileChangeKind | undefined {
  if (value === 'created' || value === 'updated' || value === 'deleted') {
    return value
  }
  return undefined
}

function collectTurnDeliverables(
  state: MutableState,
  turnId: TurnId | undefined,
): DeliverableRef[] {
  const byPath = new Map<string, DeliverableRef>()
  for (const item of state.readModel.timeline) {
    if (turnId && item.turnId && item.turnId !== turnId) continue
    if (item.category === 'file-change') {
      const path = item.meta?.path ?? item.title
      if (!path) continue
      const prev = byPath.get(path)
      byPath.set(path, {
        path,
        title: prev?.title ?? item.title ?? path,
        kind: prev?.kind,
        changeKind: item.meta?.changeKind ?? prev?.changeKind,
        source: prev?.source ?? 'file',
        additions: item.meta?.additions ?? prev?.additions,
        deletions: item.meta?.deletions ?? prev?.deletions,
      })
      continue
    }
    if (item.category === 'artifact') {
      const path = item.meta?.path ?? item.title
      if (!path) continue
      const prev = byPath.get(path)
      byPath.set(path, {
        path,
        title: item.title ?? prev?.title ?? path,
        kind: item.meta?.kind ?? prev?.kind,
        changeKind: prev?.changeKind ?? item.meta?.changeKind,
        source: 'artifact',
        additions: prev?.additions,
        deletions: prev?.deletions,
      })
    }
  }
  return [...byPath.values()]
}

function attachTurnDeliverables(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const deliverables = collectTurnDeliverables(state, turnId)
  state.readModel = { ...state.readModel, deliverables }
  if (deliverables.length === 0) return
  const idx = findIndex(
    state.readModel.timeline,
    (item) =>
      item.category === 'turn-terminal' &&
      (turnId ? item.turnId === turnId : true),
  )
  if (idx < 0) return
  const terminal = state.readModel.timeline[idx]!
  replaceItem(state, idx, {
    ...terminal,
    meta: mergeMeta(terminal.meta, { deliverables }),
  })
}

/** Mark this run's assistant segments completed. Does not write commentary. */
function completeAssistantsOnTurnComplete(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  state.readModel.timeline.forEach((item, i) => {
    if (item.category !== 'assistant-message') return
    if (turnId && item.turnId && item.turnId !== turnId) return
    if (item.status === 'completed' && item.meta?.messageRole !== 'commentary') {
      return
    }
    const nextMeta = { ...item.meta }
    delete nextMeta.messageRole
    replaceItem(state, i, {
      ...item,
      status: 'completed',
      meta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
    })
  })
}

function lastReasoningIndex(state: MutableState, turnId: TurnId | undefined): number {
  return findIndex(
    state.readModel.timeline,
    (item) =>
      item.category === 'reasoning-section' &&
      (!turnId || item.turnId === turnId),
  )
}

function reasoningHasInterveningItems(
  state: MutableState,
  reasoningIdx: number,
  turnId: TurnId | undefined,
): boolean {
  return state.readModel.timeline.slice(reasoningIdx + 1).some(
    (item) =>
      (!turnId || !item.turnId || item.turnId === turnId) &&
      item.category !== 'reasoning-section',
  )
}

function openReasoningSection(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  delta: string | null,
  title?: string | null,
  completed = false,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const seq =
    state.readModel.timeline.filter(
      (item) =>
        item.category === 'reasoning-section' &&
        (!turnId || item.turnId === turnId),
    ).length + 1
  pushItem(
    state,
    baseItem(state, envelope, {
      id: `reasoning:${turnId ?? 'turn'}:${seq}`,
      category: 'reasoning-section',
      title: title || '思考过程',
      body: delta ?? '',
      status: completed ? 'completed' : 'streaming',
      turnId,
      meta: withActiveStep(state, 'reasoning-section', {
        startedAt: takeWorkAnchor(state, envelope),
        endedAt: completed ? envelopeTime(envelope) : undefined,
      }),
    }),
  )
}

function patchReasoningSection(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  idx: number,
  delta: string | null,
  title?: string | null,
  completed = false,
): void {
  const version = state.readModel.projectionVersion
  const base = touchItem(state.readModel.timeline[idx]!, envelope, version)
  replaceItem(state, idx, {
    ...base,
    title: title || base.title || '思考过程',
    body: delta ? `${base.body ?? ''}${delta}` : base.body,
    status: completed ? 'completed' : 'streaming',
    meta: mergeMeta(base.meta, {
      endedAt: completed ? envelopeTime(envelope) : base.meta?.endedAt,
    }),
  })
}

function ensureReasoning(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  delta: string | null,
  title?: string | null,
  completed = false,
  openNew = false,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  if (openNew) {
    openReasoningSection(state, envelope, delta, title, completed)
    return
  }
  const idx = lastReasoningIndex(state, turnId)
  const canReuse =
    idx >= 0 &&
    !reasoningHasInterveningItems(state, idx, turnId) &&
    state.readModel.timeline[idx]?.status !== 'completed'
  if (canReuse) {
    patchReasoningSection(state, envelope, idx, delta, title, completed)
    return
  }
  if (completed && idx >= 0 && !reasoningHasInterveningItems(state, idx, turnId)) {
    patchReasoningSection(state, envelope, idx, delta, title, true)
    return
  }
  if (delta || !completed) {
    openReasoningSection(state, envelope, delta, title, completed)
  }
}

function syncProcessSummary(
  state: MutableState,
  turnId: TurnId | undefined,
): void {
  const terminalIdx = findIndex(
    state.readModel.timeline,
    (item) =>
      item.category === 'turn-terminal' &&
      (!turnId || item.turnId === turnId),
  )
  if (terminalIdx < 0) return

  const steps = state.readModel.timeline.filter(
    (item) =>
      (!turnId || item.turnId === turnId) &&
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

type TimelineItemPatch = {
  title?: string
  body?: string
  status?: string
  meta?: TimelineItemMeta
}

/**
 * Whole-table replace for a keyed Timeline row.
 * Unlike {@link upsertByKey}, this overwrites body/meta instead of appending.
 */
function replaceByKey(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  category: TimelineItemCategory,
  key: string,
  patch: TimelineItemPatch,
): void {
  const version = state.readModel.projectionVersion
  const id = `${category}:${key}`
  const idx = findIndex(
    state.readModel.timeline,
    (item) => item.category === category && item.id === id,
  )
  if (idx >= 0) {
    const base = touchItem(state.readModel.timeline[idx]!, envelope, version)
    replaceItem(state, idx, { ...base, ...patch })
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
      meta: withActiveStep(state, category, patch.meta),
    }),
  )
}

function upsertByKey(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  category: TimelineItemCategory,
  key: string,
  patch: TimelineItemPatch,
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
      meta: withActiveStep(state, category, patch.meta),
    }),
  )
}

function pushError(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
  message: string,
): void {
  const turnId = envelope.turnId as TurnId | undefined
  const idx = findIndex(
    state.readModel.timeline,
    (item) => item.category === 'error' && item.turnId === turnId,
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
      id: `error:${turnId ?? envelope.eventId}`,
      category: 'error',
      title: '运行失败',
      body: message,
      status: 'failed',
      turnId,
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
 * turn-terminal meta.startedAt (legacy: meta.path `startedAt:ISO`).
 */
function computeTurnDurationMs(
  state: MutableState,
  envelope: AgentRuntimeEventEnvelope,
): number | null {
  const rec = asRecord(envelope.payload)
  if (typeof rec.durationMs === 'number' && Number.isFinite(rec.durationMs)) {
    return Math.max(0, rec.durationMs)
  }
  const turnId = envelope.turnId as TurnId | undefined
  const terminal = state.readModel.timeline.find(
    (item) =>
      item.category === 'turn-terminal' &&
      (turnId ? item.turnId === turnId : true),
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
    case 'turn.started': {
      const text = payloadText(envelope.payload, ['inputText', 'text'])
      if (text) ensureUserMessage(next, envelope, text)
      setTurnStatus(next, 'running', envelope)
      const startedAt =
        typeof envelope.occurredAt === 'string' ? envelope.occurredAt : null
      ensureTurnTerminal(next, envelope, 'running', '正在思考', {
        startedAt: startedAt ?? undefined,
        path: startedAt ? `startedAt:${startedAt}` : undefined,
      })
      setLiveStatus(next, '正在思考')
      setWorkAnchor(next, envelope)
      break
    }
    case 'message.delta': {
      const delta = payloadText(envelope.payload, ['text', 'delta']) ?? ''
      if (delta) appendAssistantDelta(next, envelope, delta)
      if (next.readModel.turnStatus === 'running') {
        setLiveStatus(next, '正在生成回复…', 'generic')
      }
      break
    }
    case 'message.completed': {
      const text = payloadText(envelope.payload, ['text'])
      finalizeAssistant(next, envelope, text)
      setWorkAnchor(next, envelope)
      break
    }
    case 'message.started': {
      markStepBoundary(next, envelope)
      break
    }
    case 'step.started': {
      markStepBoundary(
        next,
        envelope,
        payloadString(envelope.payload, 'stepId') ?? payloadString(envelope.payload, 'id'),
      )
      break
    }
    case 'step.completed': {
      markStepBoundary(
        next,
        envelope,
        payloadString(envelope.payload, 'stepId') ??
          payloadString(envelope.payload, 'id') ??
          next.activeStepId,
      )
      break
    }
    case 'turn.completed': {
      completeAssistantsOnTurnComplete(next, envelope)
      setTurnStatus(next, 'completed', envelope)
      const durationMs = computeTurnDurationMs(next, envelope)
      const usage = parseUsage(envelope.payload)
      ensureTurnTerminal(next, envelope, 'completed', '已处理', {
        durationMs: durationMs ?? undefined,
        usage: usage ?? undefined,
      })
      if (usage) next.readModel = { ...next.readModel, usage }
      attachTurnDeliverables(next, envelope)
      break
    }
    case 'turn.cancel_requested': {
      setTurnStatus(next, 'cancelling', envelope)
      ensureTurnTerminal(next, envelope, 'cancelling', '取消中')
      setLiveStatus(next, '取消中')
      break
    }
    case 'turn.cancelled': {
      setTurnStatus(next, 'cancelled', envelope)
      const durationMs = computeTurnDurationMs(next, envelope)
      ensureTurnTerminal(next, envelope, 'cancelled', '已取消', {
        durationMs: durationMs ?? undefined,
      })
      break
    }
    case 'turn.failed': {
      setTurnStatus(next, 'failed', envelope)
      const durationMs = computeTurnDurationMs(next, envelope)
      ensureTurnTerminal(next, envelope, 'failed', '失败', {
        durationMs: durationMs ?? undefined,
      })
      const message =
        payloadString(envelope.payload, 'message') ??
        payloadString(envelope.payload, 'reasonCode') ??
        '运行失败'
      pushError(next, envelope, message)
      break
    }
    case 'reasoning.started': {
      ensureReasoning(
        next,
        envelope,
        null,
        payloadString(envelope.payload, 'title') ?? '思考过程',
        false,
        true,
      )
      setLiveStatus(next, '正在思考', 'generic')
      break
    }
    case 'reasoning.delta': {
      const delta = payloadText(envelope.payload, ['text', 'delta']) ?? ''
      ensureReasoning(next, envelope, delta, null, false, false)
      setLiveStatus(next, '正在思考', 'generic')
      break
    }
    case 'reasoning.completed': {
      ensureReasoning(
        next,
        envelope,
        null,
        payloadString(envelope.payload, 'summary') ??
          payloadString(envelope.payload, 'title'),
        true,
        false,
      )
      break
    }
    case 'plan.updated': {
      const snapshot = parsePlanSnapshot(envelope.payload)
      next.readModel = { ...next.readModel, plan: snapshot }
      replaceByKey(
        next,
        envelope,
        'plan-update',
        String(envelope.turnId ?? envelope.eventId),
        {
          title: '计划已更新',
          body: snapshot.explanation,
          status: 'updated',
          meta: {
            plan: {
              explanation: snapshot.explanation,
              steps: snapshot.steps,
            },
          },
        },
      )
      setLiveStatus(next, '正在更新计划…', 'tool')
      break
    }
    case 'tool.started': {
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
          startedAt: takeWorkAnchor(next, envelope),
        },
      })
      syncProcessSummary(next, envelope.turnId as TurnId | undefined)
      setLiveStatus(next, liveStatusForToolActivity(activity), 'tool')
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
      syncProcessSummary(next, envelope.turnId as TurnId | undefined)
      setLiveStatus(next, liveStatusForToolActivity(activity), 'tool')
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
          endedAt: envelopeTime(envelope),
        },
      })
      syncProcessSummary(next, envelope.turnId as TurnId | undefined)
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
        meta: {
          toolKind: 'command',
          processKind: 'command',
          startedAt: takeWorkAnchor(next, envelope),
        },
      })
      syncProcessSummary(next, envelope.turnId as TurnId | undefined)
      setLiveStatus(
        next,
        liveStatusForToolActivity({
          name: 'run_command',
          args: { command: commandLine },
        }),
        'tool',
      )
      break
    }
    case 'command.delta': {
      const commandId = payloadString(envelope.payload, 'commandId') ?? envelope.eventId
      const text = payloadText(envelope.payload, ['text', 'output']) ?? ''
      upsertByKey(next, envelope, 'command-execution', commandId, {
        body: text,
        status: 'running',
      })
      syncProcessSummary(next, envelope.turnId as TurnId | undefined)
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
        meta: {
          toolKind: 'command',
          processKind: 'command',
          endedAt: envelopeTime(envelope),
        },
      })
      syncProcessSummary(next, envelope.turnId as TurnId | undefined)
      break
    }
    case 'file.changed': {
      const path = payloadString(envelope.payload, 'path') ?? 'file'
      const summary = payloadString(envelope.payload, 'summary') ?? ''
      const changeKind = parseChangeKind(rec.changeKind)
      const additions =
        changeKind === 'deleted'
          ? undefined
          : typeof rec.additions === 'number'
            ? rec.additions
            : undefined
      const deletions =
        changeKind === 'deleted'
          ? undefined
          : typeof rec.deletions === 'number'
            ? rec.deletions
            : undefined
      const diffLines = parseDiffLines(rec.diffLines)
      const children = parseChildren(rec.children ?? rec.items)
      pushItem(
        next,
        baseItem(next, envelope, {
          id: `file-change:${envelope.eventId}`,
          category: 'file-change',
          title: path,
          body: summary,
          status: changeKind === 'deleted' ? 'deleted' : 'changed',
          meta: {
            path,
            changeKind,
            additions,
            deletions,
            diffLines,
            children,
          },
        }),
      )
      setLiveStatus(
        next,
        changeKind === 'deleted' ? '正在删除文件…' : '正在写入结果…',
        'tool',
      )
      break
    }
    case 'artifact.created':
    case 'artifact.updated':
    case 'artifact.linked': {
      const path =
        payloadString(envelope.payload, 'path') ??
        payloadString(envelope.payload, 'uri') ??
        'artifact'
      const kind = payloadString(envelope.payload, 'kind') ?? undefined
      const title =
        payloadString(envelope.payload, 'title') ??
        payloadString(envelope.payload, 'name') ??
        path
      const changeKind =
        parseChangeKind(rec.changeKind) ??
        (type === 'artifact.created'
          ? 'created'
          : type === 'artifact.updated'
            ? 'updated'
            : undefined)
      upsertByKey(next, envelope, 'artifact', path, {
        title,
        status: type === 'artifact.linked' ? 'linked' : changeKind ?? 'created',
        meta: {
          path,
          kind,
          title,
          changeKind,
        },
      })
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
      setTurnStatus(next, 'waiting_for_approval', envelope)
      ensureTurnTerminal(next, envelope, 'waiting_for_approval', '等待审批')
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
        setTurnStatus(next, 'running', envelope)
        ensureTurnTerminal(next, envelope, 'running', '正在思考')
        setLiveStatus(next, '正在思考')
        setWorkAnchor(next, envelope)
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
    case 'input.requested': {
      const requestId = payloadString(envelope.payload, 'requestId') ?? envelope.eventId
      const structured = parseQuestionRequest(envelope.payload, requestId)
      const prompt = payloadString(envelope.payload, 'prompt') ?? '请补充输入'
      setTurnStatus(next, 'waiting_for_input', envelope)
      ensureTurnTerminal(next, envelope, 'waiting_for_input', '等待输入')
      setLiveStatus(next, '等待输入')
      upsertByKey(next, envelope, 'input-request', requestId, {
        title: structured?.question ?? '需要补充信息',
        body: structured ? undefined : prompt,
        status: 'waiting',
        meta: structured ? { question: structured } : undefined,
      })
      break
    }
    case 'input.provided': {
      const requestId = payloadString(envelope.payload, 'requestId') ?? envelope.eventId
      const provided = asRecord(envelope.payload)
      const answer = parseQuestionAnswer(provided.answer)
      const text = payloadText(envelope.payload, ['text', 'inputText']) ?? ''
      setTurnStatus(next, 'running', envelope)
      ensureTurnTerminal(next, envelope, 'running', '正在思考')
      setLiveStatus(next, '正在思考', 'generic')
      setWorkAnchor(next, envelope)
      upsertByKey(next, envelope, 'input-request', requestId, {
        status: 'provided',
        body: text ? `\n已提供：${text}` : undefined,
        meta: answer ? { answer } : undefined,
      })
      ensureInlineUserResponse(next, envelope, requestId, answer, text)
      break
    }
    case 'task.archived': {
      next.readModel = { ...next.readModel, archived: true }
      break
    }
    case 'usage.updated': {
      applyUsage(next, envelope, parseUsage(envelope.payload))
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
