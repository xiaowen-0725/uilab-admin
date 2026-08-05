import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'
import { createMemoryEventStore } from './memory-event-store'

function envelope(
  taskId: string,
  seq: number,
  eventId?: string,
): AgentRuntimeEventEnvelope {
  return {
    eventId: eventId ?? `${taskId}:e${seq}`,
    eventType: 'output.delta',
    schemaVersion: 1,
    projectId: 'p',
    taskId,
    taskSequence: seq,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload: { text: String(seq) },
  }
}

describe('MemoryEventStore', () => {
  it('append / read / duplicate / isolation', async () => {
    const store = createMemoryEventStore()
    const a1 = await store.append(envelope('task-a', 1))
    expect(a1.status).toBe('appended')
    const dup = await store.append(envelope('task-a', 1))
    expect(dup.status).toBe('duplicate')

    await store.append(envelope('task-a', 2))
    await store.append(envelope('task-b', 1))

    const a = await store.read({ taskId: 'task-a', fromSequence: 1 })
    expect(a.map((e) => e.taskSequence)).toEqual([1, 2])
    const b = await store.read({ taskId: 'task-b' })
    expect(b).toHaveLength(1)

    await store.putCommandAcknowledgement('c1', {
      status: 'accepted',
      commandId: 'c1',
      acceptedAt: '1970-01-01T00:00:00.000Z',
    })
    expect((await store.getCommandAcknowledgement('c1'))?.status).toBe(
      'accepted',
    )

    await store.putSnapshot({
      taskId: 'task-a',
      protocolVersion: 1,
      lastTaskSequence: 2,
    })
    expect((await store.getSnapshot('task-a'))?.lastTaskSequence).toBe(2)
  })
})
