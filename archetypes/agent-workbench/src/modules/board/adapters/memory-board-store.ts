/**
 * In-memory BoardStorePort for tests and Memory boot.
 */

import {
  resolveScheduleClaim,
  snapshotWriteRejected,
  type ClaimScheduleLeaseInput,
  type ClaimScheduleLeaseResult,
  type ScheduleLeaseRecord,
} from '../model/schedule-lease'
import {
  hydrateWidgetFromSnapshot,
  jobSourceWrite,
  missingPresetSource,
  persistableWidgetRow,
  snapshotFromWidgetCompat,
  snapshotStorageKey,
  successSnapshotForRun,
  widgetRowAfterRun,
} from '../model/data-source'
import {
  ANONYMOUS_PRINCIPAL_KEY,
  WIDGET_JOB_RUN_LIMIT,
  isJobRunnable,
  type BoardId,
  type BoardPlacement,
  type BoardRecord,
  type BoardWidgetId,
  type BoardWidgetRecord,
  type WidgetDataJobId,
  type WidgetDataJobRecord,
  type WidgetDataSnapshotRecord,
  type WidgetDataSourceId,
  type WidgetDataSourceRecord,
  type WidgetJobRunRecord,
} from '../model/types'
import {
  BoardStorePortError,
  mergeBoardForCommit,
  type BoardAtomicCommitInput,
  type BoardRunCommitOptions,
  type BoardSnapshotReadOptions,
  type BoardStorePort,
  type BoardStructureFilter,
  type IdentityBarrierInput,
} from '../ports/board-store-port'

export class MemoryBoardStore implements BoardStorePort {
  private readonly boards = new Map<BoardId, BoardRecord>()
  private readonly widgets = new Map<BoardWidgetId, BoardWidgetRecord>()
  private readonly jobs = new Map<WidgetDataJobId, WidgetDataJobRecord>()
  private readonly runs = new Map<string, WidgetJobRunRecord>()
  private readonly sources = new Map<WidgetDataSourceId, WidgetDataSourceRecord>()
  private readonly snapshots = new Map<string, WidgetDataSnapshotRecord>()
  private readonly identityEpochs = new Map<string, number>()
  private readonly liveExecutions = new Map<string, string>()
  private readonly leases = new Map<string, ScheduleLeaseRecord>()
  private presetsInstalled: Record<string, number> = {}
  private capableTaskIds: string[] = []

  async listBoards(_filter?: BoardStructureFilter): Promise<readonly BoardRecord[]> {
    return [...this.boards.values()]
  }

