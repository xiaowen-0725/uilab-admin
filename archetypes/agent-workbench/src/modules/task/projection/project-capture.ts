/**
 * Capture JSON → envelopes → the same TaskReadModel Timeline uses.
 * Test harness / explicit dev only.
 */

import { captureToEnvelopes, type CaptureToEnvelopesOptions } from '../model/capture-to-envelopes'
import type { EventStreamCapture } from '../model/stream-events'
import { projectEventsFromEmpty } from './project-events'
import type { TaskReadModel } from './types'

export function projectCapture(
  capture: EventStreamCapture,
  options?: CaptureToEnvelopesOptions,
): TaskReadModel {
  const envelopes = captureToEnvelopes(capture, options)
  return projectEventsFromEmpty(
    options?.taskId ?? capture.id,
    options?.projectId ?? 'capture',
    envelopes,
    capture.title,
  ).readModel
}
