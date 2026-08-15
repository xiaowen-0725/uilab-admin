/**
 * Capture-driven task event stream (fixture / replay only — not a live Runtime).
 * `foldCaptureToView` remains for capture JSON unit tests.
 * UI replay goes through `captureToEnvelopes` → projection → Timeline.
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
  /**
   * Codex-like intermediate status (capture path).
   * Derived while turn is running; null when completed/error.
   */
  liveStatus: string | null
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
 * - `untilEventId`: stop after that event (inclusive)
 * - `untilTs`: include events with `ts <= untilTs` (progressive time-based replay)
 */
export function foldCaptureToView(
  capture: EventStreamCapture,
  options?: { untilEventId?: string; untilTs?: number }
): StreamViewModel {
  const events = takeEvents(capture.events, options)

  const userMessages: StreamViewModel['userMessages'] = []
  let status: TurnStatusKind = 'running'
  let statusLabel = '正在思考'
  let durationMs: number | undefined
  const toolById = new Map<string, ToolRowView>()
  const toolOrder: string[] = []
  const markdownParts: string[] = []

  let liveStatus: string | null = null

  for (const event of events) {
    switch (event.type) {
      case 'user_message':
        userMessages.push({ id: event.id, text: event.text })
        break
      case 'turn_status':
        status = event.status
        statusLabel = event.label
        if (event.durationMs !== undefined) durationMs = event.durationMs
        if (event.status === 'running') {
          // Early chrome prefers 正在思考 when label is generic 处理中.
          liveStatus =
            event.label === '处理中' || event.label === '正在思考'
              ? '正在思考'
              : event.label
          if (event.label === '处理中') statusLabel = '正在思考'
        } else if (event.status === 'completed' || event.status === 'error') {
          liveStatus = null
        }
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
        if (event.status === 'running' && status === 'running') {
          liveStatus = deriveLiveStatusFromTool(event)
        }
        break
      }
      case 'assistant_message':
        markdownParts.push(event.markdown)
        if (status === 'running') {
          liveStatus = '正在生成回复…'
        }
        break
    }
  }

  if (status === 'completed' || status === 'error') {
    liveStatus = null
  } else if (status === 'running' && liveStatus == null) {
    liveStatus = '正在思考'
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
    liveStatus,
  }
}

function deriveLiveStatusFromTool(event: ToolActivityEvent): string {
  if (event.toolKind === 'web_search') return '正在搜索网页…'
  if (event.toolKind === 'read') return '正在读取文件…'
  if (event.toolKind === 'command') return '正在执行命令…'
  const label = event.label
  if (/写入|结果|write/.test(label)) return '正在写入结果…'
  if (/计划|plan/.test(label)) return '正在更新计划…'
  if (/子任务|等待/.test(label)) return '等待子任务完成'
  if (/搜索/.test(label)) return '正在搜索网页…'
  if (/读取|文件/.test(label)) return '正在读取文件…'
  if (/[\u4e00-\u9fff]/.test(label)) return label
  return '正在思考'
}

function takeEvents(
  events: StreamEvent[],
  options?: { untilEventId?: string; untilTs?: number },
): StreamEvent[] {
  let list = events
  if (options?.untilTs !== undefined) {
    list = list.filter((e) => e.ts <= options.untilTs!)
  }
  if (options?.untilEventId) {
    const index = list.findIndex((e) => e.id === options.untilEventId)
    if (index >= 0) list = list.slice(0, index + 1)
  }
  return list
}

/** Max event timestamp in a capture (for playback end). */
export function captureMaxTs(capture: EventStreamCapture): number {
  if (capture.events.length === 0) return 0
  return Math.max(...capture.events.map((e) => e.ts))
}
