/**
 * Capture-driven task event stream (fixture / replay only — not a live Runtime).
 * Pure fold: StreamEvent[] → TurnViewModel for unit tests and UI.
 */

export type StreamEventType =
  | 'user_message'
  | 'turn_status'
  | 'tool_activity'
  | 'assistant_message'

export type TurnStatusKind = 'running' | 'completed' | 'error'

export type ToolActivityStatus = 'running' | 'completed' | 'error'

export interface StreamEventBase {
  id: string
  type: StreamEventType
  /** Milliseconds from capture start (monotonic in the golden file). */
  ts: number
}

export interface UserMessageEvent extends StreamEventBase {
  type: 'user_message'
  text: string
}

export interface TurnStatusEvent extends StreamEventBase {
  type: 'turn_status'
  status: TurnStatusKind
  /** e.g. 处理中 / 已处理 */
  label: string
  durationMs?: number
}

export interface ToolActivityEvent extends StreamEventBase {
  type: 'tool_activity'
  toolKind: 'web_search' | 'read' | 'command' | 'generic'
  status: ToolActivityStatus
  label: string
  detail?: string
  /** Extra lines shown when the row is expanded (search results, etc.). */
  items?: string[]
}

export interface AssistantMessageEvent extends StreamEventBase {
  type: 'assistant_message'
  /** Markdown body (fixture honesty: static text, not streamed chunks). */
  markdown: string
}

export type StreamEvent =
  | UserMessageEvent
  | TurnStatusEvent
  | ToolActivityEvent
  | AssistantMessageEvent

export interface EventStreamCapture {
  id: string
  title: string
  /** Golden prompt text used to produce this capture. */
  prompt: string
  notes?: string
  events: StreamEvent[]
}

export interface ToolRowView {
  id: string
  toolKind: ToolActivityEvent['toolKind']
  status: ToolActivityStatus
  label: string
  detail?: string
  items: string[]
  /** Collapsed by default when completed with items. */
  defaultExpanded: boolean
}

export interface TurnViewModel {
  status: TurnStatusKind
  statusLabel: string
  /** e.g. "1m 18s" when completed with durationMs */
  durationLabel: string | null
  toolRows: ToolRowView[]
  markdownParts: string[]
}

export interface StreamViewModel {
  captureId: string
  userMessages: { id: string; text: string }[]
  turn: TurnViewModel
}

/** Format duration for Codex-like chips: "45s", "1m 18s". */
export function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '0s'
  const totalSec = Math.round(durationMs / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

/**
 * Fold a prefix of capture events into a view model.
 * Pass `untilEventId` to stop after that event (inclusive) for intermediate snapshots.
 */
export function foldCaptureToView(
  capture: EventStreamCapture,
  options?: { untilEventId?: string }
): StreamViewModel {
  const events = takeEventsUntil(capture.events, options?.untilEventId)

  const userMessages: StreamViewModel['userMessages'] = []
  let status: TurnStatusKind = 'running'
  let statusLabel = '处理中'
  let durationMs: number | undefined
  const toolById = new Map<string, ToolRowView>()
  const toolOrder: string[] = []
  const markdownParts: string[] = []

  for (const event of events) {
    switch (event.type) {
      case 'user_message':
        userMessages.push({ id: event.id, text: event.text })
        break
      case 'turn_status':
        status = event.status
        statusLabel = event.label
        if (event.durationMs !== undefined) durationMs = event.durationMs
        break
      case 'tool_activity': {
        const row: ToolRowView = {
          id: event.id,
          toolKind: event.toolKind,
          status: event.status,
          label: event.label,
          detail: event.detail,
          items: event.items ?? [],
          defaultExpanded: event.status === 'running',
        }
        if (!toolById.has(event.id)) toolOrder.push(event.id)
        toolById.set(event.id, row)
        break
      }
      case 'assistant_message':
        markdownParts.push(event.markdown)
        break
    }
  }

  return {
    captureId: capture.id,
    userMessages,
    turn: {
      status,
      statusLabel,
      durationLabel:
        status === 'completed' && durationMs !== undefined
          ? formatDurationMs(durationMs)
          : null,
      toolRows: toolOrder.map((id) => toolById.get(id)!),
      markdownParts,
    },
  }
}

function takeEventsUntil(
  events: StreamEvent[],
  untilEventId?: string
): StreamEvent[] {
  if (!untilEventId) return events
  const index = events.findIndex((e) => e.id === untilEventId)
  if (index < 0) return events
  return events.slice(0, index + 1)
}
