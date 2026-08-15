/**
 * Progressive wall-clock playback of a capture stream (test harness / explicit dev).
 * Capture JSON → envelopes → the same projection Timeline uses.
 */

import { useEffect, useMemo, useState } from 'react'
import type { EventStreamCapture } from '../../model/stream-events'
import { captureMaxTs } from '../../model/stream-events'
import { projectCapture } from '../../projection/project-capture'
import type { TaskReadModel } from '../../projection/types'

export interface CapturePlaybackOptions {
  /** Real-time multiplier (default 4 = 4× faster than recorded ts). */
  playbackRate?: number
  /** When false, show full final fold immediately (tests / skip). */
  enabled?: boolean
}

export interface CapturePlaybackResult {
  readModel: TaskReadModel
  /** Playback progress 0..1 */
  progress: number
  /** Virtual stream clock (ms along capture timeline). */
  currentTs: number
  maxTs: number
  /** True until end of capture timeline. */
  playing: boolean
}

/**
 * Replay capture events in time order through the shared projection.
 */
export function useCapturePlayback(
  capture: EventStreamCapture | null,
  options?: CapturePlaybackOptions,
): CapturePlaybackResult | null {
  const enabled = options?.enabled ?? true
  const playbackRate = options?.playbackRate ?? 4
  const maxTs = capture ? captureMaxTs(capture) : 0
  const [currentTs, setCurrentTs] = useState(0)

  useEffect(() => {
    setCurrentTs(0)
  }, [capture?.id])

  useEffect(() => {
    if (!capture || !enabled || maxTs <= 0) {
      if (capture && maxTs > 0) setCurrentTs(maxTs)
      return
    }
    let raf = 0
    const started = performance.now()
    const tick = (now: number) => {
      const elapsedReal = now - started
      const streamTs = Math.min(maxTs, elapsedReal * playbackRate)
      setCurrentTs(streamTs)
      if (streamTs < maxTs) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [capture, enabled, maxTs, playbackRate, capture?.id])

  return useMemo(() => {
    if (!capture) return null
    const ts = enabled ? currentTs : maxTs
    const readModel = projectCapture(capture, {
      untilTs: enabled ? ts : undefined,
    })
    const playing = enabled && ts < maxTs
    return {
      readModel,
      progress: maxTs > 0 ? Math.min(1, (enabled ? ts : maxTs) / maxTs) : 1,
      currentTs: enabled ? ts : maxTs,
      maxTs,
      playing,
    }
  }, [capture, currentTs, enabled, maxTs])
}
