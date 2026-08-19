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
  STORE_WIDGET_DATA_SNAPSHOTS,
  STORE_WIDGET_DATA_SOURCES,
  STORE_WIDGET_JOB_RUNS,
  type MetadataRecord,
} from '@/app/persistence/workbench-idb'
import {
  BOARD_CAPABLE_TASK_IDS_KEY,
  parseTaskIdList,
} from '../model/board-capability-ledger'
import {
  IDENTITY_LIVE_EXECUTIONS_KEY,
  commitFenceRejects,
  identityEpochMetadataKey,
  parseLiveExecutions,
} from '../model/identity-barrier'
import {
  hydrateWidgetFromSnapshot,
  jobSourceWrite,
  missingPresetSource,
  persistableWidgetRow,
  snapshotFromWidgetCompat,
  successSnapshotForRun,
  widgetRowAfterRun,
} from '../model/data-source'
import {
  BOARD_PRESETS_INSTALLED_KEY,
  parsePresetMap,
} from '../model/preset-install'
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

const BOARD_STORES = [
  STORE_BOARDS,
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_JOB_RUNS,
  STORE_WIDGET_DATA_SOURCES,
  STORE_WIDGET_DATA_SNAPSHOTS,
] as const

const WIDGET_WRITE_STORES = [
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_SNAPSHOTS,
  STORE_WIDGET_DATA_SOURCES,
] as const

const MIGRATE_STORES = [
  STORE_BOARD_WIDGETS,
  STORE_WIDGET_DATA_JOBS,
  STORE_WIDGET_DATA_SOURCES,
  STORE_WIDGET_DATA_SNAPSHOTS,
] as const

const RECORD_RUN_STORES = [...BOARD_STORES, STORE_METADATA] as const

const IDENTITY_BARRIER_STORES = [
  STORE_WIDGET_DATA_SNAPSHOTS,
  STORE_METADATA,
] as const

type BoardStoreName = (typeof BOARD_STORES)[number]
type TxStore = BoardStoreName | typeof STORE_METADATA
type TxStores = TxStore | readonly TxStore[]

export type IdbBoardStoreOptions = {
  /** Test-only: abort the atomic commit after earlier puts succeed. */
  failOnPutStore?: BoardStoreName
}

export class IdbBoardStore implements BoardStorePort {
  private migratePromise: Promise<void> | null = null

  constructor(
    private readonly db: IDBDatabase,
    private readonly options: IdbBoardStoreOptions = {},
  ) {}

  listBoards(_filter?: BoardStructureFilter): Promise<readonly BoardRecord[]> {
    return this.afterMigrate(() =>
      this.read(STORE_BOARDS, (tx) => getAllRows<BoardRecord>(tx, STORE_BOARDS)),
    )
  }

  getBoard(
    boardId: BoardId,
    _filter?: BoardStructureFilter,
  ): Promise<BoardRecord | null> {
    return this.afterMigrate(() => this.get(STORE_BOARDS, boardId))
  }

  putBoard(board: BoardRecord): Promise<void> {
    return this.put(STORE_BOARDS, board)
  }

  deleteBoard(boardId: BoardId): Promise<void> {
    return this.afterMigrate(() => this.write(BOARD_STORES, async (tx) => {
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
    }))
  }

  getWidget(
    widgetId: BoardWidgetId,
    options?: BoardSnapshotReadOptions,
  ): Promise<BoardWidgetRecord | null> {
    const principalKey = options?.principalKey ?? ANONYMOUS_PRINCIPAL_KEY
    return this.afterMigrate(() =>
      this.read([STORE_BOARD_WIDGETS, STORE_WIDGET_DATA_SNAPSHOTS], async (tx) => {
        const row = await getRow<BoardWidgetRecord>(tx, STORE_BOARD_WIDGETS, widgetId)
        if (!row) return null
        const snapshot = await getSnapshotRow(tx, widgetId, principalKey)
        return hydrateWidgetFromSnapshot(row, snapshot, principalKey)
      }),
    )
  }

  putWidget(
    widget: BoardWidgetRecord,
    options?: BoardSnapshotReadOptions,
  ): Promise<void> {
    return this.afterMigrate(() =>
      this.write(WIDGET_WRITE_STORES, (tx) =>
        writeWidgetInTx(tx, widget, options?.principalKey),
      ),
    )
  }

