/**
 * Deterministic virtual clock for Fake Runtime (design §11).
 * No system Date, no real timers required for tests that call advance/flush.
 */

export type VirtualClockListener = (nowMs: number) => void

export interface ScheduledHandle {
  readonly id: number
  cancel(): void
}

interface ScheduledJob {
  id: number
  atMs: number
  fn: () => void
  cancelled: boolean
}

export interface VirtualClockOptions {
  /** Epoch millis at construction (default 0). */
  startMs?: number
}

/**
 * Controllable clock:
 * - now() / nowIso() — current virtual time
 * - advance(ms) — move time forward and run due jobs
 * - pause() / resume() — gate whether advance runs jobs (pause still moves time if called)
 * - schedule(delayMs, fn) — fire after delay relative to now
 * - flush() — run all remaining scheduled jobs in order (advances to last due time)
 */
export class VirtualClock {
  private currentMs: number
  private paused = false
  private nextJobId = 1
  private jobs: ScheduledJob[] = []
  private listeners = new Set<VirtualClockListener>()
  /** Wall-clock ticker id (browser setInterval) for live streaming demos. */
  private realtimeTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: VirtualClockOptions = {}) {
    this.currentMs = options.startMs ?? 0
  }

  now(): number {
    return this.currentMs
  }

  /** ISO-8601 UTC string from virtual epoch. */
  nowIso(): string {
    return new Date(this.currentMs).toISOString()
  }

  isPaused(): boolean {
    return this.paused
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.runDueJobs()
  }

  /**
   * Advance virtual time by `ms` (must be >= 0).
   * When not paused, executes scheduled jobs whose atMs <= new now, in order.
   */
  advance(ms: number): void {
    if (ms < 0 || !Number.isFinite(ms)) {
      throw new RangeError(`VirtualClock.advance requires non-negative finite ms, got ${ms}`)
    }
    this.currentMs += ms
    if (!this.paused) {
      this.runDueJobs()
    }
    this.emit()
  }

  /**
   * Run all non-cancelled jobs in chronological order, advancing time as needed.
   * No-ops when paused (jobs stay pending until resume + flush/advance).
   */
  flush(): void {
    if (this.paused) return
    // Bound iterations to avoid infinite reschedule loops in pathological jobs.
    let guard = 10_000
    while (guard-- > 0) {
      const next = this.nextPendingJob()
      if (!next) return
      if (next.atMs > this.currentMs) {
        this.currentMs = next.atMs
        this.emit()
      }
      this.runDueJobs()
    }
  }

  /**
   * Schedule `fn` after `delayMs` from now (virtual).
   * Returns a handle that can cancel before fire.
   */
  schedule(delayMs: number, fn: () => void): ScheduledHandle {
    if (delayMs < 0 || !Number.isFinite(delayMs)) {
      throw new RangeError(
        `VirtualClock.schedule requires non-negative finite delayMs, got ${delayMs}`,
      )
    }
    const id = this.nextJobId++
    const job: ScheduledJob = {
      id,
      atMs: this.currentMs + delayMs,
      fn,
      cancelled: false,
    }
    this.jobs.push(job)
    this.jobs.sort((a, b) => a.atMs - b.atMs || a.id - b.id)
    return {
      id,
      cancel: () => {
        job.cancelled = true
      },
    }
  }

  onTick(listener: VirtualClockListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Drive the virtual clock from wall time so Fake streams animate in the UI.
   * `scale` maps real ms → virtual ms (default 1). Call stopRealtime() on unmount.
   * Tests should not use this — use advance/flush instead.
   */
  startRealtime(options?: { intervalMs?: number; scale?: number }): void {
    this.stopRealtime()
    const intervalMs = options?.intervalMs ?? 32
    const scale = options?.scale ?? 1
    this.realtimeTimer = setInterval(() => {
      if (this.paused) return
      this.advance(intervalMs * scale)
    }, intervalMs)
  }

  stopRealtime(): void {
    if (this.realtimeTimer != null) {
      clearInterval(this.realtimeTimer)
      this.realtimeTimer = null
    }
  }

  isRealtime(): boolean {
    return this.realtimeTimer != null
  }

  private nextPendingJob(): ScheduledJob | undefined {
    return this.jobs.find((j) => !j.cancelled)
  }

  private runDueJobs(): void {
    // Re-scan because jobs may schedule more jobs.
    let progressed = true
    while (progressed) {
      progressed = false
      const due = this.jobs.filter((j) => !j.cancelled && j.atMs <= this.currentMs)
      if (due.length === 0) break
      // Remove due before run so re-entrant schedule works cleanly.
      const dueIds = new Set(due.map((j) => j.id))
      this.jobs = this.jobs.filter((j) => !dueIds.has(j.id))
      for (const job of due) {
        if (job.cancelled) continue
        job.fn()
        progressed = true
      }
    }
    // Drop cancelled leftovers.
    this.jobs = this.jobs.filter((j) => !j.cancelled)
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.currentMs)
    }
  }
}
