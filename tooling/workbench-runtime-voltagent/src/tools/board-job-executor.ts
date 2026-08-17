/**
 * Deno subprocess executor for Widget Data Jobs (ADR-0023 §1 / spec §7).
 * Command line is the permission contract. Not registered as a tool.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  BOARD_JOB_RESULT_MAX_BYTES,
  BoardJobStore,
  clampJobTimeoutMs,
  newJobRunId,
} from './board-job-store.js'
import { boardToolError, type BoardToolError } from './board-types.js'

export type BoardJobRunStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'timeout'
  | 'cancelled'

export type BoardJobRunView = {
  runId: string
  jobId: string
  widgetId: string
  status: BoardJobRunStatus
  startedAt: string
  finishedAt?: string
  error?: { code: string; hint: string }
  result?: unknown
}

export type ResolveDeno = () => Promise<string | null>

const KILL_GRACE_MS = 1_000

export async function resolveDenoExecutable(
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const override = env.DENO_PATH?.trim()
  if (override) return (await canExec(override)) ? override : null
  return (await canExec('deno')) ? 'deno' : null
}

function canExec(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['--version'], { stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}

export function buildDenoArgv(input: {
  runnerPath: string
  runDir: string
  jobId: string
  runId: string
  allowedHosts: readonly string[]
}): string[] {
  const args = [
    'run',
    '--no-remote',
    '--cached-only',
    '--no-prompt',
    '--deny-env',
    '--deny-run',
    '--deny-ffi',
    `--allow-read=${input.runDir}`,
    `--allow-write=${input.runDir}`,
  ]
  if (input.allowedHosts.length > 0) {
    args.push(`--allow-net=${input.allowedHosts.join(',')}`)
  }
  args.push(input.runnerPath, input.jobId, input.runId)
  return args
}

type LiveRun = {
  view: BoardJobRunView
  child: ChildProcess
  timedOut: boolean
  cancelled: boolean
}

export class BoardJobExecutor {
  private readonly runs = new Map<string, LiveRun>()
  private readonly runningByJob = new Map<string, string>()

  constructor(
    private readonly store: BoardJobStore,
    private readonly resolveDeno: ResolveDeno = resolveDenoExecutable,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getRun(runId: string): BoardJobRunView | undefined {
    return this.runs.get(runId)?.view
  }

  async startRun(jobId: string): Promise<{ runId: string } | BoardToolError> {
    const id = jobId.trim()
    if (!id) return boardToolError('unknown_job', '缺少 jobId')
    if (this.runningByJob.has(id)) {
      return boardToolError('already_running', '该作业已在运行，请等待结束后再刷新')
    }

    const ready = await this.store.assertRunnable(id)
    if (ready.ok !== true) return ready

    const deno = await this.resolveDeno()
    if (!deno) {
      return boardToolError(
        'deno_not_found',
        '未安装 Deno，无法执行取数作业。请安装 Deno 后重试',
      )
    }

    const runId = newJobRunId()
    const runDir = this.store.runDir(id, runId)
    await mkdir(runDir, { recursive: true })
    const started = this.now()
    await writeFile(
      path.join(runDir, 'ctx.json'),
      JSON.stringify({
        jobId: id,
        runId,
        now: started.toISOString(),
        timeZone: 'UTC',
        runDir,
      }),
      'utf8',
    )

    const view: BoardJobRunView = {
      runId,
      jobId: id,
      widgetId: ready.approved.widgetId,
      status: 'running',
      startedAt: started.toISOString(),
    }
    const argv = buildDenoArgv({
      runnerPath: this.store.runnerPath(id),
      runDir,
      jobId: id,
      runId,
      allowedHosts: ready.approved.allowedHosts,
    })
    const child = spawn(deno, argv, {
      cwd: this.store.jobDir(id),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: denoChildEnv(),
    })

    const live: LiveRun = { view, child, timedOut: false, cancelled: false }
    this.runs.set(runId, live)
    this.runningByJob.set(id, runId)

    const timeoutMs = clampJobTimeoutMs(ready.approved.timeoutMs)
    const timeout = setTimeout(() => {
      live.timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (live.view.status === 'running') child.kill('SIGKILL')
      }, KILL_GRACE_MS)
    }, timeoutMs)

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000)
    })

    child.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      const missing = err.code === 'ENOENT'
      this.finish(live, {
        status: 'error',
        error: missing
          ? {
              code: 'deno_not_found',
              hint: '未安装 Deno，无法执行取数作业。请安装 Deno 后重试',
            }
          : {
              code: 'runtime_unavailable',
              hint: err.message || '无法启动 Deno 子进程',
            },
      })
    })

    child.once('exit', () => {
      clearTimeout(timeout)
      void this.collect(live, runDir, stderr)
    })

    return { runId }
  }

  async cancel(runId: string): Promise<BoardJobRunView | BoardToolError> {
    const live = this.runs.get(runId)
    if (!live) return boardToolError('unknown_job', '未知的 runId')
    if (live.view.status !== 'running') return live.view
    live.cancelled = true
    this.finish(live, { status: 'cancelled' })
    live.child.kill('SIGTERM')
    setTimeout(() => {
      if (!live.child.killed) live.child.kill('SIGKILL')
    }, KILL_GRACE_MS)
    return live.view
  }

  private async collect(
    live: LiveRun,
    runDir: string,
    stderr: string,
  ): Promise<void> {
    if (live.cancelled) {
      this.finish(live, { status: 'cancelled' })
      return
    }
    if (live.timedOut) {
      this.finish(live, {
        status: 'timeout',
        error: {
          code: 'runtime_unavailable',
          hint: '作业执行超时，已终止进程',
        },
      })
      return
    }

    const resultPath = path.join(runDir, 'result.json')
    const errorPath = path.join(runDir, 'error.json')
    try {
      const st = await stat(resultPath)
      if (st.size > BOARD_JOB_RESULT_MAX_BYTES) {
        this.finish(live, {
          status: 'error',
          error: {
            code: 'output_too_large',
            hint: `产物超过 512 KiB（${st.size} 字节），已拒绝回传`,
          },
        })
        return
      }
      const raw = await readFile(resultPath, 'utf8')
      const bytes = Buffer.byteLength(raw, 'utf8')
      if (bytes > BOARD_JOB_RESULT_MAX_BYTES) {
        this.finish(live, {
          status: 'error',
          error: {
            code: 'output_too_large',
            hint: `产物超过 512 KiB（${bytes} 字节），已拒绝回传`,
          },
        })
        return
      }
      this.finish(live, { status: 'success', result: JSON.parse(raw) as unknown })
      return
    } catch {
      // fall through to error.json / stderr
    }

    try {
      const raw = await readFile(errorPath, 'utf8')
      const parsed = JSON.parse(raw) as { message?: string; name?: string }
      this.finish(live, {
        status: 'error',
        error: {
          code: 'runtime_unavailable',
          hint: parsed.message || parsed.name || '作业执行失败',
        },
      })
      return
    } catch {
      this.finish(live, {
        status: 'error',
        error: {
          code: 'runtime_unavailable',
          hint: stderr.trim() || '作业执行失败且未写出产物',
        },
      })
    }
  }

  private finish(
    live: LiveRun,
    patch: Pick<BoardJobRunView, 'status' | 'error' | 'result'>,
  ): void {
    if (live.view.status !== 'running') return
    live.view = {
      ...live.view,
      ...patch,
      finishedAt: this.now().toISOString(),
    }
    this.runningByJob.delete(live.view.jobId)
  }
}

function denoChildEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    DENO_DIR: process.env.DENO_DIR,
  }
}
