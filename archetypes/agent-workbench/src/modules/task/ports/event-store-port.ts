/**
 * EventStorePort — Task Module owned durable event stream contract.
 * Memory (tests) and IndexedDB (product) share this interface.
 */

import type { CommandAcknowledgement } from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import type { RuntimeSnapshot } from './runtime-port'

export interface EventStoreAppendResult {
  status: 'appended' | 'duplicate' | 'conflict'
  eventId: string
  taskSequence?: number
  message?: string
}

export interface EventStoreReadOptions {
  taskId: string
  /** Inclusive lower bound (default 1). */
  fromSequence?: number
  /** Exclusive upper bound. */
  toSequence?: number
  limit?: number
}

export interface EventStoreCheckpointInput {
  envelope: AgentRuntimeEventEnvelope
  snapshot: RuntimeSnapshot
}

export interface EventStoreCheckpointResult {
  append: EventStoreAppendResult
}

/** Diagnostic error shape for store failures (quota, blocked, open). */
export interface EventStoreError {
  code:
    | 'quota_exceeded'
    | 'transaction_failed'
    | 'blocked'
    | 'open_failed'
    | 'conflict'
    | 'unknown'
  message: string
  retriable: boolean
}

export class EventStorePortError extends Error {
  readonly code: EventStoreError['code']
  readonly retriable: boolean

  constructor(error: EventStoreError) {
    super(error.message)
    this.name = 'EventStorePortError'
    this.code = error.code
    this.retriable = error.retriable
  }
}

/**
 * Browser EventStore contract.
 * Open/ready is owned by Composition (D12); Port methods assume a ready store.
 */
export interface EventStorePort {
  append(envelope: AgentRuntimeEventEnvelope): Promise<EventStoreAppendResult>

  /**
   * Atomic append + snapshot put (D2). Failures must not advance durable cursor.
   * Adapters without multi-store TX may still implement as best-effort ordered writes.
   */
  appendWithCheckpoint(
    input: EventStoreCheckpointInput,
  ): Promise<EventStoreCheckpointResult>

  read(
    options: EventStoreReadOptions,
  ): Promise<readonly AgentRuntimeEventEnvelope[]>

  /** Latest checkpoint for task (D5: one row per taskId). */
  getSnapshot(taskId: string, runId?: string): Promise<RuntimeSnapshot | null>

  putSnapshot(snapshot: RuntimeSnapshot): Promise<void>

  getCommandAcknowledgement(
    commandId: string,
  ): Promise<CommandAcknowledgement | null>

  putCommandAcknowledgement(
    commandId: string,
    acknowledgement: CommandAcknowledgement,
  ): Promise<void>

  /**
   * Delete events + snapshot for a task (D7). Commands are not task-scanned.
   * Full catalog+session cascade is Composition/shell TX when using shared IDB.
   */
  deleteTaskData(taskId: string): Promise<void>
}
