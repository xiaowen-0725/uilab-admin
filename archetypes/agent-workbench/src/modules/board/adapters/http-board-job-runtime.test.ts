import { describe, expect, it, vi } from 'vitest'
import { createHttpBoardJobRuntime } from './http-board-job-runtime'

describe('createHttpBoardJobRuntime', () => {
  it('starts a run and returns the polled payload', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/board/jobs/j_1/run')) {
        expect(init?.method).toBe('POST')
        expect((init?.headers as Record<string, string>).Authorization).toBe(
          'Bearer secret',
        )
        return new Response(JSON.stringify({ runId: 'run_1' }), { status: 202 })
      }
      if (url.endsWith('/board/runs/run_1')) {
        return new Response(
          JSON.stringify({ status: 'success', result: { quote: 42 } }),
          { status: 200 },
        )
      }
      return new Response('missing', { status: 404 })
    })

    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      token: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(runtime.runJob('j_1')).resolves.toEqual({
      ok: true,
      payload: { quote: 42 },
    })
  })

  it('maps a missing-credential response to not_authorized', async () => {
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'not_authorized',
            hint: '缺少或无效的本机侧车凭据，拒绝执行作业',
          }),
          { status: 401 },
        )) as unknown as typeof fetch,
    })
    await expect(runtime.runJob('j_1')).resolves.toEqual({
      ok: false,
      error: 'not_authorized',
      hint: '缺少或无效的本机侧车凭据，拒绝执行作业',
    })
  })
})
