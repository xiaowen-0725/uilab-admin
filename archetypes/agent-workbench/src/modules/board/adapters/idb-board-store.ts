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
  STORE_METADATA,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
  type MetadataRecord,
} from '@/app/persistence/workbench-idb'
import {
  BOARD_PRESETS_INSTALLED_KEY,
  parsePresetMap,
} from '../model/preset-install'
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

const BOARD_STORES = [
  STORE_BOARDS,
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
] as const

type BoardStoreName = (typeof BOARD_STORES)[number]

export type IdbBoardStoreOptions = {
  /** Test-only: abort the atomic commit after earlier puts succeed. */
  failOnPutStore?: BoardStoreName
}

export class IdbBoardStore implements BoardStorePort {
  constructor(
    private readonly db: IDBDatabase,
    private readonly options: IdbBoardStoreOptions = {},
  ) {}

  listBoards(): Promise<readonly BoardRecord[]> {
    return this.read(STORE_BOARDS, (tx) => getAllRows<BoardRecord>(tx, STORE_BOARDS))
  }

  getBoard(boardId: BoardId): Promise<BoardRecord | null> {
    return this.get(STORE_BOARDS, boardId)
  }

  putBoard(board: BoardRecord): Promise<void> {
    return this.put(STORE_BOARDS, board)
  }

  deleteBoard(boardId: BoardId): Promise<void> {
    return this.write(BOARD_STORES, async (tx) => {
      const board = await getRow<BoardRecord>(tx, STORE_BOARDS, boardId)
      if (!board) return
      await remove(tx, STORE_BOARDS, boardId)

      const remaining = await getAllRows<BoardRecord>(tx, STORE_BOARDS)
      const stillPlaced = new Set(
        remaining.flatMap((row) => row.placements.map((item) => item.widgetId)),
      )
      for (const widgetId of board.placements.map((item) => item.widgetId)) {
        if (!stillPlaced.has(widgetId)) {
          await deleteWidgetInTx(tx, widgetId)
        }
      }
    })
  }

  getWidget(widgetId: BoardWidgetId): Promise<BoardWidgetRecord | null> {
    return this.get(STORE_BOARD_WIDGETS, widgetId)
  }

  putWidget(widget: BoardWidgetRecord): Promise<void> {
    return this.put(STORE_BOARD_WIDGETS, widget)
  }

  deleteWidget(widgetId: BoardWidgetId): Promise<void> {
    return this.write(BOARD_STORES, (tx) => deleteWidgetInTx(tx, widgetId))
  }

  getJob(jobId: WidgetDataJobId): Promise<WidgetDataJobRecord | null> {
    return this.get(STORE_WIDGET_DATA_JOBS, jobId)
  }

  getJobByWidgetId(widgetId: BoardWidgetId): Promise<WidgetDataJobRecord | null> {
    return this.read(STORE_WIDGET_DATA_JOBS, async (tx) => {
      const row = await getByIndex<WidgetDataJobRecord>(
        tx,
        STORE_WIDGET_DATA_JOBS,
        'widgetId',
        widgetId,
      )
      return row ?? null
    })
  }

  putJob(job: WidgetDataJobRecord): Promise<void> {
    return this.put(STORE_WIDGET_DATA_JOBS, job)
  }

  deleteJob(jobId: WidgetDataJobId): Promise<void> {
    return this.write(BOARD_STORES, async (tx) => {
      const job = await getRow<WidgetDataJobRecord>(tx, STORE_WIDGET_DATA_JOBS, jobId)
      if (!job) return
      await deleteJobAndRunsInTx(tx, jobId)
      const widget = await getRow<BoardWidgetRecord>(
        tx,
        STORE_BOARD_WIDGETS,
        job.widgetId,
      )
      if (!widget) return
      await putValue(tx, STORE_BOARD_WIDGETS, { ...widget, status: 'idle' })
    })
  }

  listRuns(jobId: WidgetDataJobId): Promise<readonly WidgetJobRunRecord[]> {
    return this.read(STORE_WIDGET_JOB_RUNS, async (tx) =>
      sortRunsByStartedAt(await getRunsForJob(tx, jobId)),
    )
  }

