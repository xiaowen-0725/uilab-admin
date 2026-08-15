import { describe, expect, it, vi } from 'vitest'
import type { RuntimeSubscriptionEvent } from '@/modules/task'
import { createVoltAgentRuntimeAdapter } from './voltagent-runtime-adapter'

function encodeSse(chunks: object[]): Uint8Array {
  const encoder = new TextEncoder()
  return encoder.encode(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
  )
}

function hangingSse(
  chunks: object[],
  signal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  const bytes = encodeSse(chunks)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      function abort(): void {
        try {
          controller.error(
            Object.assign(new Error('aborted'), { name: 'AbortError' }),
          )
        } catch {
          // already closed / errored
        }
      }
      if (signal?.aborted) {
        abort()
        return
      }
      signal?.addEventListener('abort', abort, { once: true })
    },
  })
}

function sseBody(chunks: object[]): ReadableStream<Uint8Array> {
  const bytes = encodeSse(chunks)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

function collectEvents(
  adapter: ReturnType<typeof createVoltAgentRuntimeAdapter>,
  taskId: string
): RuntimeSubscriptionEvent[] {
  const events: RuntimeSubscriptionEvent[] = []
  adapter.subscribe(taskId, null, (e) => events.push(e))
  return events
}

describe('VoltAgentRuntimeAdapter', () => {
  it('forwards safe composer metadata without embedding attachment bytes', async () => {
    let requestBody = ''
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).endsWith('/stream')) {
        return new Response('unexpected route', { status: 500 })
      }
      requestBody = String(init?.body ?? '')
      return new Response(sseBody([{ type: 'finish', finishReason: 'stop' }]), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-context',
      issuedAt: '2026-08-06T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-context',
      schemaVersion: 1,
      taskId: 'task-context',
      inputText: '分析附件',
      composerContext: {
        attachments: [{ name: 'report.pdf', kind: 'file', meta: '本地附件' }],
        skills: [{ id: 'review', label: 'Code Review' }],
        connectors: [
          {
            id: 'connector.feishu',
            label: '飞书',
            connected: true,
            taskSelected: true,
            capabilityEffective: true,
          },
          {
            id: 'connector.github',
            label: 'GitHub',
            connected: true,
            taskSelected: false,
            capabilityEffective: false,
          },
        ],
        expert: {
          id: 'expert.office-meeting',
          label: '会议纪要专家',
          instruction: '优先结构化会议纪要（议题、决议、待办）。',
        },
        mode: 'plan',
      },
    })

    await vi.waitFor(() => expect(requestBody).toContain('report.pdf'))
    expect(requestBody).toContain('未上传文件内容')
    expect(requestBody).toContain('Code Review')
    expect(requestBody).toContain('专家指令')
    expect(requestBody).toContain('优先结构化会议纪要')
    expect(requestBody).not.toContain('attachment bytes')
    const streamPayload = JSON.parse(requestBody) as {
      options: { context: { capabilityConnectorIds: string[] } }
    }
    expect(streamPayload.options.context.capabilityConnectorIds).toEqual([
      'connector.feishu',
    ])
    expect(requestBody).not.toContain('本 Task 已选连接器：GitHub')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps the in-flight Run expert overlay after a later expert selection', async () => {
    const xhsInstruction =
      '你当前以「小红书封面专家」配置包工作：关注封面标题、视觉卖点与合规表述。'
    const meetingInstruction = '优先结构化会议纪要（议题、决议、待办）。'
    let call = 0
    let firstBody = ''
    let resumeBody = ''
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      call += 1
      if (call === 1) {
        firstBody = String(init?.body ?? '')
        return new Response(
          hangingSse(
            [
              {
                type: 'tool-call',
                toolCallId: 'call_xhs',
                toolName: 'write_file',
                args: { file_path: '/output/cover.md', content: 'hi' },
              },
              {
                type: 'tool-approval-request',
                approvalId: 'apr-xhs',
                toolCall: {
                  type: 'tool-call',
                  toolCallId: 'call_xhs',
                  toolName: 'write_file',
                  input: { file_path: '/output/cover.md', content: 'hi' },
                },
              },
            ],
            init?.signal,
          ),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      resumeBody = String(init?.body ?? '')
      return new Response(
        sseBody([
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
      nowIso: () => '2026-08-13T12:00:00.000Z',
    })
    const events = collectEvents(adapter, 'task-xhs-run')

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-xhs-s',
      issuedAt: '2026-08-13T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-xhs-s',
      schemaVersion: 1,
      taskId: 'task-xhs-run',
      inputText: '写一张封面',
      composerContext: {
        expert: {
          id: 'expert.xhs-cover',
          label: '小红书封面专家',
          instruction: xhsInstruction,
        },
      },
      proposedTurnId: 'turn-xhs',
      proposedRunId: 'run-xhs',
    })

    await vi.waitFor(() => expect(firstBody).toContain(xhsInstruction))
    expect(firstBody).toContain('专家指令')
    expect(firstBody).toContain('expert.xhs-cover')

    const busy = await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-xhs-busy',
      issuedAt: '2026-08-13T12:00:01.000Z',
      actor: 'user',
      idempotencyKey: 'idem-xhs-busy',
      schemaVersion: 1,
      taskId: 'task-xhs-run',
      inputText: '改成会议纪要',
      composerContext: {
        expert: {
          id: 'expert.office-meeting',
          label: '会议纪要专家',
          instruction: meetingInstruction,
        },
      },
    })
    expect(busy.status).toBe('rejected')
    expect(busy.reasonCode).toBe('task_busy')

    await vi.waitFor(() => {
      expect(
        events.some(
          (event) =>
            event.kind === 'event' &&
            event.envelope.eventType === 'approval.requested',
        ),
      ).toBe(true)
    })

    const aprAck = await adapter.sendCommand({
      type: 'respondToApproval',
      commandId: 'cmd-xhs-a',
      issuedAt: '2026-08-13T12:00:02.000Z',
      actor: 'user',
      idempotencyKey: 'idem-xhs-a',
      schemaVersion: 1,
      taskId: 'task-xhs-run',
      runId: 'run-xhs',
      turnId: 'turn-xhs',
      payload: { requestId: 'apr-xhs', decision: 'approved' },
    })
    expect(aprAck.status).toBe('accepted')

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(resumeBody).toContain(xhsInstruction)
    expect(resumeBody).not.toContain(meetingInstruction)
    expect(resumeBody).not.toContain('expert.office-meeting')
  })

  it('treats a DONE-only stream as a completed run', async () => {
    const encoder = new TextEncoder()
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        )
    )
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const events = collectEvents(adapter, 'task-done')

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-done',
      issuedAt: '2026-08-06T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-done',
      schemaVersion: 1,
      taskId: 'task-done',
      inputText: '你好',
      proposedTurnId: 'turn-done',
      proposedRunId: 'run-done',
    })

    await vi.waitFor(() => {
      expect(
        events.filter(
          (event) =>
            event.kind === 'event' &&
            event.envelope.eventType === 'run.completed'
        )
      ).toHaveLength(1)
    })
  })

  it('flushes a final SSE data line without a trailing newline', async () => {
    const encoder = new TextEncoder()
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"type":"text-delta","delta":"尾帧"}')
              )
              controller.close()
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        )
    )
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const events = collectEvents(adapter, 'task-tail')

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-tail',
      issuedAt: '2026-08-06T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-tail',
      schemaVersion: 1,
      taskId: 'task-tail',
      inputText: '你好',
      proposedTurnId: 'turn-tail',
      proposedRunId: 'run-tail',
    })

    await vi.waitFor(() => {
      const envelopes = events.flatMap((event) =>
        event.kind === 'event' ? [event.envelope] : []
      )
      expect(
        envelopes.some(
          (event) =>
            event.eventType === 'output.delta' &&
            (event.payload as { text?: string }).text === '尾帧'
        )
      ).toBe(true)
      expect(
        envelopes.filter((event) => event.eventType === 'run.completed')
      ).toHaveLength(1)
    })
  })

  it('submitTurn streams mapped envelopes via RuntimePort', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        sseBody([
          { type: 'text-delta', delta: 'Hello' },
          { type: 'text-delta', delta: ' world' },
          { type: 'finish', finishReason: 'stop' },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
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
    const { normalizeWorkspaceToolInput } =
      await import('./voltagent-runtime-adapter')
    expect(
      normalizeWorkspaceToolInput({
        file_path: '/Users/me/output/office-smoke-workspace/output/a.md',
        content: 'x',
      })
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
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
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

  it('respondToApproval rejects when pending approval is missing', async () => {
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

  it('respondToApproval aborts a draining stream and resumes immediately', async () => {
    let call = 0
    let resumeBody = ''
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      call += 1
      if (call === 1) {
        return new Response(
          hangingSse(
            [
              {
                type: 'tool-call',
                toolCallId: 'call_hang',
                toolName: 'write_file',
                args: { file_path: '/output/a.md', content: 'hi' },
              },
              {
                type: 'tool-approval-request',
                approvalId: 'apr-hang',
                toolCall: {
                  type: 'tool-call',
                  toolCallId: 'call_hang',
                  toolName: 'write_file',
                  input: { file_path: '/output/a.md', content: 'hi' },
                },
              },
            ],
            init?.signal,
          ),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      resumeBody = String(init?.body ?? '')
      return new Response(
        sseBody([
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
    const events = collectEvents(adapter, 'task-hang')

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-hang-s',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-hang-s',
      schemaVersion: 1,
      taskId: 'task-hang',
      inputText: '写个文件',
      proposedTurnId: 'turn-hang',
      proposedRunId: 'run-hang',
    })

    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('approval.requested')
    })

    const aprAck = await adapter.sendCommand({
      type: 'respondToApproval',
      commandId: 'cmd-hang-a',
      issuedAt: '2026-08-05T12:00:01.000Z',
      actor: 'user',
      idempotencyKey: 'idem-hang-a',
      schemaVersion: 1,
      taskId: 'task-hang',
      runId: 'run-hang',
      turnId: 'turn-hang',
      payload: { requestId: 'apr-hang', decision: 'approved' },
    })
    expect(aprAck.status).toBe('accepted')

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(resumeBody).toContain('approval-responded')
    expect(resumeBody).toContain('tool-write_file')

    await new Promise((r) => setTimeout(r, 20))
    const types = events
      .filter((e) => e.kind === 'event')
      .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
    expect(types).not.toContain('run.failed')
    expect(types).not.toContain('run.cancelled')
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
          { status: 200, headers: { 'Content-Type': 'application/json' } }
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
      const request = JSON.parse(String(init?.body ?? '{}')) as {
        input: unknown
        options?: {
          maxSteps?: number
          context?: { capabilityConnectorIds?: string[] }
        }
      }
      expect(request.options?.context?.capabilityConnectorIds).toEqual([
        'connector.feishu',
      ])
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
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        )
      }
      // Resume after approve
      expect(Array.isArray(request.input)).toBe(true)
      // maxSteps omitted by default (sidecar Agent config wins)
      expect(request.options?.maxSteps).toBeUndefined()
      const messages = request.input as Array<{
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
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
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
      composerContext: {
        connectors: [
          {
            id: 'connector.feishu',
            label: '飞书',
            connected: true,
            taskSelected: true,
            capabilityEffective: true,
          },
        ],
      },
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

  it('subscribe seeds nextSequence from EventStore cursor', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          sseBody([{ type: 'text-delta', delta: 'ok' }, { type: 'finish' }]),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }
        )
    )
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowIso: () => '2026-08-05T12:00:00.000Z',
    })
    const events = collectEvents(adapter, 'task-cur')
    // Simulate rehydrate: store already has sequences 1..10
    adapter.subscribe('task-cur', 10, () => {})

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-cur',
      issuedAt: '2026-08-05T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-cur',
      schemaVersion: 1,
      taskId: 'task-cur',
      inputText: 'hi',
      proposedTurnId: 'turn-cur',
      proposedRunId: 'run-cur',
    })

    await vi.waitFor(() => {
      const seqs = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.taskSequence : 0))
      expect(seqs.length).toBeGreaterThan(0)
      expect(Math.min(...seqs)).toBeGreaterThanOrEqual(11)
    })
  })

  it('ask_user_question tool-call emits run.input_requested and suppresses run.completed', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        sseBody([
          {
            type: 'tool-call',
            toolCallId: 'call-ask',
            toolName: 'ask_user_question',
            args: {
              question: '用哪种语气？',
              options: [
                { id: 'formal', label: '正式' },
                { id: 'casual', label: '轻松' },
              ],
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
      nowIso: () => '2026-08-15T12:00:00.000Z',
    })
    const events = collectEvents(adapter, 'task-ask')
    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-ask',
      issuedAt: '2026-08-15T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-ask',
      schemaVersion: 1,
      taskId: 'task-ask',
      inputText: '问我一个单选题',
      proposedTurnId: 'turn-ask',
      proposedRunId: 'run-ask',
    })
    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('run.input_requested')
    })
    await new Promise((r) => setTimeout(r, 30))
    const types = events
      .filter((e) => e.kind === 'event')
      .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
    expect(types).not.toContain('tool.called')
    expect(types).not.toContain('run.completed')
    const requested = events.find(
      (e) => e.kind === 'event' && e.envelope.eventType === 'run.input_requested',
    )
    expect(requested && requested.kind === 'event' ? requested.envelope.payload : null).toMatchObject({
      requestId: 'call-ask',
      question: '用哪种语气？',
    })
  })

  it('provideRunInput resumes with output-available tool part and synthesizes input_provided', async () => {
    let call = 0
    let resumeBody = ''
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      call += 1
      if (call === 1) {
        return new Response(
          sseBody([
            {
              type: 'tool-call',
              toolCallId: 'call-ask-2',
              toolName: 'ask_user_question',
              args: {
                question: '用哪种语气？',
                options: [
                  { id: 'formal', label: '正式' },
                  { id: 'casual', label: '轻松' },
                ],
              },
            },
            { type: 'finish', finishReason: 'tool-calls' },
          ]),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      resumeBody = String(init?.body ?? '')
      return new Response(
        sseBody([
          { type: 'text-delta', delta: '好的，按正式语气写。' },
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
      nowIso: () => '2026-08-15T12:00:00.000Z',
    })
    const events = collectEvents(adapter, 'task-ask-2')
    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-ask-s',
      issuedAt: '2026-08-15T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-ask-s',
      schemaVersion: 1,
      taskId: 'task-ask-2',
      inputText: '问我一个单选题',
      proposedTurnId: 'turn-ask-2',
      proposedRunId: 'run-ask-2',
    })
    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('run.input_requested')
    })
    await new Promise((r) => setTimeout(r, 20))

    const ack = await adapter.sendCommand({
      type: 'provideRunInput',
      commandId: 'cmd-ask-a',
      issuedAt: '2026-08-15T12:00:01.000Z',
      actor: 'user',
      idempotencyKey: 'idem-ask-a',
      schemaVersion: 1,
      taskId: 'task-ask-2',
      inputText: '正式',
      requestId: 'call-ask-2',
      answer: { kind: 'options', selectedOptionIds: ['formal'] },
    })
    expect(ack.status).toBe('accepted')

    await vi.waitFor(() => {
      const types = events
        .filter((e) => e.kind === 'event')
        .map((e) => (e.kind === 'event' ? e.envelope.eventType : ''))
      expect(types).toContain('run.input_provided')
      expect(types).toContain('output.delta')
      expect(types).toContain('run.completed')
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const request = JSON.parse(resumeBody) as {
      input: Array<{ role: string; parts: Array<Record<string, unknown>> }>
    }
    expect(request.input[1]?.parts[0]).toMatchObject({
      type: 'tool-ask_user_question',
      toolCallId: 'call-ask-2',
      state: 'output-available',
      output: {
        status: 'answered',
        selected: [{ id: 'formal', label: '正式' }],
      },
    })
  })

  it('provideRunInput maps skipped and free-text answers to tool output', async () => {
    const bodies: string[] = []
    let call = 0
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      call += 1
      if (call === 1 || call === 3) {
        return new Response(
          sseBody([
            {
              type: 'tool-call',
              toolCallId: call === 1 ? 'call-skip' : 'call-free',
              toolName: 'ask_user_question',
              args: {
                question: '用哪种语气？',
                options: [
                  { id: 'formal', label: '正式' },
                  { id: 'casual', label: '轻松' },
                ],
              },
            },
            { type: 'finish', finishReason: 'tool-calls' },
          ]),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      bodies.push(String(init?.body ?? ''))
      return new Response(
        sseBody([{ type: 'finish', finishReason: 'stop' }]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowIso: () => '2026-08-15T12:00:00.000Z',
    })
    collectEvents(adapter, 'task-ask-skip')
    collectEvents(adapter, 'task-ask-free')

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-skip-s',
      issuedAt: '2026-08-15T12:00:00.000Z',
      actor: 'user',
      idempotencyKey: 'idem-skip-s',
      schemaVersion: 1,
      taskId: 'task-ask-skip',
      inputText: '提问',
      proposedTurnId: 'turn-skip',
      proposedRunId: 'run-skip',
    })
    await vi.waitFor(() => expect(call).toBe(1))
    await new Promise((r) => setTimeout(r, 20))
    await adapter.sendCommand({
      type: 'provideRunInput',
      commandId: 'cmd-skip-a',
      issuedAt: '2026-08-15T12:00:01.000Z',
      actor: 'user',
      idempotencyKey: 'idem-skip-a',
      schemaVersion: 1,
      taskId: 'task-ask-skip',
      inputText: '已跳过',
      requestId: 'call-skip',
      answer: { kind: 'skipped' },
    })
    await vi.waitFor(() => expect(call).toBe(2))

    await adapter.sendCommand({
      type: 'submitTurn',
      commandId: 'cmd-free-s',
      issuedAt: '2026-08-15T12:00:02.000Z',
      actor: 'user',
      idempotencyKey: 'idem-free-s',
      schemaVersion: 1,
      taskId: 'task-ask-free',
      inputText: '提问',
      proposedTurnId: 'turn-free',
      proposedRunId: 'run-free',
    })
    await vi.waitFor(() => expect(call).toBe(3))
    await new Promise((r) => setTimeout(r, 20))
    await adapter.sendCommand({
      type: 'provideRunInput',
      commandId: 'cmd-free-a',
      issuedAt: '2026-08-15T12:00:03.000Z',
      actor: 'user',
      idempotencyKey: 'idem-free-a',
      schemaVersion: 1,
      taskId: 'task-ask-free',
      inputText: '按你的建议',
      requestId: 'call-free',
      answer: { kind: 'freeText', text: '按你的建议' },
    })

    await vi.waitFor(() => expect(bodies).toHaveLength(2))
    const skipPart = (
      JSON.parse(bodies[0]!) as {
        input: Array<{ parts: Array<Record<string, unknown>> }>
      }
    ).input[1]?.parts[0]
    const freePart = (
      JSON.parse(bodies[1]!) as {
        input: Array<{ parts: Array<Record<string, unknown>> }>
      }
    ).input[1]?.parts[0]
    expect(skipPart).toMatchObject({
      type: 'tool-ask_user_question',
      state: 'output-available',
      output: { status: 'skipped' },
    })
    expect(freePart).toMatchObject({
      type: 'tool-ask_user_question',
      state: 'output-available',
      output: { status: 'replied', text: '按你的建议' },
    })
  })

  it('getCapabilities marks runInput as supported', async () => {
    const adapter = createVoltAgentRuntimeAdapter({
      baseUrl: 'http://127.0.0.1:3141',
      agentId: 'workbench',
      projectId: 'proj',
      fetchImpl: vi.fn() as unknown as typeof fetch,
      tools: ['ask_user_question'],
    })
    const caps = await adapter.getCapabilities('proj', 'local')
    expect(caps.features.runInput).toBe(true)
    expect(caps.features.steer).toBe(false)
  })
})
