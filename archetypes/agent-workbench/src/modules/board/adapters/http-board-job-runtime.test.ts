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

  it('maps deno_not_found from the sidecar', async () => {
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'deno_not_found',
            hint: '未安装 Deno，无法执行取数作业。请安装 Deno 后重试',
          }),
          { status: 503 },
        )) as unknown as typeof fetch,
    })
    await expect(runtime.runJob('j_1')).resolves.toEqual({
      ok: false,
      error: 'deno_not_found',
      hint: '未安装 Deno，无法执行取数作业。请安装 Deno 后重试',
    })
  })

  it('maps already_running without treating it as a new failure class', async () => {
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'already_running',
            hint: '该作业已在运行，请等待结束后再刷新',
          }),
          { status: 409 },
        )) as unknown as typeof fetch,
    })
    await expect(runtime.runJob('j_1')).resolves.toEqual({
      ok: false,
      error: 'already_running',
      hint: '该作业已在运行，请等待结束后再刷新',
    })
  })

  it('probes a disconnected sidecar as runtime_unavailable', async () => {
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch,
    })
    await expect(runtime.probe?.()).resolves.toEqual({
      ok: false,
      error: 'runtime_unavailable',
      hint: '作业执行端点不可达，侧车未连接或网络错误',
    })
  })

  it('reads preset data without calling the job endpoint', async () => {
    const fetchImpl = vi.fn(async () => new Response('missing', { status: 404 }))
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      runtime.evaluate?.({ kind: 'preset', presetData: { points: [1, 2] } }),
    ).resolves.toEqual({
      ok: true,
      payload: { points: [1, 2] },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts query name and params to the sidecar execute channel', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toBe('http://sidecar/board/queries/site_summary/run')
      expect(init?.method).toBe('POST')
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer secret',
      )
      expect(init?.body).toBe(JSON.stringify({ params: { siteIds: ['site-1'] } }))
      expect(String(init?.body)).not.toContain('fixture-secret-token')
      return new Response(
        JSON.stringify({ ok: true, payload: { occupancy: 0.42 } }),
        { status: 200 },
      )
    })

    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      token: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      runtime.evaluate?.({
        kind: 'query',
        queryName: 'site_summary',
        queryParams: { siteIds: ['site-1'] },
      }),
    ).resolves.toEqual({
      ok: true,
      payload: { occupancy: 0.42 },
    })
  })

  it('surfaces sidecar permission denials from query execute', async () => {
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'permission_denied',
            hint: '资源权限不足：site-1 缺少 read、finance',
          }),
          { status: 403 },
        )) as unknown as typeof fetch,
    })
    await expect(
      runtime.evaluate?.({ kind: 'query', queryName: 'site_finance' }),
    ).resolves.toEqual({
      ok: false,
      error: 'permission_denied',
      hint: '资源权限不足：site-1 缺少 read、finance',
    })
  })

  it('maps a query network failure without calling it a job failure', async () => {
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch,
    })
    await expect(
      runtime.evaluate?.({ kind: 'query', queryName: 'site_summary' }),
    ).resolves.toEqual({
      ok: false,
      error: 'runtime_unavailable',
      hint: '查询执行端点不可达，侧车未连接或网络错误',
    })
  })

  it('surfaces oversized query payloads with the byte size', async () => {
    const runtime = createHttpBoardJobRuntime({
      baseUrl: 'http://sidecar',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'output_too_large',
            hint: '产物超过 512 KiB（524296 字节），已拒绝回传',
          }),
          { status: 400 },
        )) as unknown as typeof fetch,
    })
    await expect(
      runtime.evaluate?.({ kind: 'query', queryName: 'site_blob' }),
    ).resolves.toEqual({
      ok: false,
      error: 'output_too_large',
      hint: '产物超过 512 KiB（524296 字节），已拒绝回传',
    })
  })
})