  recordRun(run: WidgetJobRunRecord, data?: unknown): Promise<void> {
    return this.write(BOARD_STORES, async (tx) => {
      const job = await getRow<WidgetDataJobRecord>(
        tx,
        STORE_WIDGET_DATA_JOBS,
        run.jobId,
      )
      if (!job || !isJobRunnable(job)) {
        throw new BoardStorePortError({
          code: 'conflict',
          message: '作业尚未获批，不能运行',
          retriable: false,
        })
      }

      await putValue(tx, STORE_WIDGET_JOB_RUNS, run)
      const ordered = sortRunsByStartedAt(await getRunsForJob(tx, run.jobId))
      const overflow = ordered.slice(
        0,
        Math.max(0, ordered.length - WIDGET_JOB_RUN_LIMIT),
      )
      for (const stale of overflow) {
        await remove(tx, STORE_WIDGET_JOB_RUNS, stale.id)
      }

      const widget = await getRow<BoardWidgetRecord>(
        tx,
        STORE_BOARD_WIDGETS,
        run.widgetId,
      )
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
      await putValue(tx, STORE_BOARD_WIDGETS, next)
    })
  }

  commitAtomically(input: BoardAtomicCommitInput): Promise<void> {
    return this.write(BOARD_STORES, async (tx) => {
      const live = await getRow<BoardRecord>(tx, STORE_BOARDS, input.board.id)
      await putValue(tx, STORE_BOARDS, mergeBoardForCommit(live, input))
      await putValue(tx, STORE_BOARD_WIDGETS, input.widget)
      if (this.options.failOnPutStore === STORE_WIDGET_DATA_JOBS) {
        throw new Error('injected widgetDataJobs write failure')
      }
      if (input.job) {
        await putValue(tx, STORE_WIDGET_DATA_JOBS, input.job)
      }
    })
  }

  getInstalledPresets(): Promise<Readonly<Record<string, number>>> {
    return this.readMetadata((row) => parsePresetMap(row?.value))
  }

  recordPresetInstalled(presetId: string, version: number): Promise<void> {
    return this.writeMetadata((current) => ({
      ...current,
      [presetId]: version,
    }))
  }

  appendPlacement(boardId: BoardId, placement: BoardPlacement): Promise<void> {
    return this.write(STORE_BOARDS, async (tx) => {
      const board = await getRow<BoardRecord>(tx, STORE_BOARDS, boardId)
      if (!board) {
        throw new BoardStorePortError({
          code: 'not_found',
          message: '看板不存在',
          retriable: false,
        })
      }
      await putValue(tx, STORE_BOARDS, {
        ...board,
        placements: [...board.placements, placement],
      })
    })
  }

  private get<T>(store: BoardStoreName, key: IDBValidKey): Promise<T | null> {
    return this.read(store, async (tx) => (await getRow<T>(tx, store, key)) ?? null)
  }

  private put(store: BoardStoreName, value: unknown): Promise<void> {
    return this.write(store, (tx) => putValue(tx, store, value))
  }

  private read<T>(
    store: BoardStoreName | readonly BoardStoreName[],
    fn: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    return this.transact(store, 'readonly', fn)
  }

  private write(
    store: BoardStoreName | readonly BoardStoreName[],
    fn: (tx: IDBTransaction) => Promise<void>,
  ): Promise<void> {
    return this.transact(store, 'readwrite', fn)
  }

  private async transact<T>(
    store: BoardStoreName | readonly BoardStoreName[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await runTransaction(this.db, store, mode, fn)
    } catch (err) {
      throw toStoreError(err)
    }
  }

