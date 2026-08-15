/**
 * Capture JSON → AgentRuntimeEventEnvelope[] (test harness / explicit dev).
 * Product boot does not use this path.
 *
 * Path / changeKind helpers here only translate old capture fixtures that
 * stored Chinese tool labels. Timeline no longer guesses paths from labels.
 */

import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import type { EventStreamCapture, StreamEvent, ToolActivityEvent } from './stream-events'

export interface CaptureToEnvelopesOptions {
  projectId?: string
  taskId?: string
  untilTs?: number
  untilEventId?: string
}

function isLikelyPath(value: string): boolean {
  const text = value.trim()
  return (
    /^[\w./@-]+\.\w{1,10}$/.test(text) ||
    /^[\w./@-]+\/[\w./@-]+$/.test(text)
  )
}

function extractPathFromLabel(label: string): string | undefined {
  return label.match(/([\w./@-]+\.\w{1,10})/)?.[1]
}

function parsePlusMinus(detail?: string): {
  additions?: number
  deletions?: number
} {
  if (!detail) return {}
  const additions = detail.match(/\+(\d+)/)
  const deletions = detail.match(/-(\d+)/)
  return {
    additions: additions ? Number(additions[1]) : undefined,
    deletions: deletions ? Number(deletions[1]) : undefined,
  }
}

function extractWritePath(event: ToolActivityEvent): string | undefined {
  const fromItems = event.items?.find((item) => isLikelyPath(item))
  if (fromItems) return fromItems
  const detailHead = event.detail?.split(/\s+/)[0]
  if (detailHead && isLikelyPath(detailHead)) return detailHead
  return extractPathFromLabel(event.label)
}

function writeChangeKind(
  event: ToolActivityEvent,
): 'created' | 'updated' | 'deleted' | null {
  if (/已删除|delete/i.test(event.label)) return 'deleted'
  if (/已编辑|edit/i.test(event.label)) return 'updated'
  if (/已写入|write|\+\d+/.test(event.label) || /\+\d+/.test(event.detail ?? '')) {
    return 'created'
  }
  return null
}

function takeEvents(
  events: readonly StreamEvent[],
  options?: CaptureToEnvelopesOptions,
): StreamEvent[] {
  let list = [...events]
  if (options?.untilTs !== undefined) {
    list = list.filter((event) => event.ts <= options.untilTs!)
  }
  if (options?.untilEventId) {
    const index = list.findIndex((event) => event.id === options.untilEventId)
    if (index >= 0) list = list.slice(0, index + 1)
  }
  return list
}

function occurredAtFromTs(ts: number): string {
  return new Date(ts).toISOString()
}

/**
 * Map a capture prefix to the same envelope family the VoltAgent mapper emits.
 */
export function captureToEnvelopes(
  capture: EventStreamCapture,
  options?: CaptureToEnvelopesOptions,
): AgentRuntimeEventEnvelope[] {
  const projectId = options?.projectId ?? 'capture'
  const taskId = options?.taskId ?? capture.id
  const runId = `run:${capture.id}`
  const turnId = `turn:${capture.id}`
  const envelopes: AgentRuntimeEventEnvelope[] = []
  let seq = 1

  const push = (
    event: StreamEvent,
    eventType: string,
    payload: unknown,
    suffix: string = event.type,
  ): void => {
    const occurredAt = occurredAtFromTs(event.ts)
    envelopes.push({
      eventId: `cap:${capture.id}:${event.id}:${suffix}:${event.ts}`,
      eventType,
      schemaVersion: 1,
      projectId,
      taskId,
      turnId,
      runId,
      taskSequence: seq,
      occurredAt,
      receivedAt: occurredAt,
      payload,
    })
    seq += 1
  }

  for (const event of takeEvents(capture.events, options)) {
    switch (event.type) {
      case 'user_message':
        push(event, 'message.accepted', { text: event.text })
        break
      case 'turn_status':
        if (event.status === 'running') {
          push(event, 'run.started', { source: 'capture' })
        } else if (event.status === 'completed') {
          push(event, 'run.completed', {
            durationMs: event.durationMs,
          })
        } else {
          push(event, 'run.failed', { message: event.label })
        }
        break
      case 'tool_activity': {
        if (event.detail === 'reasoning') {
          if (event.status === 'running') {
            push(event, 'reasoning.started', { title: event.label }, 'reasoning-start')
          } else {
            push(event, 'reasoning.delta', { text: event.label }, 'reasoning-delta')
            push(event, 'reasoning.completed', { summary: event.label }, 'reasoning-end')
          }
          break
        }
        const toolId = event.id
        const name =
          event.toolKind === 'web_search'
            ? 'web_search'
            : event.toolKind === 'read'
              ? 'read_file'
              : event.toolKind === 'command'
                ? 'bash'
                : 'tool'
        if (event.toolKind === 'command') {
          if (event.status === 'running') {
            push(event, 'command.started', {
              commandId: toolId,
              toolId,
              name,
              command: event.detail ?? event.label,
              label: event.label,
            })
          } else {
            push(event, 'command.completed', {
              commandId: toolId,
              toolId,
              name,
              summary: event.detail,
              items: event.items,
              status: event.status === 'error' ? 'error' : 'completed',
              isError: event.status === 'error',
            })
          }
          break
        }
        if (event.status === 'running') {
          push(event, 'tool.called', {
            toolId,
            toolCallId: toolId,
            toolName: name,
            name,
            label: event.label,
            items: event.items,
          })
          break
        }
        push(event, 'tool.completed', {
          toolId,
          toolCallId: toolId,
          toolName: name,
          name,
          label: event.label,
          items: event.items,
          summary: event.detail,
          status: event.status === 'error' ? 'error' : 'completed',
          isError: event.status === 'error',
        })
        const changeKind = writeChangeKind(event)
        const path = extractWritePath(event)
        if (changeKind && path) {
          const counts = changeKind === 'deleted' ? {} : parsePlusMinus(event.detail)
          push(
            event,
            'file.changed',
            {
              path,
              changeKind,
              ...counts,
              toolCallId: toolId,
            },
            'file-changed',
          )
        }
        break
      }
      case 'assistant_message':
        push(event, 'output.delta', { text: event.markdown }, 'delta')
        push(event, 'output.completed', { text: event.markdown }, 'completed')
        break
    }
  }

  return envelopes
}
