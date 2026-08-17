/**
 * Installed Widget Data Job copies on disk (spec §7.3).
 * Derived from renderer IDB; never authoritative. Outside WORKSPACE_ROOT.
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertRuntimeConfigOutsideWorkspace,
  defaultRuntimeConfigDir,
} from '../plugin/auth-binding-persist.js'
import { BOARD_JOB_RUNNER_SOURCE } from './board-job-runner-source.js'
import { boardToolError, type BoardToolError } from './board-types.js'

const PRIVATE_FILE = { encoding: 'utf8' as const, mode: 0o600 }

export const BOARD_JOB_RESULT_MAX_BYTES = 512 * 1024
export const BOARD_JOB_DEFAULT_TIMEOUT_MS = 60_000
export const BOARD_JOB_MAX_TIMEOUT_MS = 120_000

export type BoardJobApprovedInstall = {
  jobId: string
  widgetId: string
  code: string
  codeHash: string
  allowedHosts: readonly string[]
  timeoutMs?: number
}

export type BoardJobInstalled = {
  jobId: string
  widgetId: string
  codeHash: string
  allowedHosts: string[]
  timeoutMs?: number
  installedAt: string
}

export function hashJobCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

export function defaultBoardJobsRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  return path.join(defaultRuntimeConfigDir(env), 'board-jobs')
}

export function clampJobTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return BOARD_JOB_DEFAULT_TIMEOUT_MS
  }
  return Math.min(Math.floor(timeoutMs), BOARD_JOB_MAX_TIMEOUT_MS)
}

export function newJobRunId(): string {
  return `run_${randomUUID()}`
}

export function installFromFinishedDraft(
  jobId: string,
  finished: {
    content: string
    hash: string
    meta: { widgetId?: string; allowedHosts?: string[] }
  },
): BoardJobApprovedInstall {
  return {
    jobId,
    widgetId: finished.meta.widgetId ?? '',
    code: finished.content,
    codeHash: finished.hash,
    allowedHosts: finished.meta.allowedHosts ?? [],
  }
}

export class BoardJobStore {
  readonly root: string

  constructor(
    root: string,
    env: Record<string, string | undefined> = process.env,
  ) {
    this.root = path.resolve(root)
    assertRuntimeConfigOutsideWorkspace(this.root, env)
  }

  jobDir(jobId: string): string {
    return path.join(this.root, jobId)
  }

  jobSourcePath(jobId: string): string {
    return path.join(this.jobDir(jobId), 'job.ts')
  }

  runnerPath(jobId: string): string {
    return path.join(this.jobDir(jobId), 'runner.ts')
  }

  approvedPath(jobId: string): string {
    return path.join(this.jobDir(jobId), 'approved.json')
  }

  runDir(jobId: string, runId: string): string {
    return path.join(this.jobDir(jobId), 'runs', runId)
  }

  async install(
    input: BoardJobApprovedInstall,
  ): Promise<{ ok: true; codeHash: string } | BoardToolError> {
    const jobId = input.jobId.trim()
    const widgetId = input.widgetId.trim()
    if (!jobId) return boardToolError('unknown_job', '缺少 jobId')
    if (!widgetId) return boardToolError('validation_failed', '缺少 widgetId')
    if (!input.code.trim()) {
      return boardToolError('validation_failed', '作业代码为空，无法安装')
    }
    const codeHash = hashJobCode(input.code)
    if (input.codeHash && input.codeHash !== codeHash) {
      return boardToolError(
        'code_hash_mismatch',
        '安装代码的哈希与 codeHash 不一致，已拒绝写入',
      )
    }
    if (input.allowedHosts.length === 0) {
      return boardToolError('validation_failed', 'allowedHosts 不能为空')
    }

    const dir = this.jobDir(jobId)
    await mkdir(dir, { recursive: true })
    await writeFile(this.jobSourcePath(jobId), input.code, PRIVATE_FILE)
    await writeFile(this.runnerPath(jobId), BOARD_JOB_RUNNER_SOURCE, PRIVATE_FILE)
    const snapshot: BoardJobInstalled = {
      jobId,
      widgetId,
      codeHash,
      allowedHosts: [...input.allowedHosts],
      timeoutMs: input.timeoutMs,
      installedAt: new Date().toISOString(),
    }
    await writeFile(this.approvedPath(jobId), JSON.stringify(snapshot), PRIVATE_FILE)
    return { ok: true, codeHash }
  }

  async readApproved(jobId: string): Promise<BoardJobInstalled | null> {
    try {
      const raw = await readFile(this.approvedPath(jobId), 'utf8')
      const parsed = JSON.parse(raw) as BoardJobInstalled
      if (!parsed?.jobId || parsed.jobId !== jobId) return null
      return parsed
    } catch {
      return null
    }
  }

  async readInstalledCode(jobId: string): Promise<string | null> {
    try {
      return await readFile(this.jobSourcePath(jobId), 'utf8')
    } catch {
      return null
    }
  }

  async assertRunnable(
    jobId: string,
  ): Promise<{ ok: true; approved: BoardJobInstalled } | BoardToolError> {
    const approved = await this.readApproved(jobId)
    if (!approved) {
      return boardToolError(
        'not_approved',
        '没有已批准的作业快照，无法执行。请先完成 board_job_finish 审批',
      )
    }
    const code = await this.readInstalledCode(jobId)
    if (code == null) {
      return boardToolError(
        'not_approved',
        '已批准快照存在但作业代码缺失，请重新安装',
      )
    }
    if (hashJobCode(code) !== approved.codeHash) {
      return boardToolError(
        'code_hash_mismatch',
        '待执行代码与已批准 codeHash 不一致，已拒绝执行',
      )
    }
    return { ok: true, approved }
  }
}
