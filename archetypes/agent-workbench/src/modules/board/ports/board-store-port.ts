/**
 * BoardStorePort — durable Board / widget / job / run records.
 * Owned by the Board module; Composition opens the shared DB and injects the adapter.
 */

import type {
  BoardId,
  BoardPlacement,
  BoardRecord,
  BoardWidgetId,
  BoardWidgetRecord,
  WidgetDataJobId,
  WidgetDataJobRecord,
  WidgetJobRunRecord,
} from '../model/types'

export interface BoardStoreError {
  code:
    | 'quota_exceeded'
    | 'transaction_failed'
    | 'blocked'
    | 'open_failed'
    | 'not_found'
    | 'conflict'
    | 'unknown'
  message: string
  retriable: boolean
}

export class BoardStorePortError extends Error {
  readonly code: BoardStoreError['code']
  readonly retriable: boolean

  constructor(error: BoardStoreError) {
    super(error.message)
    this.name = 'BoardStorePortError'
    this.code = error.code
    this.retriable = error.retriable
  }
}

export interface BoardStorePort {
  listBoards(): Promise<readonly BoardRecord[]>

  getBoard(boardId: BoardId): Promise<BoardRecord | null>

  putBoard(board: BoardRecord): Promise<void>

  /** Cascade-delete exclusive widgets → their jobs → their runs. */
  deleteBoard(boardId: BoardId): Promise<void>

  getWidget(widgetId: BoardWidgetId): Promise<BoardWidgetRecord | null>

  putWidget(widget: BoardWidgetRecord): Promise<void>

  /** Cascade-delete the job and runs; strip the widget from every Board. */
  deleteWidget(widgetId: BoardWidgetId): Promise<void>

  getJob(jobId: WidgetDataJobId): Promise<WidgetDataJobRecord | null>

  getJobByWidgetId(widgetId: BoardWidgetId): Promise<WidgetDataJobRecord | null>

  putJob(job: WidgetDataJobRecord): Promise<void>

  /**
   * Remove the job and its runs. The widget stays, `status` returns to `idle`,
   * and `latestData` is left untouched.
   */
  deleteJob(jobId: WidgetDataJobId): Promise<void>

  listRuns(jobId: WidgetDataJobId): Promise<readonly WidgetJobRunRecord[]>

  /**
   * Persist a run (trimmed to the 10 most recent) and project it onto the widget.
   * `latestData` is written only when `run.status === 'success'`.
   */
  recordRun(run: WidgetJobRunRecord, data?: unknown): Promise<void>

  /** Append one placement. Never replaces the existing array. */
  appendPlacement(boardId: BoardId, placement: BoardPlacement): Promise<void>

  /**
   * Write board + widget + optional job in one transaction.
   * Any store failure aborts the whole commit — no half-written board.
   */
  commitAtomically(input: BoardAtomicCommitInput): Promise<void>

  /**
   * Preset install ledger (`metadata` / `board.presets.installed`).
   * Meaning is "ever installed", not "currently present".
   */
  getInstalledPresets(): Promise<Readonly<Record<string, number>>>

  recordPresetInstalled(presetId: string, version: number): Promise<void>
}

export interface BoardAtomicCommitInput {
  board: BoardRecord
  widget: BoardWidgetRecord
  job?: WidgetDataJobRecord
  /** Agent path: append onto the live board row. Never replace `placements`. */
  appendPlacement?: BoardPlacement
}

/** Merge a commit onto the live board row. New boards are written as given. */
export function mergeBoardForCommit(
  live: BoardRecord | undefined,
  input: BoardAtomicCommitInput,
): BoardRecord {
  if (!live) return input.board
  const alreadyPlaced = live.placements.some(
    (item) => item.widgetId === input.widget.id,
  )
  return {
    ...live,
    updatedAt: input.board.updatedAt,
    createdByTaskId: live.createdByTaskId ?? input.board.createdByTaskId,
    placements:
      input.appendPlacement && !alreadyPlaced
        ? [...live.placements, input.appendPlacement]
        : live.placements,
  }
}
