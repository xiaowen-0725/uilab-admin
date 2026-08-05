/**
 * In-memory EventStorePort (Phase 4E).
 * Pure enough for tests + demo; not IndexedDB / production persistence.
 */

import type {
  EventStoreAppendResult,
  EventStorePort,
  EventStoreReadOptions,
} from '../ports/event-store-port'
import type { CommandAcknowledgement } from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import type { RuntimeSnapshot } from '../ports/runtime-port'

export class MemoryEventStore implements EventStorePort {
  private readonly byTask = new Map<string, AgentRuntimeEventEnvelope[]>()
  private readonly byEventId = new Map<string, AgentRuntimeEventEnvelope>()
  private readonly snapshots = new Map<string, RuntimeSnapshot>()
  private readonly acks = new Map<string, CommandAcknowledgement>()

  async append(envelope: AgentRuntimeEventEnvelope): Promise<EventStoreAppendResult> {
    if (this.byEventId.has(envelope.eventId)) {
      return {
        status: 'duplicate',
        eventId: envelope.eventId,
        taskSequence: envelope.taskSequence,
      }
    }
    this.byEventId.set(envelope.eventId, envelope)
    const list = this.byTask.get(envelope.taskId) ?? []
    list.push(envelope)
    // Keep sequence order stable.
    list.sort((a, b) => a.taskSequence - b.taskSequence)
    this.byTask.set(envelope.taskId, list)
    return {
      status: 'appended',
      eventId: envelope.eventId,
      taskSequence: envelope.taskSequence,
    }
  }

  async read(
    options: EventStoreReadOptions,
  ): Promise<readonly AgentRuntimeEventEnvelope[]> {
    const list = this.byTask.get(options.taskId) ?? []
    const from = options.fromSequence ?? 1
    const to = options.toSequence
    let filtered = list.filter((e) => {
      if (e.taskSequence < from) return false
      if (to != null && e.taskSequence >= to) return false
      return true
    })
    if (options.limit != null && options.limit >= 0) {
      filtered = filtered.slice(0, options.limit)
    }
    return filtered
  }

  async getSnapshot(taskId: string, runId?: string): Promise<RuntimeSnapshot | null> {
    if (runId) {
      return this.snapshots.get(`${taskId}:${runId}`) ?? null
    }
    return this.snapshots.get(taskId) ?? null
  }

  async putSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
    this.snapshots.set(snapshot.taskId, snapshot)
    if (snapshot.runId) {
      this.snapshots.set(`${snapshot.taskId}:${snapshot.runId}`, snapshot)
    }
  }

  async getCommandAcknowledgement(
    commandId: string,
  ): Promise<CommandAcknowledgement | null> {
    return this.acks.get(commandId) ?? null
  }

  async putCommandAcknowledgement(
    commandId: string,
    acknowledgement: CommandAcknowledgement,
  ): Promise<void> {
    this.acks.set(commandId, acknowledgement)
  }

  /** Test helper: wipe all state. */
  clear(): void {
    this.byTask.clear()
    this.byEventId.clear()
    this.snapshots.clear()
    this.acks.clear()
  }
}

export function createMemoryEventStore(): MemoryEventStore {
  return new MemoryEventStore()
}
