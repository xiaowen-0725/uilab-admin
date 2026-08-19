/**
 * ScheduleWakePort — Desktop Host can poke the renderer to evaluate due sources.
 * Host never fetches or writes IDB. Web / tests without a host omit this.
 */

export type ScheduleWakeUnsubscribe = () => void

export interface ScheduleWakePort {
  subscribe(listener: () => void): ScheduleWakeUnsubscribe
}

export interface HostWakeSubscribe {
  subscribeBoardRefreshWake?(listener: () => void): ScheduleWakeUnsubscribe
}