  private async readMetadata<T>(
    fn: (row: MetadataRecord | undefined) => T,
  ): Promise<T> {
    try {
      return await runTransaction(
        this.db,
        STORE_METADATA,
        'readonly',
        async (tx) => fn(await getMetadataRow(tx)),
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  private async writeMetadata(
    next: (current: Record<string, number>) => Record<string, number>,
  ): Promise<void> {
    try {
      await runTransaction(this.db, STORE_METADATA, 'readwrite', async (tx) => {
        const current = parsePresetMap((await getMetadataRow(tx))?.value)
        await idbRequest(
          tx.objectStore(STORE_METADATA).put({
            key: BOARD_PRESETS_INSTALLED_KEY,
            value: next(current),
          } satisfies MetadataRecord),
        )
      })
    } catch (err) {
      throw toStoreError(err)
    }
  }
}

export function createIdbBoardStore(
  db: IDBDatabase,
  options?: IdbBoardStoreOptions,
): IdbBoardStore {
  return new IdbBoardStore(db, options)
}

async function deleteWidgetInTx(
  tx: IDBTransaction,
  widgetId: BoardWidgetId,
): Promise<void> {
  const boards = await getAllRows<BoardRecord>(tx, STORE_BOARDS)
  for (const board of boards) {
    const placements = board.placements.filter((item) => item.widgetId !== widgetId)
    if (placements.length !== board.placements.length) {
      await putValue(tx, STORE_BOARDS, { ...board, placements })
    }
  }

  const job = await getByIndex<WidgetDataJobRecord>(
    tx,
    STORE_WIDGET_DATA_JOBS,
    'widgetId',
    widgetId,
  )
  if (job) {
    await deleteJobAndRunsInTx(tx, job.id)
  }
  await remove(tx, STORE_BOARD_WIDGETS, widgetId)
}

async function deleteJobAndRunsInTx(
  tx: IDBTransaction,
  jobId: WidgetDataJobId,
): Promise<void> {
  const keys = await idbRequest(
    tx
      .objectStore(STORE_WIDGET_JOB_RUNS)
      .index('jobId')
      .getAllKeys(jobId) as IDBRequest<IDBValidKey[]>,
  )
  for (const key of keys) {
    await remove(tx, STORE_WIDGET_JOB_RUNS, key)
  }
  await remove(tx, STORE_WIDGET_DATA_JOBS, jobId)
}

async function getRow<T>(
  tx: IDBTransaction,
  store: BoardStoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  return idbRequest(tx.objectStore(store).get(key) as IDBRequest<T | undefined>)
}

async function getAllRows<T>(
  tx: IDBTransaction,
  store: BoardStoreName,
): Promise<T[]> {
  return idbRequest(tx.objectStore(store).getAll() as IDBRequest<T[]>)
}

async function getByIndex<T>(
  tx: IDBTransaction,
  store: BoardStoreName,
  indexName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return idbRequest(
    tx.objectStore(store).index(indexName).get(key) as IDBRequest<T | undefined>,
  )
}

async function putValue(
  tx: IDBTransaction,
  store: BoardStoreName,
  value: unknown,
): Promise<void> {
  await idbRequest(tx.objectStore(store).put(value))
}

async function remove(
  tx: IDBTransaction,
  store: BoardStoreName,
  key: IDBValidKey,
): Promise<void> {
  await idbRequest(tx.objectStore(store).delete(key))
}

async function getRunsForJob(
  tx: IDBTransaction,
  jobId: WidgetDataJobId,
): Promise<WidgetJobRunRecord[]> {
  return idbRequest(
    tx
      .objectStore(STORE_WIDGET_JOB_RUNS)
      .index('jobId')
      .getAll(jobId) as IDBRequest<WidgetJobRunRecord[]>,
  )
}

function sortRunsByStartedAt(
  rows: readonly WidgetJobRunRecord[],
): WidgetJobRunRecord[] {
  return [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

async function getMetadataRow(
  tx: IDBTransaction,
): Promise<MetadataRecord | undefined> {
  return idbRequest(
    tx
      .objectStore(STORE_METADATA)
      .get(BOARD_PRESETS_INSTALLED_KEY) as IDBRequest<MetadataRecord | undefined>,
  )
}

function toStoreError(err: unknown): BoardStorePortError {
  if (err instanceof BoardStorePortError) return err
  if (hasErrorCode(err)) {
    return new BoardStorePortError({
      code: err.code || 'unknown',
      message: err.message ?? '看板存储失败',
      retriable: err.retriable ?? false,
    })
  }
  const mapped = mapIdbError(
    err instanceof Error ? err : null,
    'unknown',
    '看板存储失败',
  )
  return new BoardStorePortError({
    code: mappedStoreCode(mapped.code),
    message: mapped.message,
    retriable: mapped.retriable,
  })
}

function hasErrorCode(err: unknown): err is {
  code: BoardStorePortError['code']
  message?: string
  retriable?: boolean
} {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  )
}

function mappedStoreCode(
  code: string,
): BoardStorePortError['code'] {
  if (code === 'quota_exceeded') return 'quota_exceeded'
  if (code === 'blocked') return 'blocked'
  if (code === 'open_failed') return 'open_failed'
  return 'transaction_failed'
}
