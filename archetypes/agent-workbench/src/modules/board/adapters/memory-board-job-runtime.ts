/**
 * In-memory BoardJobRuntimePort for tests and first-run fakes.
 */

import {
  defaultEvaluateDataSource,
  type BoardJobRuntimePort,
  type BoardJobRunResult,
  type WidgetDataSourceEvaluateRequest,
} from '../ports/board-job-runtime-port'

export class MemoryBoardJobRuntime implements BoardJobRuntimePort {
  constructor(private readonly payload: unknown = { ok: true, quote: '42' }) {}

  async runJob(_jobId: string): Promise<BoardJobRunResult> {
    return { ok: true, payload: this.payload }
  }

  evaluate(request: WidgetDataSourceEvaluateRequest): Promise<BoardJobRunResult> {
    return defaultEvaluateDataSource(this, request)
  }
}

export function createMemoryBoardJobRuntime(
  payload?: unknown,
): MemoryBoardJobRuntime {
  return new MemoryBoardJobRuntime(payload)
}

export function createUnavailableBoardJobRuntime(): BoardJobRuntimePort {
  return {
    available: false,
    async probe() {
      return {
        ok: false,
        error: 'runtime_unavailable',
        hint: '运行时未连接',
      }
    },
    async runJob() {
      return {
        ok: false,
        error: 'runtime_unavailable',
        hint: '运行时未连接',
      }
    },
  }
}

export type ControllableBoardJobRuntime = BoardJobRuntimePort & {
  readonly calls: readonly string[]
  readonly active: number
  readonly maxActive: number
  complete(jobId: string, result: BoardJobRunResult): void
  completeAll(result: BoardJobRunResult): void
}

export function createControllableBoardJobRuntime(): ControllableBoardJobRuntime {
  const waiters = new Map<string, Array<(result: BoardJobRunResult) => void>>()
  const calls: string[] = []
  let active = 0
  let maxActive = 0

  return {
    get calls() {
      return calls
    },
    get active() {
      return active
    },
    get maxActive() {
      return maxActive
    },
    async runJob(jobId: string) {
      calls.push(jobId)
      active += 1
      maxActive = Math.max(maxActive, active)
      try {
        return await new Promise<BoardJobRunResult>((resolve) => {
          const queue = waiters.get(jobId) ?? []
          queue.push(resolve)
          waiters.set(jobId, queue)
        })
      } finally {
        active -= 1
      }
    },
    evaluate(request) {
      if (request.kind === 'query') {
        return this.runJob(request.queryName ?? request.jobId ?? 'query')
      }
      return defaultEvaluateDataSource(this, request)
    },
    complete(jobId, result) {
      const queue = waiters.get(jobId)
      const resolve = queue?.shift()
      if (resolve) resolve(result)
    },
    cancelJob(jobId) {
      const queue = waiters.get(jobId)
      if (!queue) return
      for (const resolve of queue) {
        resolve({ ok: false, error: 'cancelled', hint: '已取消' })
      }
      waiters.delete(jobId)
    },
    completeAll(result) {
      for (const queue of waiters.values()) {
        for (const resolve of queue) resolve(result)
      }
      waiters.clear()
    },
  }
}
