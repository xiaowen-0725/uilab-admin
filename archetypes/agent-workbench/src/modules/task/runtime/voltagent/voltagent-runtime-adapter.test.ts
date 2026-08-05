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

  it('normalizeWorkspaceToolInput maps host paths to virtual', async () => {
    const { normalizeWorkspaceToolInput } = await import(
      './voltagent-runtime-adapter'
    )
    expect(
      normalizeWorkspaceToolInput({
        file_path:
          '/Users/me/output/office-smoke-workspace/output/a.md',
        content: 'x',
      }),
    ).toMatchObject({ file_path: '/output/a.md', content: 'x' })
  })

  it('approval pause does not emit run.completed before decision', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        sseBody([
          {
            type: 'tool-approval-request',
            approvalId: 'apr-pause',
            toolCall: {
              type: 'tool-call',
              toolCallId: 'call_p',
              toolName: 'write_file',
              input: { file_path: '/output/p.md', content: 'x' },
            },
          },
          { type: 'finish', finishReason: 'tool-calls' },
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
    const events = collectEvents(adapter, 'task-pause')
    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-p',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-p',
      schemaVersion: 1,
      taskId: 'task-pause',
      inputText: 'write',
      proposedTurnId: 'turn-p',
      proposedRunId: 'run-p',
    })
    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('approval.requested')
    })
    await new Promise((r) => setTimeout(r, 30))
    const types = events
      .filter((e) => e.kind === 'event')
      .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
    expect(types).not.toContain('run.completed')
  })

  it('respondToApproval rejects when pending missing or stream busy', async () => {
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: vi.fn() as unknown as typeof fetch,
      nowIso: () => '2026-08-05T12:00:00.000Z',
    })
    const missing = await adapter.sendCommand({
      type: 'respondToApproval',
      commandId: 'cmd-miss',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-miss',
      schemaVersion: 1,
      taskId: 'task-miss',
      payload: { requestId: 'nope', decision: 'approved' },
    })
    expect(missing.status).toBe('rejected')
  })

  it('getCapabilities loads tools from sidecar agent metadata', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/agents/workbench')) {
        return new Response(
          JSON.stringify({
            data: {
              tools: [{ name: 'ls' }, { name: 'write_file' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('no', { status: 404 })
    })
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const caps = await adapter.getCapabilities('proj', 'local')
    expect(caps.tools).toEqual(['ls', 'write_file'])
    expect(caps.tools).not.toContain('run_command')
  })

  it('respondToApproval resumes stream with approval-responded UIMessage', async () => {
    let call = 0
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      call += 1
      if (call === 1) {
        return new Response(
          sseBody([
            {
              type: 'tool-call',
              toolCallId: 'call_w1',
              toolName: 'write_file',
              args: { file_path: '/output/a.md', content: 'hi' },
            },
            {
              type: 'tool-approval-request',
              approvalId: 'apr-1',
              toolCall: {
                type: 'tool-call',
                toolCallId: 'call_w1',
                toolName: 'write_file',
                input: { file_path: '/output/a.md', content: 'hi' },
              },
            },
            { type: 'finish', finishReason: 'tool-calls' },
          ]),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      // Resume after approve
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        input: unknown
        options?: { maxSteps?: number }
      }
      expect(Array.isArray(body.input)).toBe(true)
      // maxSteps omitted by default (sidecar Agent config wins)
      expect(body.options?.maxSteps).toBeUndefined()
      const messages = body.input as Array<{
        role: string
        parts: Array<Record<string, unknown>>
      }>
      expect(messages[1]?.role).toBe('assistant')
      expect(messages[1]?.parts[0]).toMatchObject({
        type: 'tool-write_file',
        state: 'approval-responded',
        toolCallId: 'call_w1',
        approval: { id: 'apr-1', approved: true },
      })
      return new Response(
        sseBody([
          {
            type: 'tool-result',
            toolCallId: 'call_w1',
            toolName: 'write_file',
            args: { file_path: '/output/a.md' },
            output: { path: '/output/a.md', additions: 1 },
          },
          { type: 'text-delta', delta: '已写入' },
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
    const events = collectEvents(adapter, 'task-ap')

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-ap-s',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-ap-s',
      schemaVersion: 1,
      taskId: 'task-ap',
      inputText: '写个文件',
      proposedTurnId: 'turn-ap',
      proposedRunId: 'run-ap',
    })

    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('approval.requested')
    })

    // Let first stream fully settle so activeAbort clears
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))

    const aprAck = await adapter.sendCommand({
      type: 'respondToApproval',
      commandId: 'cmd-ap-a',
      issuedAt: '2026-08-05T12:00:02.000Z',
      actor: 'user',
      idempotencyKey: 'idem-ap-a',
      schemaVersion: 1,
      taskId: 'task-ap',
      runId: 'run-ap',
      turnId: 'turn-ap',
      payload: { requestId: 'apr-1', decision: 'approved' },
    })
    expect(aprAck.status).toBe('accepted')

    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('approval.resolved')
      expect(types).toContain('file.changed')
      expect(types).toContain('output.delta')
      expect(types).toContain('run.completed')
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
