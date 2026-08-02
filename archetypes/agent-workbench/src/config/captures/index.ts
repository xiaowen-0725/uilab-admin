import type { EventStreamCapture } from '@/modules/task'
import goldenWeixinAudio from './golden-weixin-audio.json'

/** In-repo golden captures for stream replay (no live Runtime). */
export const eventStreamCaptures: Record<string, EventStreamCapture> = {
  'golden-weixin-audio': goldenWeixinAudio as EventStreamCapture,
}

export const DEFAULT_GOLDEN_CAPTURE_ID = 'golden-weixin-audio'

export function getEventStreamCapture(id: string): EventStreamCapture {
  const capture = eventStreamCaptures[id]
  if (!capture) {
    throw new Error(`Unknown event stream capture: ${id}`)
  }
  return capture
}

export function listEventStreamCaptureIds(): string[] {
  return Object.keys(eventStreamCaptures)
}