  deleteWidget(widgetId: BoardWidgetId): Promise<void> {
    return this.afterMigrate(() =>
      this.write(BOARD_STORES, (tx) => deleteWidgetInTx(tx, widgetId)),
    )
  }

  getDataSource(
    sourceId: WidgetDataSourceId,
  ): Promise<WidgetDataSourceRecord | null> {
    return this.afterMigrate(() => this.get(STORE_WIDGET_DATA_SOURCES, sourceId))
  }

  getDataSourceByWidgetId(
    widgetId: BoardWidgetId,
  ): Promise<WidgetDataSourceRecord | null> {
    return this.afterMigrate(() =>
      this.read(STORE_WIDGET_DATA_SOURCES, async (tx) => {
        return (await sourceByWidgetInTx(tx, widgetId)) ?? null
      }),
    )
  }

  putDataSource(source: WidgetDataSourceRecord): Promise<void> {
    return this.afterMigrate(() => this.put(STORE_WIDGET_DATA_SOURCES, source))
  }

  getSnapshot(
    widgetId: BoardWidgetId,
    principalKey: string,
  ): Promise<WidgetDataSnapshotRecord | null> {
    return this.afterMigrate(() =>
      this.read(STORE_WIDGET_DATA_SNAPSHOTS, async (tx) => {
        return (await getSnapshotRow(tx, widgetId, principalKey)) ?? null
      }),
    )
  }

  putSnapshot(snapshot: WidgetDataSnapshotRecord): Promise<void> {
    return this.afterMigrate(() =>
      this.put(STORE_WIDGET_DATA_SNAPSHOTS, snapshot),
    )
  }

  listSnapshots(
    widgetId: BoardWidgetId,
  ): Promise<readonly WidgetDataSnapshotRecord[]> {
    return this.afterMigrate(() =>
      this.read(STORE_WIDGET_DATA_SNAPSHOTS, (tx) =>
        listSnapshotsForWidget(tx, widgetId),
      ),
    )
  }

  deleteSnapshot(
    widgetId: BoardWidgetId,
    principalKey: string,
  ): Promise<void> {
    return this.afterMigrate(() =>
      this.write(STORE_WIDGET_DATA_SNAPSHOTS, (tx) =>
        remove(tx, STORE_WIDGET_DATA_SNAPSHOTS, [widgetId, principalKey]),
      ),
    )
  }

  applyIdentityBarrier(input: IdentityBarrierInput): Promise<void> {
    return this.afterMigrate(() =>
      this.write(IDENTITY_BARRIER_STORES, async (tx) => {
        await putValue(tx, STORE_METADATA, {
          key: identityEpochMetadataKey(input.principalKey),
          value: input.generation,
        } satisfies MetadataRecord)
        const live = parseLiveExecutions(
          (await getMetadataRow(tx, IDENTITY_LIVE_EXECUTIONS_KEY))?.value,
        )
        for (const [key, principal] of Object.entries(live)) {
          if (principal === input.principalKey) delete live[key]
        }
        await putValue(tx, STORE_METADATA, {
          key: IDENTITY_LIVE_EXECUTIONS_KEY,
          value: live,
        } satisfies MetadataRecord)
        if (!input.deleteSnapshots) return
        const rows = await getAllRows<WidgetDataSnapshotRecord>(
          tx,
          STORE_WIDGET_DATA_SNAPSHOTS,
        )
        for (const row of rows) {
          if (row.principalKey === input.principalKey) {
            await remove(tx, STORE_WIDGET_DATA_SNAPSHOTS, [
              row.widgetId,
              row.principalKey,
            ])
          }
        }
      }),
    )
  }

  getJob(jobId: WidgetDataJobId): Promise<WidgetDataJobRecord | null> {
    return this.afterMigrate(() => this.get(STORE_WIDGET_DATA_JOBS, jobId))
  }