  async getBoard(
    boardId: BoardId,
    _filter?: BoardStructureFilter,
  ): Promise<BoardRecord | null> {
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

  async getWidget(
    widgetId: BoardWidgetId,
    options?: BoardSnapshotReadOptions,
  ): Promise<BoardWidgetRecord | null> {
    const row = this.widgets.get(widgetId)
    if (!row) return null
    const principalKey = options?.principalKey ?? ANONYMOUS_PRINCIPAL_KEY
    const snapshot = this.snapshots.get(snapshotStorageKey(widgetId, principalKey))
    return hydrateWidgetFromSnapshot(row, snapshot, principalKey)
  }

  async putWidget(
    widget: BoardWidgetRecord,
    options?: BoardSnapshotReadOptions,
  ): Promise<void> {
    this.writeWidgetRow(widget, options?.principalKey)
  }

  async getDataSource(
    sourceId: WidgetDataSourceId,
  ): Promise<WidgetDataSourceRecord | null> {
    return this.sources.get(sourceId) ?? null
  }

  async getDataSourceByWidgetId(
    widgetId: BoardWidgetId,
  ): Promise<WidgetDataSourceRecord | null> {
    return this.sourceForWidget(widgetId)
  }

  async putDataSource(source: WidgetDataSourceRecord): Promise<void> {
    this.sources.set(source.id, source)
  }

  async getSnapshot(
    widgetId: BoardWidgetId,
    principalKey: string,
  ): Promise<WidgetDataSnapshotRecord | null> {
    return this.snapshots.get(snapshotStorageKey(widgetId, principalKey)) ?? null
  }

  async putSnapshot(snapshot: WidgetDataSnapshotRecord): Promise<void> {
    this.snapshots.set(
      snapshotStorageKey(snapshot.widgetId, snapshot.principalKey),
      snapshot,
    )
  }

  async listSnapshots(
    widgetId: BoardWidgetId,
  ): Promise<readonly WidgetDataSnapshotRecord[]> {
    return [...this.snapshots.values()].filter((row) => row.widgetId === widgetId)
  }

  async deleteSnapshot(
    widgetId: BoardWidgetId,
    principalKey: string,
  ): Promise<void> {
    this.snapshots.delete(snapshotStorageKey(widgetId, principalKey))
  }

  async applyIdentityBarrier(input: IdentityBarrierInput): Promise<void> {
    this.identityEpochs.set(input.principalKey, input.generation)
    for (const [key, principal] of [...this.liveExecutions]) {
      if (principal === input.principalKey) this.liveExecutions.delete(key)
    }
    for (const [id, lease] of [...this.leases]) {
      if (lease.principalKey === input.principalKey) this.leases.delete(id)
    }
    if (!input.deleteSnapshots) return
    for (const [key, snapshot] of this.snapshots) {
      if (snapshot.principalKey === input.principalKey) {
        this.snapshots.delete(key)
      }
    }
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
    return this.jobForWidget(widgetId)
  }

  async putJob(job: WidgetDataJobRecord): Promise<void> {
    this.jobs.set(job.id, job)
    this.ensureJobSource(job)
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

  async recordRun(
    run: WidgetJobRunRecord,
    data?: unknown,
    options?: BoardRunCommitOptions,
  ): Promise<void> {
    const job = this.jobs.get(run.jobId)
    if ((job && !isJobRunnable(job)) || (!job && !options?.allowMissingJob)) {
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
    const principalKey = options?.principalKey ?? ANONYMOUS_PRINCIPAL_KEY
    if (run.status === 'running' && options?.executionKey) {
      this.liveExecutions.set(options.executionKey, principalKey)
    }
    const snapshot = successSnapshotForRun(
      widget.id,
      run,
      data,
      principalKey,
    )
    const source = this.sourceForWidget(run.widgetId)
    const lease = source ? this.leases.get(source.id) : undefined
    if (
      snapshot &&
      !snapshotWriteRejected(
        options,
        this.identityEpochs.get(principalKey),
        Object.fromEntries(this.liveExecutions),
        lease,
      )
    ) {
      await this.putSnapshot(snapshot)
    }
    if (run.status !== 'running' && options?.executionKey) {
      this.liveExecutions.delete(options.executionKey)
    }
    this.widgets.set(widget.id, widgetRowAfterRun(widget, run))
  }

  async claimScheduleLease(
    input: ClaimScheduleLeaseInput,
  ): Promise<ClaimScheduleLeaseResult> {
    const current = this.leases.get(input.sourceId)
    const result = resolveScheduleClaim(current, input)
    if (!result.ok) return result
    if (current?.executionKey && current.executionKey !== input.executionKey) {
      this.liveExecutions.delete(current.executionKey)
    }
    this.leases.set(input.sourceId, result.lease)
    return result
  }

  async getScheduleLease(sourceId: string): Promise<ScheduleLeaseRecord | null> {
    return this.leases.get(sourceId) ?? null
  }

  async releaseScheduleLease(
    sourceId: string,
    executionKey: string,
  ): Promise<void> {
    const current = this.leases.get(sourceId)
    if (current?.executionKey === executionKey) this.leases.delete(sourceId)
  }

  async commitAtomically(input: BoardAtomicCommitInput): Promise<void> {
    this.boards.set(
      input.board.id,
      mergeBoardForCommit(this.boards.get(input.board.id), input),
    )
    this.writeWidgetRow(input.widget)
    if (input.job) {
      this.jobs.set(input.job.id, input.job)
      this.ensureJobSource(input.job)
    }
    if (input.dataSource) this.sources.set(input.dataSource.id, input.dataSource)
  }

  async getInstalledPresets(): Promise<Readonly<Record<string, number>>> {
    return { ...this.presetsInstalled }
  }

  async recordPresetInstalled(presetId: string, version: number): Promise<void> {
    this.presetsInstalled = { ...this.presetsInstalled, [presetId]: version }
  }

  async listBoardCapableTaskIds(): Promise<readonly string[]> {
    return [...this.capableTaskIds]
  }

  async grantBoardCapability(taskId: string): Promise<void> {
    const id = taskId.trim()
    if (!id || this.capableTaskIds.includes(id)) return
    this.capableTaskIds = [...this.capableTaskIds, id]
  }

  async hasBoardCreatedByTask(taskId: string): Promise<boolean> {
    const id = taskId.trim()
    if (!id) return false
    for (const board of this.boards.values()) {
      if (board.createdByTaskId === id) return true
      for (const placement of board.placements) {
        if (this.widgets.get(placement.widgetId)?.createdByTaskId === id) {
          return true
        }
      }
    }
    return false
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

  private sourceForWidget(
    widgetId: BoardWidgetId,
  ): WidgetDataSourceRecord | null {
    return (
      [...this.sources.values()].find((source) => source.widgetId === widgetId) ??
      null
    )
  }

  private jobForWidget(widgetId: BoardWidgetId): WidgetDataJobRecord | null {
    return [...this.jobs.values()].find((job) => job.widgetId === widgetId) ?? null
  }

  private writeWidgetRow(
    widget: BoardWidgetRecord,
    principalKey = ANONYMOUS_PRINCIPAL_KEY,
  ): void {
    const snapshot = snapshotFromWidgetCompat(widget, principalKey)
    if (snapshot) {
      this.snapshots.set(
        snapshotStorageKey(snapshot.widgetId, snapshot.principalKey),
        snapshot,
      )
    }
    this.widgets.set(widget.id, persistableWidgetRow(widget))
    const preset = missingPresetSource(this.sourceForWidget(widget.id), widget)
    if (preset) this.sources.set(preset.id, preset)
  }

  private ensureJobSource(job: WidgetDataJobRecord): void {
    const write = jobSourceWrite(this.sourceForWidget(job.widgetId), job)
    if (!write) return
    if (write.staleId) this.sources.delete(write.staleId)
    this.sources.set(write.next.id, write.next)
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
    const job = this.jobForWidget(widgetId)
    if (job) this.deleteJobAndRuns(job.id)
    for (const source of [...this.sources.values()]) {
      if (source.widgetId === widgetId) {
        this.leases.delete(source.id)
        this.sources.delete(source.id)
      }
    }
    for (const [key, snapshot] of this.snapshots) {
      if (snapshot.widgetId === widgetId) this.snapshots.delete(key)
    }
    this.widgets.delete(widgetId)
  }

  private deleteJobAndRuns(jobId: WidgetDataJobId): void {
    for (const run of this.runs.values()) {
      if (run.jobId === jobId) this.runs.delete(run.id)
    }
    this.jobs.delete(jobId)
    for (const source of [...this.sources.values()]) {
      if (source.jobId === jobId) {
        this.leases.delete(source.id)
        this.sources.delete(source.id)
      }
    }
  }
}

export function createMemoryBoardStore(): MemoryBoardStore {
  return new MemoryBoardStore()
}
