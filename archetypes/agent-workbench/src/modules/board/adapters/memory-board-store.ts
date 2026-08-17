/**
 * In-memory BoardStorePort for tests and Memory boot.
 */

import {
  WIDGET_JOB_RUN_LIMIT,
  isJobRunnable,
  widgetStatusForRun,
  type BoardId,
  type BoardPlacement,
  type BoardRecord,
  type BoardWidgetId,
  type BoardWidgetRecord,
  type WidgetDataJobId,
  type WidgetDataJobRecord,
  type WidgetJobRunRecord,
} from '../model/types'
import {
  BoardStorePortError,
  mergeBoardForCommit,
  type BoardAtomicCommitInput,
  type BoardStorePort,
} from '../ports/board-store-port'

export class MemoryBoardStore implements BoardStorePort {
  private readonly boards = new Map<BoardId, BoardRecord>()
  private readonly widgets = new Map<BoardWidgetId, BoardWidgetRecord>()
  private readonly jobs = new Map<WidgetDataJobId, WidgetDataJobRecord>()
  private readonly runs = new Map<string, WidgetJobRunRecord>()
  private presetsInstalled: Record<string, number> = {}

  async listBoards(): Promise<readonly BoardRecord[]> {
    return [...this.boards.values()]
  }

  async getBoard(boardId: BoardId): Promise<BoardRecord | null> {
    return this.boards.get(boardId) ?? null
  }

  async putBoard(board: BoardRecord): Promise<void> {
    this.boards.set(board.id, board)
  }

  async deleteBoard(boardId: BoardId): Promise<void> {
    const board = this.boards.get(boardId)
    if (!board) return
    this.boards.delete(boardId)
    const stillPlaced = new Set(
      [...this.boards.values()].flatMap((row) =>
        row.placements.map((item) => item.widgetId),
      ),
    )
    for (const widgetId of board.placements.map((item) => item.widgetId)) {
      if (!stillPlaced.has(widgetId)) this.deleteWidgetSync(widgetId)
    }
  }

  async getWidget(widgetId: BoardWidgetId): Promise<BoardWidgetRecord | null> {
    return this.widgets.get(widgetId) ?? null
  }

  async putWidget(widget: BoardWidgetRecord): Promise<void> {
    this.widgets.set(widget.id, widget)
  }

  async deleteWidget(widgetId: BoardWidgetId): Promise<void> {
    this.deleteWidgetSync(widgetId)
  }

  async getJob(jobId: WidgetDataJobId): Promise<WidgetDataJobRecord | null> {
    return this.jobs.get(jobId) ?? null
  }

  async getJobByWidgetId(
    widgetId: BoardWidgetId,
  ): Promise<WidgetDataJobRecord | null> {
    return (
      [...this.jobs.values()].find((job) => job.widgetId === widgetId) ?? null
    )
  }

  async putJob(job: WidgetDataJobRecord): Promise<void> {
    this.jobs.set(job.id, job)
  }

  async deleteJob(jobId: WidgetDataJobId): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return
    this.deleteJobAndRuns(jobId)
    const widget = this.widgets.get(job.widgetId)
    if (widget) this.widgets.set(widget.id, { ...widget, status: 'idle' })
  }

  async listRuns(jobId: WidgetDataJobId): Promise<readonly WidgetJobRunRecord[]> {
    return [...this.runs.values()]
      .filter((run) => run.jobId === jobId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  }

  async recordRun(run: WidgetJobRunRecord, data?: unknown): Promise<void> {
    const job = this.jobs.get(run.jobId)
    if (!job || !isJobRunnable(job)) {
      throw new BoardStorePortError({
        code: 'conflict',
        message: '作业尚未获批，不能运行',
        retriable: false,
      })
    }
    this.runs.set(run.id, run)
    const ordered = await this.listRuns(run.jobId)
    for (const stale of ordered.slice(
      0,
      Math.max(0, ordered.length - WIDGET_JOB_RUN_LIMIT),
    )) {
      this.runs.delete(stale.id)
    }
    const widget = this.widgets.get(run.widgetId)
    if (!widget) return
    const occurredAt = run.finishedAt ?? run.startedAt
    const next: BoardWidgetRecord = {
      ...widget,
      status: widgetStatusForRun(run.status),
      lastRunId: run.id,
      updatedAt: occurredAt,
    }
    if (run.status === 'success' && data !== undefined) {
      next.latestData = data
      next.latestDataAt = occurredAt
    }
    this.widgets.set(widget.id, next)
  }

  async commitAtomically(input: BoardAtomicCommitInput): Promise<void> {
    this.boards.set(
      input.board.id,
      mergeBoardForCommit(this.boards.get(input.board.id), input),
    )
    this.widgets.set(input.widget.id, input.widget)
    if (input.job) this.jobs.set(input.job.id, input.job)
  }

  async getInstalledPresets(): Promise<Readonly<Record<string, number>>> {
    return { ...this.presetsInstalled }
  }

  async recordPresetInstalled(presetId: string, version: number): Promise<void> {
    this.presetsInstalled = { ...this.presetsInstalled, [presetId]: version }
  }

  async appendPlacement(
    boardId: BoardId,
    placement: BoardPlacement,
  ): Promise<void> {
    const board = this.boards.get(boardId)
    if (!board) {
      throw new BoardStorePortError({
        code: 'not_found',
        message: '看板不存在',
        retriable: false,
      })
    }
    this.boards.set(boardId, {
      ...board,
      placements: [...board.placements, placement],
    })
  }

  private deleteWidgetSync(widgetId: BoardWidgetId): void {
    for (const board of this.boards.values()) {
      const placements = board.placements.filter(
        (item) => item.widgetId !== widgetId,
      )
      if (placements.length !== board.placements.length) {
        this.boards.set(board.id, { ...board, placements })
      }
    }
    const job = [...this.jobs.values()].find((row) => row.widgetId === widgetId)
    if (job) this.deleteJobAndRuns(job.id)
    this.widgets.delete(widgetId)
  }

  private deleteJobAndRuns(jobId: WidgetDataJobId): void {
    for (const run of this.runs.values()) {
      if (run.jobId === jobId) this.runs.delete(run.id)
    }
    this.jobs.delete(jobId)
  }
}

export function createMemoryBoardStore(): MemoryBoardStore {
  return new MemoryBoardStore()
}
