/**
 * In-memory BoardJobRuntimePort for tests and first-run fakes.
 */

import type {
  BoardJobRuntimePort,
  BoardJobRunResult,
} from '../ports/board-job-runtime-port'

export class MemoryBoardJobRuntime implements BoardJobRuntimePort {
  constructor(private readonly payload: unknown = { ok: true, quote: '42' }) {}

  async runJob(_jobId: string): Promise<BoardJobRunResult> {
    return { ok: true, payload: this.payload }
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
    async runJob() {
      return {
        ok: false,
        error: 'runtime_unavailable',
        hint: '取数作业运行时尚未接通',
      }
    },
  }
}
