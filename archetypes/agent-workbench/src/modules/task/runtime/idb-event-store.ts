/**
 * IndexedDB EventStorePort adapter.
 * Uses the shared Workbench IDB handle (Composition open).
 */

import {
  idbRequest,
  mapIdbError,
  runTransaction,
  STORE_COMMANDS,
  STORE_EVENTS,
  STORE_SNAPSHOTS,
} from '@/app/persistence/workbench-idb'
import type {
  EventStoreAppendResult,
  EventStoreCheckpointInput,
  EventStoreCheckpointResult,
  EventStorePort,
  EventStoreReadOptions,
} from '../ports/event-store-port'
import { EventStorePortError } from '../ports/event-store-port'
import type { CommandAcknowledgement } from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import type { RuntimeSnapshot } from '../ports/runtime-port'

/** Command ack row shape in commands store. */
interface CommandAckRow {
  commandId: string
  acknowledgement: CommandAcknowledgement
}

export class IdbEventStore implements EventStorePort {
  constructor(private readonly db: IDBDatabase) {}

  async append(
    envelope: AgentRuntimeEventEnvelope,
  ): Promise<EventStoreAppendResult> {
    try {
      return await runTransaction(
        this.db,
        STORE_EVENTS,
        'readwrite',
        async (tx) => appendInTx(tx.objectStore(STORE_EVENTS), envelope),
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async appendWithCheckpoint(
    input: EventStoreCheckpointInput,
  ): Promise<EventStoreCheckpointResult> {
    try {
      return await runTransaction(
        this.db,
        [STORE_EVENTS, STORE_SNAPSHOTS],
        'readwrite',
        async (tx) => {
          const events = tx.objectStore(STORE_EVENTS)
          const snapshots = tx.objectStore(STORE_SNAPSHOTS)
          const append = await appendInTx(events, input.envelope)
          if (append.status === 'conflict') {
            throw new EventStorePortError({
              code: 'conflict',
              message: append.message ?? '事件序号冲突',
              retriable: false,
            })
          }
          if (append.status === 'appended') {
            await idbRequest(snapshots.put(input.snapshot))
          }
          return { append }
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async read(
    options: EventStoreReadOptions,
  ): Promise<readonly AgentRuntimeEventEnvelope[]> {
    try {
      return await runTransaction(
        this.db,
        STORE_EVENTS,
        'readonly',
        async (tx) => {
          const store = tx.objectStore(STORE_EVENTS)
          const index = store.index('taskId')
          const all = await idbRequest(
            index.getAll(
              options.taskId,
            ) as IDBRequest<AgentRuntimeEventEnvelope[]>,
          )
          const from = options.fromSequence ?? 1
          const to = options.toSequence
          let filtered = all
            .filter((e) => {
              if (e.taskSequence < from) return false
              if (to != null && e.taskSequence >= to) return false
              return true
            })
            .sort((a, b) => a.taskSequence - b.taskSequence)
          if (options.limit != null && options.limit >= 0) {
            filtered = filtered.slice(0, options.limit)
          }
          return filtered
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async getSnapshot(
    taskId: string,
    _runId?: string,
  ): Promise<RuntimeSnapshot | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_SNAPSHOTS,
        'readonly',
        async (tx) => {
          const store = tx.objectStore(STORE_SNAPSHOTS)
          const row = await idbRequest(
            store.get(taskId) as IDBRequest<RuntimeSnapshot | undefined>,
          )
          return row ?? null
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async putSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
    try {
      await runTransaction(
        this.db,
        STORE_SNAPSHOTS,
        'readwrite',
        async (tx) => {
          await idbRequest(tx.objectStore(STORE_SNAPSHOTS).put(snapshot))
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async getCommandAcknowledgement(
    commandId: string,
  ): Promise<CommandAcknowledgement | null> {
    try {
      return await runTransaction(
        this.db,
        STORE_COMMANDS,
        'readonly',
        async (tx) => {
          const row = await idbRequest(
            tx.objectStore(STORE_COMMANDS).get(commandId) as IDBRequest<
              CommandAckRow | undefined
            >,
          )
          return row?.acknowledgement ?? null
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async putCommandAcknowledgement(
    commandId: string,
    acknowledgement: CommandAcknowledgement,
  ): Promise<void> {
    try {
      await runTransaction(
        this.db,
        STORE_COMMANDS,
        'readwrite',
        async (tx) => {
          const row: CommandAckRow = { commandId, acknowledgement }
          await idbRequest(tx.objectStore(STORE_COMMANDS).put(row))
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }

  async deleteTaskData(taskId: string): Promise<void> {
    try {
      await runTransaction(
        this.db,
        [STORE_EVENTS, STORE_SNAPSHOTS],
        'readwrite',
        async (tx) => {
          const events = tx.objectStore(STORE_EVENTS)
          const snapshots = tx.objectStore(STORE_SNAPSHOTS)
          await idbRequest(snapshots.delete(taskId))
          const index = events.index('taskId')
          const keys = await idbRequest(
            index.getAllKeys(IDBKeyRange.only(taskId)),
          )
          for (const key of keys) {
            await idbRequest(events.delete(key))
          }
        },
      )
    } catch (err) {
      throw toStoreError(err)
    }
  }
}

export function createIdbEventStore(db: IDBDatabase): IdbEventStore {
  return new IdbEventStore(db)
}

async function appendInTx(
  store: IDBObjectStore,
  envelope: AgentRuntimeEventEnvelope,
): Promise<EventStoreAppendResult> {
  // Unique eventId index
  const byEventId = store.index('eventId')
  const existingById = await idbRequest(
    byEventId.get(envelope.eventId) as IDBRequest<
      AgentRuntimeEventEnvelope | undefined
    >,
  )
  if (existingById) {
    return {
      status: 'duplicate',
      eventId: envelope.eventId,
      taskSequence: existingById.taskSequence,
    }
  }

  const existingAtSeq = await idbRequest(
    store.get([envelope.taskId, envelope.taskSequence]) as IDBRequest<
      AgentRuntimeEventEnvelope | undefined
    >,
  )
  if (existingAtSeq) {
    if (existingAtSeq.eventId === envelope.eventId) {
      return {
        status: 'duplicate',
        eventId: envelope.eventId,
        taskSequence: envelope.taskSequence,
      }
    }
    return {
      status: 'conflict',
      eventId: envelope.eventId,
      taskSequence: envelope.taskSequence,
      message: `taskSequence ${envelope.taskSequence} already holds ${existingAtSeq.eventId}`,
    }
  }

  await idbRequest(store.add(envelope))
  return {
    status: 'appended',
    eventId: envelope.eventId,
    taskSequence: envelope.taskSequence,
  }
}

function toStoreError(err: unknown): EventStorePortError {
  if (err instanceof EventStorePortError) return err
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  ) {
    const e = err as { code: string; message?: string; retriable?: boolean }
    return new EventStorePortError({
      code: (e.code as EventStorePortError['code']) || 'unknown',
      message: e.message ?? '事件存储失败',
      retriable: e.retriable ?? false,
    })
  }
  const mapped = mapIdbError(
    err instanceof Error ? err : null,
    'unknown',
    '事件存储失败',
  )
  return new EventStorePortError({
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
