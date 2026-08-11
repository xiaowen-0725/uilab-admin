/**
 * Shared CommandAcknowledgement builders for Fake Runtime handlers.
 */

import type { RunStatus } from '@/modules/task'
import type { CommandAcknowledgement } from '@/modules/task'

export function accepted(
  commandId: string,
  acceptedAt: string,
): CommandAcknowledgement {
  return { status: 'accepted', commandId, acceptedAt }
}

export function rejected(
  commandId: string,
  reasonCode: string,
  message: string,
  extra?: { currentRunStatus?: RunStatus; currentVersion?: number },
): CommandAcknowledgement {
  return {
    status: 'rejected',
    commandId,
    reasonCode,
    message,
    currentRunStatus: extra?.currentRunStatus,
    currentVersion: extra?.currentVersion,
  }
}

export function unsupported(
  commandId: string,
  reasonCode: string,
  message: string,
): CommandAcknowledgement {
  return { status: 'unsupported', commandId, reasonCode, message }
}
