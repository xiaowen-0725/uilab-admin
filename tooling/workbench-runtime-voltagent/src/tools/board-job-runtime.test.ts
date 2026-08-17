/**
 * Widget Data Job execution seam: POST /board/jobs/:jobId/run
 * (spec §7 / §8.2 · ADR-0023 · #139).
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { Hono } from 'hono'
import { resolveDenoExecutable } from './board-job-executor.js'
import { createBoardRuntime } from './board-runtime.js'

const TOKEN = 'test-sidecar-token'
const tempRoots: string[] = []

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })))
})

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function jobCode(body: string): string {
  return `export async function run(ctx) {\n${body}\n}\n`
}

async function boardRuntime(overrides?: {
  resolveDeno?: () => Promise<string | null>
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'board-jobs-'))
  tempRoots.push(root)
  return createBoardRuntime({
    stagingRoot: path.join(root, 'staging'),
    jobsRoot: path.join(root, 'jobs'),
    token: TOKEN,
    env: { WORKSPACE_ROOT: path.join(root, 'workspace') },
    resolveDeno: overrides?.resolveDeno,
  })
}

function appOf(runtime: ReturnType<typeof createBoardRuntime>) {
  const app = new Hono()
  runtime.mountRoutes(app)
  return app
}

function auth(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  }
}

async function install(
  app: Hono,
  jobId: string,
  code: string,
  extra?: { allowedHosts?: string[]; timeoutMs?: number; codeHash?: string },
) {
  return app.request(
    `/board/jobs/${jobId}/install`,
    auth({
      method: 'POST',
      body: JSON.stringify({
        widgetId: 'w_1',
        code,
        codeHash: extra?.codeHash ?? hashText(code),
        allowedHosts: extra?.allowedHosts ?? ['api.example.com'],
        timeoutMs: extra?.timeoutMs,
      }),
    }),
  )
}

async function startRun(app: Hono, jobId: string) {
  return app.request(`/board/jobs/${jobId}/run`, auth({ method: 'POST' }))
}

async function pollRun(
  app: Hono,
  runId: string,
  timeoutMs = 20_000,
): Promise<{
  status: string
  error?: { code?: string; hint?: string }
  result?: unknown
}> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await app.request(`/board/runs/${runId}`, auth())
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      status: string
      error?: { code?: string; hint?: string }
      result?: unknown
    }
    if (body.status !== 'running') return body
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`run ${runId} still running after ${timeoutMs}ms`)
}

describe('board job run endpoint auth', () => {
  it('rejects a run without credentials', async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const res = await app.request('/board/jobs/j_1/run', { method: 'POST' })
    assert.equal(res.status, 401)
    const body = (await res.json()) as { ok: false; error: string }
    assert.equal(body.ok, false)
    assert.equal(body.error, 'not_authorized')
  })
})

describe('board job run approval gate', () => {
  it('rejects a run when no approved snapshot is installed', async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const res = await startRun(app, 'j_missing')
    assert.equal(res.status, 409)
    const body = (await res.json()) as { ok: false; error: string }
    assert.equal(body.error, 'not_approved')
  })

  it('rejects a run when installed code no longer matches approved codeHash', async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const code = jobCode('return { ok: true }')
    const installed = await install(app, 'j_tamper', code)
    assert.equal(installed.status, 200)
    await writeFile(runtime.jobs.jobSourcePath('j_tamper'), jobCode('return { pwned: true }'))
    const res = await startRun(app, 'j_tamper')
    assert.equal(res.status, 409)
    const body = (await res.json()) as { ok: false; error: string }
    assert.equal(body.error, 'code_hash_mismatch')
  })

  it('installs approved code when board_job_finish succeeds', async () => {
    const runtime = await boardRuntime()
    const begun = (await (
      runtime.tools.board_job_begin.execute as (
        args: Record<string, unknown>,
        opts: object,
      ) => Promise<{ jobId: string; buildId: string }>
    )(
      {
        widgetId: 'w_1',
        title: '汇率',
        description: '公开汇率',
        allowedHosts: ['api.example.com'],
      },
      {},
    ))
    const code = jobCode('return { ok: true }')
    await (
      runtime.tools.board_job_append.execute as (
        args: Record<string, unknown>,
        opts: object,
      ) => Promise<unknown>
    )(
      { jobId: begun.jobId, buildId: begun.buildId, seq: 1, chunk: code },
      {},
    )
    const finished = (await (
      runtime.tools.board_job_finish.execute as (
        args: Record<string, unknown>,
        opts: object,
      ) => Promise<{ jobId: string; codeHash: string }>
    )({ jobId: begun.jobId, buildId: begun.buildId }, {}))
    assert.equal(finished.codeHash, hashText(code))
    const approved = await runtime.jobs.readApproved(begun.jobId)
    assert.equal(approved?.codeHash, finished.codeHash)
    assert.deepEqual(approved?.allowedHosts, ['api.example.com'])
  })

  it('returns deno_not_found when deno is not on PATH', async () => {
    const runtime = await boardRuntime({ resolveDeno: async () => null })
    const app = appOf(runtime)
    const code = jobCode('return { ok: true }')
    assert.equal((await install(app, 'j_noden', code)).status, 200)
    const res = await startRun(app, 'j_noden')
    assert.equal(res.status, 503)
    const body = (await res.json()) as { ok: false; error: string; hint: string }
    assert.equal(body.error, 'deno_not_found')
    assert.match(body.hint, /Deno/)
  })
})

describe('board job Deno isolation', async () => {
  const deno = await resolveDenoExecutable()

  it('returns a small JSON result from an approved job', { skip: !deno }, async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const code = jobCode('return { quote: 42 }')
    assert.equal((await install(app, 'j_ok', code)).status, 200)
    const started = await startRun(app, 'j_ok')
    assert.equal(started.status, 202)
    const { runId } = (await started.json()) as { runId: string }
    const done = await pollRun(app, runId)
    assert.equal(done.status, 'success')
    assert.deepEqual(done.result, { quote: 42 })
  })

  it('lets Deno refuse a fetch to an undeclared host', { skip: !deno }, async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const code = jobCode(
      'return await (await fetch("https://evil.example/data")).json()',
    )
    assert.equal(
      (await install(app, 'j_net', code, { allowedHosts: ['api.example.com'] }))
        .status,
      200,
    )
    const started = await startRun(app, 'j_net')
    assert.equal(started.status, 202)
    const { runId } = (await started.json()) as { runId: string }
    const done = await pollRun(app, runId)
    assert.equal(done.status, 'error')
    assert.match(
      `${done.error?.hint ?? ''} ${done.error?.code ?? ''}`,
      /net|NotCapable|permission|Requires/i,
    )
  })

  it('lets Deno refuse reading Deno.env', { skip: !deno }, async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const code = jobCode('return { home: Deno.env.get("HOME") }')
    assert.equal((await install(app, 'j_env', code)).status, 200)
    const started = await startRun(app, 'j_env')
    assert.equal(started.status, 202)
    const { runId } = (await started.json()) as { runId: string }
    const done = await pollRun(app, runId)
    assert.equal(done.status, 'error')
    assert.match(
      `${done.error?.hint ?? ''} ${done.error?.code ?? ''}`,
      /env|NotCapable|permission|Requires/i,
    )
  })

  it('lets Deno refuse a write outside the run directory', { skip: !deno }, async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const outside = path.join(os.tmpdir(), `uilab-job-escape-${Date.now()}`)
    const code = jobCode(
      `await Deno.writeTextFile(${JSON.stringify(outside)}, "nope"); return { wrote: true }`,
    )
    assert.equal((await install(app, 'j_fs', code)).status, 200)
    const started = await startRun(app, 'j_fs')
    assert.equal(started.status, 202)
    const { runId } = (await started.json()) as { runId: string }
    const done = await pollRun(app, runId)
    assert.equal(done.status, 'error')
    assert.match(
      `${done.error?.hint ?? ''} ${done.error?.code ?? ''}`,
      /read|write|NotCapable|permission|Requires/i,
    )
  })

  it('kills a timed-out job and records a timeout run', { skip: !deno }, async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const code = jobCode(
      'await new Promise((resolve) => setTimeout(resolve, 20_000)); return { late: true }',
    )
    assert.equal(
      (await install(app, 'j_slow', code, { timeoutMs: 400 })).status,
      200,
    )
    const started = await startRun(app, 'j_slow')
    assert.equal(started.status, 202)
    const { runId } = (await started.json()) as { runId: string }
    const done = await pollRun(app, runId, 8_000)
    assert.equal(done.status, 'timeout')
    assert.match(done.error?.hint ?? '', /超时/)
  })

  it('cancels a running job', { skip: !deno }, async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const code = jobCode(
      'await new Promise((resolve) => setTimeout(resolve, 20_000)); return { late: true }',
    )
    assert.equal((await install(app, 'j_cancel', code)).status, 200)
    const started = await startRun(app, 'j_cancel')
    assert.equal(started.status, 202)
    const { runId } = (await started.json()) as { runId: string }
    const cancelled = await app.request(
      `/board/runs/${runId}/cancel`,
      auth({ method: 'POST' }),
    )
    assert.ok(cancelled.status === 200 || cancelled.status === 202)
    const done = await pollRun(app, runId, 8_000)
    assert.equal(done.status, 'cancelled')
  })

  it('fails a result larger than 512 KiB without filling artifactRef', { skip: !deno }, async () => {
    const runtime = await boardRuntime()
    const app = appOf(runtime)
    const code = jobCode('return { blob: "x".repeat(512 * 1024 + 8) }')
    assert.equal((await install(app, 'j_big', code)).status, 200)
    const started = await startRun(app, 'j_big')
    assert.equal(started.status, 202)
    const { runId } = (await started.json()) as { runId: string }
    const done = await pollRun(app, runId)
    assert.equal(done.status, 'error')
    assert.equal(done.error?.code, 'output_too_large')
    assert.equal((done as { artifactRef?: string }).artifactRef, undefined)
  })
})