  getJobByWidgetId(widgetId: BoardWidgetId): Promise<WidgetDataJobRecord | null> {
    return this.afterMigrate(() =>
      this.read(STORE_WIDGET_DATA_JOBS, async (tx) => {
        const row = await getByIndex<WidgetDataJobRecord>(
          tx,
          STORE_WIDGET_DATA_JOBS,
          'widgetId',
          widgetId,
        )
        return row ?? null
      }),
    )
  }

  putJob(job: WidgetDataJobRecord): Promise<void> {
    return this.afterMigrate(() =>
      this.write(
        [STORE_WIDGET_DATA_JOBS, STORE_WIDGET_DATA_SOURCES],
        async (tx) => {
          await putValue(tx, STORE_WIDGET_DATA_JOBS, job)
          await ensureJobSourceInTx(tx, job)
        },
      ),
    )
  }

  deleteJob(jobId: WidgetDataJobId): Promise<void> {
    return this.afterMigrate(() => this.write(BOARD_STORES, async (tx) => {
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
    }))
  }

  listRuns(jobId: WidgetDataJobId): Promise<readonly WidgetJobRunRecord[]> {
    return this.afterMigrate(() =>
      this.read(STORE_WIDGET_JOB_RUNS, async (tx) =>
        sortRunsByStartedAt(await getRunsForJob(tx, jobId)),
      ),
    )
  }

  recordRun(
    run: WidgetJobRunRecord,
    data?: unknown,
    options?: BoardRunCommitOptions,
  ): Promise<void> {
    return this.afterMigrate(() => this.write(RECORD_RUN_STORES, async (tx) => {
      const job = await getRow<WidgetDataJobRecord>(
        tx,
        STORE_WIDGET_DATA_JOBS,
        run.jobId,
      )
      if (job && !isJobRunnable(job)) {
        throw new BoardStorePortError({
          code: 'conflict',
          message: '作业尚未获批，不能运行',
          retriable: false,
        })
      }
      if (!job && !options?.allowMissingJob) {
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
      const principalKey = options?.principalKey ?? ANONYMOUS_PRINCIPAL_KEY
      const live = parseLiveExecutions(
        (await getMetadataRow(tx, IDENTITY_LIVE_EXECUTIONS_KEY))?.value,
      )
      if (run.status === 'running' && options?.executionKey) {
        live[options.executionKey] = principalKey
        await putValue(tx, STORE_METADATA, {
          key: IDENTITY_LIVE_EXECUTIONS_KEY,
          value: live,
        } satisfies MetadataRecord)
      }
      const snapshot = successSnapshotForRun(
        widget.id,
        run,
        data,
        principalKey,
      )
      const epoch = parseEpoch(
        (await getMetadataRow(tx, identityEpochMetadataKey(principalKey)))?.value,
      )
      if (
        snapshot &&
        !commitFenceRejects(
          options?.expectedGeneration,
          epoch,
          options?.executionKey,
          live,
        )
      ) {
        await putValue(tx, STORE_WIDGET_DATA_SNAPSHOTS, snapshot)
      }
      if (run.status !== 'running' && options?.executionKey) {
        delete live[options.executionKey]
        await putValue(tx, STORE_METADATA, {
          key: IDENTITY_LIVE_EXECUTIONS_KEY,
          value: live,
        } satisfies MetadataRecord)
      }
      await putValue(tx, STORE_BOARD_WIDGETS, widgetRowAfterRun(widget, run))
    }))
  }

  commitAtomically(input: BoardAtomicCommitInput): Promise<void> {
    return this.afterMigrate(() => this.write(BOARD_STORES, async (tx) => {
      const live = await getRow<BoardRecord>(tx, STORE_BOARDS, input.board.id)
      await putValue(tx, STORE_BOARDS, mergeBoardForCommit(live, input))
      await writeWidgetInTx(tx, input.widget)
      if (this.options.failOnPutStore === STORE_WIDGET_DATA_JOBS) {
        throw new Error('injected widgetDataJobs write failure')
      }
      if (input.job) {
        await putValue(tx, STORE_WIDGET_DATA_JOBS, input.job)
        await ensureJobSourceInTx(tx, input.job)
      }
      if (input.dataSource) {
        await putValue(tx, STORE_WIDGET_DATA_SOURCES, input.dataSource)
      }
    }))
  }

  getInstalledPresets(): Promise<Readonly<Record<string, number>>> {
    return this.read(STORE_METADATA, async (tx) =>
      parsePresetMap((await getMetadataRow(tx, BOARD_PRESETS_INSTALLED_KEY))?.value),
    )
  }

  recordPresetInstalled(presetId: string, version: number): Promise<void> {
    return this.write(STORE_METADATA, async (tx) => {
      const current = parsePresetMap(
        (await getMetadataRow(tx, BOARD_PRESETS_INSTALLED_KEY))?.value,
      )
      await putValue(tx, STORE_METADATA, {
        key: BOARD_PRESETS_INSTALLED_KEY,
        value: { ...current, [presetId]: version },
      } satisfies MetadataRecord)
    })
  }

  listBoardCapableTaskIds(): Promise<readonly string[]> {
    return this.read(STORE_METADATA, async (tx) =>
      parseTaskIdList((await getMetadataRow(tx, BOARD_CAPABLE_TASK_IDS_KEY))?.value),
    )
  }

  grantBoardCapability(taskId: string): Promise<void> {
    const id = taskId.trim()
    if (!id) return Promise.resolve()
    return this.write(STORE_METADATA, async (tx) => {
      const current = parseTaskIdList(
        (await getMetadataRow(tx, BOARD_CAPABLE_TASK_IDS_KEY))?.value,
      )
      if (current.includes(id)) return
      await putValue(tx, STORE_METADATA, {
        key: BOARD_CAPABLE_TASK_IDS_KEY,
        value: [...current, id],
      } satisfies MetadataRecord)
    })
  }

  hasBoardCreatedByTask(taskId: string): Promise<boolean> {
    const id = taskId.trim()
    if (!id) return Promise.resolve(false)
    return this.read([STORE_BOARDS, STORE_BOARD_WIDGETS], async (tx) => {
      const boards = await getAllRows<BoardRecord>(tx, STORE_BOARDS)
      for (const board of boards) {
        if (board.createdByTaskId === id) return true
        for (const placement of board.placements) {
          const widget = await getRow<BoardWidgetRecord>(
            tx,
            STORE_BOARD_WIDGETS,
            placement.widgetId,
          )
          if (widget?.createdByTaskId === id) return true
        }
      }
      return false
    })
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
    store: TxStores,
    fn: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    return this.transact(store, 'readonly', fn)
  }

  private write(
    store: TxStores,
    fn: (tx: IDBTransaction) => Promise<void>,
  ): Promise<void> {
    return this.transact(store, 'readwrite', fn)
  }

  private async transact<T>(
    store: TxStores,
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await runTransaction(this.db, store, mode, fn)
    } catch (err) {
      throw toStoreError(err)
    }
  }

