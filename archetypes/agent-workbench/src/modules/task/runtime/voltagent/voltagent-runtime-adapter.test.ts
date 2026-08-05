import { describe, expect, it, vi } from 'vitest'
import type { RuntimeSubscriptionEvent } from '../../ports/runtime-port'
import { createVoltAgentRuntimeAdapter } from './voltagent-runtime-adapter'

function sseBody(chunks: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const lines = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines))
      controller.close()
    },
  })
}

function collectEvents(
  adapter: ReturnType<typeof createVoltAgentRuntimeAdapter>,
  taskId: string,
): RuntimeSubscriptionEvent[] {
  const events: RuntimeSubscriptionEvent[] = []
  adapter.subscribe(taskId, null, (e) => events.push(e))
  return events
}

describe('VoltAgentRuntimeAdapter', () => {
  it('submitTurn streams mapped envelopes via RuntimePort', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        sseBody([
          { type: 'text-delta', delta: 'Hello' },
          { type: 'text-delta', delta: ' world' },
          { type: 'finish', finishReason: 'stop' },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    })

    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowIso: () => '2026-08-05T12:00:00.000Z',
    })

    const events = collectEvents(adapter, 'task-rt')
    const ack = await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-1',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-1',
      schemaVersion: 1,
      taskId: 'task-rt',
      inputText: '你好',
      proposedTurnId: 'turn-1',
      proposedRunId: 'run-1',
    })

    expect(ack.status).toBe('accepted')
    // Allow stream microtasks
    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('output.delta')
      expect(types).toContain('run.completed')
    })

    expect(fetchImpl).toHaveBeenCalled()
    const caps = await adapter.getCapabilities('proj', 'local')
    expect(caps.features.cancel).toBe(true)
    expect(caps.features.steer).toBe(false)
  })

  it('cancelRun aborts and emits cancelled', async () => {
    let resolveRead: (() => void) | undefined
    const hangStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // never closes until abort
        resolveRead = () => {
          try {
            controller.close()
          } catch {
            /* ignore */
          }
        }
      },
      cancel() {
        resolveRead?.()
      },
    })

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal
      if (signal) {
        signal.addEventListener('abort', () => resolveRead?.())
      }
      return new Response(hangStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })

    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowIso: () => '2026-08-05T12:00:00.000Z',
    })
    const events = collectEvents(adapter, 'task-c')

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-s',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-s',
      schemaVersion: 1,
      taskId: 'task-c',
      inputText: 'long',
      proposedTurnId: 'turn-c',
      proposedRunId: 'run-c',
    })

    const cancelAck = await adapter.sendCommand({
      type: 'cancelRun',
      commandId: 'cmd-x',
      issuedAt: '2026-08-05T12:00:01.000Z',
      actor: 'user',
      idempotencyKey: 'idem-x',
      schemaVersion: 1,
      taskId: 'task-c',
      runId: 'run-c',
    })
    expect(cancelAck.status).toBe('accepted')

    const types = events
      .filter((e) => e.kind === 'event')
      .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
    expect(types).toContain('run.cancelled')
  })

  it('HTTP error emits run.failed', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }))
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowIso: () => '2026-08-05T12:00:00.000Z',
    })
    const events = collectEvents(adapter, 'task-e')
    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-e',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-e',
      schemaVersion: 1,
      taskId: 'task-e',
      inputText: 'hi',
      proposedRunId: 'run-e',
      proposedTurnId: 'turn-e',
    })
    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('run.failed')
    })
  })

  it('steer is unsupported', async () => {
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })
    const ack = await adapter.sendCommand({
      type: 'steerRun',
      commandId: 'cmd-st',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-st',
      schemaVersion: 1,
      taskId: 'task-1',
      runId: 'run-1',
      inputText: 'nudge',
    })
    expect(ack.status).toBe('unsupported')
  })
})
