/**
 * Shared CommandAcknowledgement builders for RuntimePort adapters.
 */

import type { CommandAcknowledgement, TurnStatus } from '@/modules/task'

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
  extra?: { currentTurnStatus?: TurnStatus; currentVersion?: number },
): CommandAcknowledgement {
  return {
    status: 'rejected',
    commandId,
    reasonCode,
    message,
    currentTurnStatus: extra?.currentTurnStatus,
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
