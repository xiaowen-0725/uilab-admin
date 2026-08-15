/**
 * In-memory EventStorePort (tests + optional non-durable harness).
 * Implements D2 checkpoint, D4 conflict, D5 task snapshot, D7 delete.
 */

import type {
  EventStoreAppendResult,
  EventStoreCheckpointInput,
  EventStoreCheckpointResult,
  EventStorePort,
  EventStoreReadOptions,
} from '@/modules/task'
import { EventStorePortError } from '@/modules/task'
import type { CommandAcknowledgement } from '@/modules/task'
import type { AgentRuntimeEventEnvelope } from '@/modules/task'
import type { RuntimeSnapshot } from '@/modules/task'

export class MemoryEventStore implements EventStorePort {
  private readonly byTask = new Map<string, AgentRuntimeEventEnvelope[]>()
  private readonly byEventId = new Map<string, AgentRuntimeEventEnvelope>()
  private readonly sequenceIndex = new Map<string, AgentRuntimeEventEnvelope>()
  private readonly snapshots = new Map<string, RuntimeSnapshot>()
  private readonly acks = new Map<string, CommandAcknowledgement>()

  async append(envelope: AgentRuntimeEventEnvelope): Promise<EventStoreAppendResult> {
    return this.appendInternal(envelope)
  }

  async appendWithCheckpoint(
    input: EventStoreCheckpointInput,
  ): Promise<EventStoreCheckpointResult> {
    const append = this.appendInternal(input.envelope)
    if (append.status === 'conflict') {
      throw new EventStorePortError({
        code: 'conflict',
        message: append.message ?? '事件序号冲突',
        retriable: false,
      })
    }
    if (append.status === 'appended') {
      this.snapshots.set(input.snapshot.taskId, { ...input.snapshot })
    }
    return { append }
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

  async getSnapshot(taskId: string): Promise<RuntimeSnapshot | null> {
    return this.snapshots.get(taskId) ?? null
  }

  async putSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
    this.snapshots.set(snapshot.taskId, { ...snapshot })
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

  async deleteTaskData(taskId: string): Promise<void> {
    const list = this.byTask.get(taskId) ?? []
    for (const env of list) {
      this.byEventId.delete(env.eventId)
      this.sequenceIndex.delete(seqKey(taskId, env.taskSequence))
    }
    this.byTask.delete(taskId)
    this.snapshots.delete(taskId)
  }

  /** Test helper: wipe all state. */
  clear(): void {
    this.byTask.clear()
    this.byEventId.clear()
    this.sequenceIndex.clear()
    this.snapshots.clear()
    this.acks.clear()
  }

  private appendInternal(
    envelope: AgentRuntimeEventEnvelope,
  ): EventStoreAppendResult {
    const existingById = this.byEventId.get(envelope.eventId)
    if (existingById) {
      return {
        status: 'duplicate',
        eventId: envelope.eventId,
        taskSequence: existingById.taskSequence,
      }
    }

    const key = seqKey(envelope.taskId, envelope.taskSequence)
    const existingAtSeq = this.sequenceIndex.get(key)
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

    this.byEventId.set(envelope.eventId, envelope)
    this.sequenceIndex.set(key, envelope)
    const list = this.byTask.get(envelope.taskId) ?? []
    list.push(envelope)
    list.sort((a, b) => a.taskSequence - b.taskSequence)
    this.byTask.set(envelope.taskId, list)
    return {
      status: 'appended',
      eventId: envelope.eventId,
      taskSequence: envelope.taskSequence,
    }
  }
}

function seqKey(taskId: string, taskSequence: number): string {
  return `${taskId}|${taskSequence}`
}

export function createMemoryEventStore(): MemoryEventStore {
  return new MemoryEventStore()
}
