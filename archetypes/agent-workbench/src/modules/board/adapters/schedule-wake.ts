/**
 * In-memory ScheduleWakePort and a duck-typed HostPort adapter.
 * Board does not import the Project module.
 */

import type {
  HostWakeSubscribe,
  ScheduleWakePort,
  ScheduleWakeUnsubscribe,
} from '../ports/schedule-wake-port'

export interface FakeScheduleWake extends ScheduleWakePort {
  emit(): void
}

export function createFakeScheduleWake(): FakeScheduleWake {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit() {
      for (const listener of [...listeners]) listener()
    },
  }
}

export function createHostScheduleWake(
  host?: HostWakeSubscribe,
): ScheduleWakePort {
  return {
    subscribe(listener): ScheduleWakeUnsubscribe {
      return host?.subscribeBoardRefreshWake?.(listener) ?? (() => {})
    },
  }
}
