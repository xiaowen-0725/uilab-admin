/**
 * Codex-inspired stream test helpers (sdk/typescript runStreamed + core suite style).
 *
 * Patterns borrowed (not copied code):
 * - collect events from a subscription / generator
 * - assert full type sequence with toEqual
 * - assert subsequence order (wait_for_event chain)
 * - concat deltas and compare to final text
 */

import type {
  AgentRuntimeEventEnvelope,
  RuntimePort,
  RuntimeSubscriptionEvent,
} from '@/modules/task'

/** Collect envelopes from RuntimePort.subscribe (like draining a streamed iterator). */
export function collectEnvelopes(
  runtime: RuntimePort,
  taskId: string,
  cursor: number | string = 0,
): {
  envelopes: AgentRuntimeEventEnvelope[]
  unsubscribe: () => void
} {
  const envelopes: AgentRuntimeEventEnvelope[] = []
  const unsubscribe = runtime.subscribe(taskId, cursor, (ev: RuntimeSubscriptionEvent) => {
    if (ev.kind === 'event') envelopes.push(ev.envelope)
  })
  return { envelopes, unsubscribe }
}

export function eventTypes(
  envelopes: readonly AgentRuntimeEventEnvelope[],
): string[] {
  return envelopes.map((e) => String(e.eventType))
}

/**
 * Assert that `required` appears in order inside `actual` (other events may interleave).
 * Analogous to sequential wait_for_event_match calls.
 */
export function assertTypesInOrder(
  actual: readonly string[],
  required: readonly string[],
): void {
  let from = 0
  for (const type of required) {
    const idx = actual.indexOf(type, from)
    if (idx < 0) {
      throw new Error(
        `Expected event type "${type}" after index ${from}.\nActual: ${actual.join(' → ')}`,
      )
    }
    from = idx + 1
  }
}

/** First envelope of a given type (wait_for_event_match style). */
export function findEnvelope(
  envelopes: readonly AgentRuntimeEventEnvelope[],
  eventType: string,
): AgentRuntimeEventEnvelope | undefined {
  return envelopes.find((e) => String(e.eventType) === eventType)
}

/** All payload.text / payload.delta strings for message.delta (streamed answer). */
export function collectOutputDeltaTexts(
  envelopes: readonly AgentRuntimeEventEnvelope[],
): string[] {
  const out: string[] = []
  for (const e of envelopes) {
    if (String(e.eventType) !== 'message.delta') continue
    const p = e.payload
    if (p && typeof p === 'object') {
      const rec = p as Record<string, unknown>
      const text = rec.text ?? rec.delta
      if (typeof text === 'string') out.push(text)
    }
  }
  return out
}

export function payloadText(envelope: AgentRuntimeEventEnvelope | undefined): string | null {
  if (!envelope) return null
  const p = envelope.payload
  if (!p || typeof p !== 'object') return null
  const rec = p as Record<string, unknown>
  for (const key of ['text', 'inputText', 'delta', 'markdown', 'summary']) {
    if (typeof rec[key] === 'string') return rec[key] as string
  }
  return null
}
