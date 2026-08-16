/**
 * IndexedDB adapter for BoardStorePort.
 * Requires a ready IDBDatabase from the shared shell (Composition open).
 */

import {
  idbRequest,
  mapIdbError,
  runTransaction,
  STORE_BOARDS,
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
} from '@/app/persistence/workbench-idb'
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
  type BoardStorePort,
} from '../ports/board-store-port'

const BOARD_STORES = [
  STORE_BOARDS,
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
] as const

export class IdbBoardStore implements BoardStorePort {
  constructor(private readonly db: IDBDatabase) {}

  async listBoards(): Promise<readonly BoardRecord[]> {
    try {
      return await runTransaction(
        this.db,
        STORE_BOARDS,
        'readonly',
        async (tx) =>
          idbRequest(tx.objectStore(STORE_BOARDS).getAll() as IDBRequest<BoardRecord[]>),
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async getBoard(boardId: BoardId): Promise<BoardRecord | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_BOARDS,
        'readonly',
        async (tx) => {
          const row = await idbRequest(
            tx.objectStore(STORE_BOARDS).get(boardId) as IDBRequest<
              BoardRecord | undefined
            >,
          )
          return row ?? null
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async putBoard(board: BoardRecord): Promise<void> {
    try {
      await runTransaction(this.db, STORE_BOARDS, 'readwrite', async (tx) => {
        await idbRequest(tx.objectStore(STORE_BOARDS).put(board))
      })
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async deleteBoard(boardId: BoardId): Promise<void> {
    try {
      await runTransaction(this.db, BOARD_STORES, 'readwrite', async (tx) => {
        const boards = tx.objectStore(STORE_BOARDS)
        const board = await idbRequest(
          boards.get(boardId) as IDBRequest<BoardRecord | undefined>,
        )
        if (!board) return
        await idbRequest(boards.delete(boardId))
        const remaining = await idbRequest(
          boards.getAll() as IDBRequest<BoardRecord[]>,
        )
        const stillPlaced = new Set(
          remaining.flatMap((row) => row.placements.map((item) => item.widgetId)),
        )
        const exclusive = new Set(
          board.placements
            .map((item) => item.widgetId)
            .filter((widgetId) => !stillPlaced.has(widgetId)),
        )
        for (const widgetId of exclusive) {
          await deleteWidgetInTx(tx, widgetId)
        }
      })
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async getWidget(widgetId: BoardWidgetId): Promise<BoardWidgetRecord | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_BOARD_WIDGETS,
        'readonly',
        async (tx) => {
          const row = await idbRequest(
            tx.objectStore(STORE_BOARD_WIDGETS).get(widgetId) as IDBRequest<
              BoardWidgetRecord | undefined
            >,
          )
          return row ?? null
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async putWidget(widget: BoardWidgetRecord): Promise<void> {
    try {
      await runTransaction(
        this.db,
        STORE_BOARD_WIDGETS,
        'readwrite',
        async (tx) => {
          await idbRequest(tx.objectStore(STORE_BOARD_WIDGETS).put(widget))
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async deleteWidget(widgetId: BoardWidgetId): Promise<void> {
    try {
      await runTransaction(this.db, BOARD_STORES, 'readwrite', async (tx) => {
        await deleteWidgetInTx(tx, widgetId)
      })
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async getJob(jobId: WidgetDataJobId): Promise<WidgetDataJobRecord | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_WIDGET_DATA_JOBS,
        'readonly',
        async (tx) => {
          const row = await idbRequest(
            tx.objectStore(STORE_WIDGET_DATA_JOBS).get(jobId) as IDBRequest<
              WidgetDataJobRecord | undefined
            >,
          )
          return row ?? null
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async getJobByWidgetId(
    widgetId: BoardWidgetId,
  ): Promise<WidgetDataJobRecord | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_WIDGET_DATA_JOBS,
        'readonly',
        async (tx) => {
          const row = await idbRequest(
            tx
              .objectStore(STORE_WIDGET_DATA_JOBS)
              .index('widgetId')
              .get(widgetId) as IDBRequest<WidgetDataJobRecord | undefined>,
          )
          return row ?? null
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async putJob(job: WidgetDataJobRecord): Promise<void> {
    try {
      await runTransaction(
        this.db,
        STORE_WIDGET_DATA_JOBS,
        'readwrite',
        async (tx) => {
          await idbRequest(tx.objectStore(STORE_WIDGET_DATA_JOBS).put(job))
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async deleteJob(jobId: WidgetDataJobId): Promise<void> {
    try {
      await runTransaction(this.db, BOARD_STORES, 'readwrite', async (tx) => {
        const jobs = tx.objectStore(STORE_WIDGET_DATA_JOBS)
        const job = await idbRequest(
          jobs.get(jobId) as IDBRequest<WidgetDataJobRecord | undefined>,
        )
        if (!job) return
        await deleteJobAndRunsInTx(tx, jobId)
        const widgets = tx.objectStore(STORE_BOARD_WIDGETS)
        const widget = await idbRequest(
          widgets.get(job.widgetId) as IDBRequest<BoardWidgetRecord | undefined>,
        )
        if (!widget) return
        await idbRequest(
          widgets.put({
            ...widget,
            status: 'idle',
            updatedAt: widget.updatedAt,
          }),
        )
      })
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async listRuns(jobId: WidgetDataJobId): Promise<readonly WidgetJobRunRecord[]> {
    try {
      const rows = await runTransaction(
        this.db,
        STORE_WIDGET_JOB_RUNS,
        'readonly',
        async (tx) =>
          idbRequest(
            tx
              .objectStore(STORE_WIDGET_JOB_RUNS)
              .index('jobId')
              .getAll(jobId) as IDBRequest<WidgetJobRunRecord[]>,
          ),
      )
      return [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async recordRun(run: WidgetJobRunRecord, data?: unknown): Promise<void> {
    try {
      await runTransaction(this.db, BOARD_STORES, 'readwrite', async (tx) => {
        const job = await idbRequest(
          tx.objectStore(STORE_WIDGET_DATA_JOBS).get(run.jobId) as IDBRequest<
            WidgetDataJobRecord | undefined
          >,
        )
        if (!job || !isJobRunnable(job)) {
          throw new BoardStorePortError({
            code: 'conflict',
            message: '作业尚未获批，不能运行',
            retriable: false,
          })
        }
        const runs = tx.objectStore(STORE_WIDGET_JOB_RUNS)
        await idbRequest(runs.put(run))
        const existing = await idbRequest(
          runs.index('jobId').getAll(run.jobId) as IDBRequest<WidgetJobRunRecord[]>,
        )
        const ordered = [...existing].sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt),
        )
        const overflow = ordered.slice(0, Math.max(0, ordered.length - WIDGET_JOB_RUN_LIMIT))
        for (const stale of overflow) {
          await idbRequest(runs.delete(stale.id))
        }

        const widgets = tx.objectStore(STORE_BOARD_WIDGETS)
        const widget = await idbRequest(
          widgets.get(run.widgetId) as IDBRequest<BoardWidgetRecord | undefined>,
        )
        if (!widget) return
        const next: BoardWidgetRecord = {
          ...widget,
          status: widgetStatusForRun(run.status),
          lastRunId: run.id,
          updatedAt: run.finishedAt ?? run.startedAt,
        }
        if (run.status === 'success' && data !== undefined) {
          next.latestData = data
          next.latestDataAt = run.finishedAt ?? run.startedAt
        }
        await idbRequest(widgets.put(next))
      })
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async appendPlacement(
    boardId: BoardId,
    placement: BoardPlacement,
  ): Promise<void> {
    try {
      await runTransaction(this.db, STORE_BOARDS, 'readwrite', async (tx) => {
        const boards = tx.objectStore(STORE_BOARDS)
        const board = await idbRequest(
          boards.get(boardId) as IDBRequest<BoardRecord | undefined>,
        )
        if (!board) {
          throw new BoardStorePortError({
            code: 'not_found',
            message: '看板不存在',
            retriable: false,
          })
        }
        await idbRequest(
          boards.put({
            ...board,
            placements: [...board.placements, placement],
          }),
        )
      })
    } catch (err) {
      throw toStoreError(err)
    }
  }
}

export function createIdbBoardStore(db: IDBDatabase): IdbBoardStore {
  return new IdbBoardStore(db)
}

async function deleteWidgetInTx(
  tx: IDBTransaction,
  widgetId: BoardWidgetId,
): Promise<void> {
  const boards = tx.objectStore(STORE_BOARDS)
  const allBoards = await idbRequest(
    boards.getAll() as IDBRequest<BoardRecord[]>,
  )
  for (const board of allBoards) {
    const next = board.placements.filter((item) => item.widgetId !== widgetId)
    if (next.length !== board.placements.length) {
      await idbRequest(boards.put({ ...board, placements: next }))
    }
  }

  const jobs = tx.objectStore(STORE_WIDGET_DATA_JOBS)
  const job = await idbRequest(
    jobs.index('widgetId').get(widgetId) as IDBRequest<
      WidgetDataJobRecord | undefined
    >,
  )
  if (job) {
    await deleteJobAndRunsInTx(tx, job.id)
  }
  await idbRequest(tx.objectStore(STORE_BOARD_WIDGETS).delete(widgetId))
}

async function deleteJobAndRunsInTx(
  tx: IDBTransaction,
  jobId: WidgetDataJobId,
): Promise<void> {
  const runs = tx.objectStore(STORE_WIDGET_JOB_RUNS)
  const keys = await idbRequest(
    runs.index('jobId').getAllKeys(jobId) as IDBRequest<IDBValidKey[]>,
  )
  for (const key of keys) {
    await idbRequest(runs.delete(key))
  }
  await idbRequest(tx.objectStore(STORE_WIDGET_DATA_JOBS).delete(jobId))
}

function toStoreError(err: unknown): BoardStorePortError {
  if (err instanceof BoardStorePortError) return err
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  ) {
    const e = err as { code: string; message?: string; retriable?: boolean }
    return new BoardStorePortError({
      code:
        (e.code as BoardStorePortError['code']) || 'unknown',
      message: e.message ?? '看板存储失败',
      retriable: e.retriable ?? false,
    })
  }
  const mapped = mapIdbError(
    err instanceof Error ? err : null,
    'unknown',
    '看板存储失败',
  )
  return new BoardStorePortError({
    code:
      mapped.code === 'quota_exceeded'
        ? 'quota_exceeded'
        : mapped.code === 'blocked'
          ? 'blocked'
          : mapped.code === 'open_failed'
            ? 'open_failed'
            : 'transaction_failed',
    message: mapped.message,
    retriable: mapped.retriable,
  })
}
