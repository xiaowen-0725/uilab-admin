import type { EventStreamCapture } from '@/modules/task'
import caseFixtureWorkflowReplay from './case-fixture-workflow-replay.json'
import caseFlychessCodexReplay from './case-flychess-codex-replay.json'
import caseTechnicalAuditReplay from './case-technical-audit-replay.json'
import goldenWeixinAudio from './golden-weixin-audio.json'

/** In-repo golden captures for timed stream replay (no live Runtime). */
export const eventStreamCaptures: Record<string, EventStreamCapture> = {
  'case-fixture-workflow-replay':
    caseFixtureWorkflowReplay as EventStreamCapture,
  'case-flychess-codex-replay': caseFlychessCodexReplay as EventStreamCapture,
  'case-technical-audit-replay':
    caseTechnicalAuditReplay as EventStreamCapture,
  'golden-weixin-audio': goldenWeixinAudio as EventStreamCapture,
}

/** Default product demo: V2 gold timed workflow (~40s, Codex density). */
export const DEFAULT_GOLDEN_CAPTURE_ID = 'case-fixture-workflow-replay'

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