  private afterMigrate<T>(fn: () => Promise<T>): Promise<T> {
    this.migratePromise ??= this.migrateLegacyRows()
    return this.migratePromise.then(fn)
  }

  private migrateLegacyRows(): Promise<void> {
    return this.write(MIGRATE_STORES, async (tx) => {
      const jobs = await getAllRows<WidgetDataJobRecord>(
        tx,
        STORE_WIDGET_DATA_JOBS,
      )
      const jobByWidget = new Map(jobs.map((job) => [job.widgetId, job]))
      for (const widget of await getAllRows<BoardWidgetRecord>(
        tx,
        STORE_BOARD_WIDGETS,
      )) {
        const snapshot = snapshotFromWidgetCompat(widget)
        if (snapshot) {
          const existing = await getSnapshotRow(
            tx,
            widget.id,
            ANONYMOUS_PRINCIPAL_KEY,
          )
          if (!existing) {
            await putValue(tx, STORE_WIDGET_DATA_SNAPSHOTS, snapshot)
          }
          await putValue(tx, STORE_BOARD_WIDGETS, persistableWidgetRow(widget))
        }
        const job = jobByWidget.get(widget.id)
        if (job) await ensureJobSourceInTx(tx, job)
        else await ensurePresetSourceInTx(tx, widget)
      }
    })
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
  await deleteSourcesForWidget(tx, widgetId)
  await deleteSnapshotsForWidget(tx, widgetId)
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
  const job = await getRow<WidgetDataJobRecord>(tx, STORE_WIDGET_DATA_JOBS, jobId)
  await remove(tx, STORE_WIDGET_DATA_JOBS, jobId)
  if (job) await deleteJobSourceInTx(tx, job)
}

async function writeWidgetInTx(
  tx: IDBTransaction,
  widget: BoardWidgetRecord,
  principalKey = ANONYMOUS_PRINCIPAL_KEY,
): Promise<void> {
  const snapshot = snapshotFromWidgetCompat(widget, principalKey)
  if (snapshot) {
    await putValue(tx, STORE_WIDGET_DATA_SNAPSHOTS, snapshot)
  }
  await putValue(tx, STORE_BOARD_WIDGETS, persistableWidgetRow(widget))
  await ensurePresetSourceInTx(tx, widget)
}

async function ensureJobSourceInTx(
  tx: IDBTransaction,
  job: WidgetDataJobRecord,
): Promise<void> {
  const write = jobSourceWrite(await sourceByWidgetInTx(tx, job.widgetId), job)
  if (!write) return
  if (write.staleId) await remove(tx, STORE_WIDGET_DATA_SOURCES, write.staleId)
  await putValue(tx, STORE_WIDGET_DATA_SOURCES, write.next)
}

async function ensurePresetSourceInTx(
  tx: IDBTransaction,
  widget: BoardWidgetRecord,
): Promise<void> {
  const preset = missingPresetSource(
    await sourceByWidgetInTx(tx, widget.id),
    widget,
  )
  if (preset) await putValue(tx, STORE_WIDGET_DATA_SOURCES, preset)
}

async function sourceByWidgetInTx(
  tx: IDBTransaction,
  widgetId: BoardWidgetId,
): Promise<WidgetDataSourceRecord | undefined> {
  return getByIndex<WidgetDataSourceRecord>(
    tx,
    STORE_WIDGET_DATA_SOURCES,
    'widgetId',
    widgetId,
  )
}

async function getSnapshotRow(
  tx: IDBTransaction,
  widgetId: BoardWidgetId,
  principalKey: string,
): Promise<WidgetDataSnapshotRecord | undefined> {
  return getRow<WidgetDataSnapshotRecord>(tx, STORE_WIDGET_DATA_SNAPSHOTS, [
    widgetId,
    principalKey,
  ])
}

async function listSnapshotsForWidget(
  tx: IDBTransaction,
  widgetId: BoardWidgetId,
): Promise<WidgetDataSnapshotRecord[]> {
  return idbRequest(
    tx
      .objectStore(STORE_WIDGET_DATA_SNAPSHOTS)
      .index('widgetId')
      .getAll(widgetId) as IDBRequest<WidgetDataSnapshotRecord[]>,
  )
}

async function deleteSnapshotsForWidget(
  tx: IDBTransaction,
  widgetId: BoardWidgetId,
): Promise<void> {
  const keys = await idbRequest(
    tx
      .objectStore(STORE_WIDGET_DATA_SNAPSHOTS)
      .index('widgetId')
      .getAllKeys(widgetId) as IDBRequest<IDBValidKey[]>,
  )
  for (const key of keys) {
    await remove(tx, STORE_WIDGET_DATA_SNAPSHOTS, key)
  }
}

async function deleteSourcesForWidget(
  tx: IDBTransaction,
  widgetId: BoardWidgetId,
): Promise<void> {
  const source = await sourceByWidgetInTx(tx, widgetId)
  if (source) await remove(tx, STORE_WIDGET_DATA_SOURCES, source.id)
}

async function deleteJobSourceInTx(
  tx: IDBTransaction,
  job: WidgetDataJobRecord,
): Promise<void> {
  const source = await sourceByWidgetInTx(tx, job.widgetId)
  if (source?.jobId === job.id) {
    await remove(tx, STORE_WIDGET_DATA_SOURCES, source.id)
  }
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
  store: TxStore,
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
  key: string,
): Promise<MetadataRecord | undefined> {
  return idbRequest(
    tx
      .objectStore(STORE_METADATA)
      .get(key) as IDBRequest<MetadataRecord | undefined>,
  )
}

function parseEpoch(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
