/**
 * EventStorePort — type stub only (Phase 4E implements IndexedDB adapter).
 * Owned by Task Module; no global src/ports.
 */

import type { CommandAcknowledgement } from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import type { RuntimeSnapshot } from './runtime-port'

export interface EventStoreAppendResult {
  status: 'appended' | 'duplicate'
  eventId: string
  taskSequence?: number
}

export interface EventStoreReadOptions {
  taskId: string
  /** Inclusive lower bound (default 1). */
  fromSequence?: number
  /** Exclusive upper bound. */
  toSequence?: number
  limit?: number
}

/**
 * Browser EventStore contract (types only for 4B).
 * Default production adapter will use IndexedDB (4E).
 */
export interface EventStorePort {
  append(envelope: AgentRuntimeEventEnvelope): Promise<EventStoreAppendResult>

  read(
    options: EventStoreReadOptions,
  ): Promise<readonly AgentRuntimeEventEnvelope[]>

  getSnapshot(taskId: string, runId?: string): Promise<RuntimeSnapshot | null>

  putSnapshot(snapshot: RuntimeSnapshot): Promise<void>

  getCommandAcknowledgement(
    commandId: string,
  ): Promise<CommandAcknowledgement | null>

  putCommandAcknowledgement(
    commandId: string,
    acknowledgement: CommandAcknowledgement,
  ): Promise<void>
}

/** Diagnostic error shape for store failures (quota, blocked, open). */
export interface EventStoreError {
  code:
    | 'quota_exceeded'
    | 'transaction_failed'
    | 'blocked'
    | 'open_failed'
    | 'unknown'
  message: string
  retriable: boolean
}
