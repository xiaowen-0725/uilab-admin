/**
 * Thin Application dispatch: validate envelope shape, then forward to RuntimePort.
 * Does not own Run state; acknowledgement is not domain confirmation.
 */

import type {
  ApplicationCommand,
  CommandAcknowledgement,
} from '../protocol/commands'
import type { RuntimePort } from '../ports/runtime-port'

const SUPPORTED_COMMAND_TYPES = new Set<ApplicationCommand['type']>([
  'createTask',
  'submitTurn',
  'cancelRun',
  'retryTurn',
  'respondToApproval',
  'provideRunInput',
  'queueFollowUp',
  'steerRun',
  'reconcileInterruptedRun',
])

/**
 * Validate common envelope + type-specific required fields, then sendCommand.
 */
export async function dispatchCommand(
  port: RuntimePort,
  command: ApplicationCommand,
): Promise<CommandAcknowledgement> {
  const validation = validateCommand(command)
  if (validation) return validation
  return port.sendCommand(command)
}

export function validateCommand(
  command: ApplicationCommand,
): CommandAcknowledgement | null {
  // Runtime guard for untyped call sites; typed callers always pass a command object.
  if (command == null || typeof command !== 'object') {
    return reject('unknown', 'invalid_command', 'Command is required')
  }

  if (!command.commandId || !command.idempotencyKey || !command.issuedAt) {
    return reject(
      command.commandId || 'unknown',
      'invalid_envelope',
      'commandId, issuedAt, and idempotencyKey are required',
    )
  }

  if (!SUPPORTED_COMMAND_TYPES.has(command.type)) {
    return {
      status: 'unsupported',
      commandId: command.commandId,
      reasonCode: 'unknown_command_type',
      message: `Unsupported command type: ${(command as { type: string }).type}`,
    }
  }

  if (command.type === 'createTask') {
    if (!command.proposedTaskId) {
      return reject(command.commandId, 'missing_proposed_task_id', 'createTask requires proposedTaskId')
    }
    if ('taskId' in command && (command as { taskId?: string }).taskId != null) {
      return reject(
        command.commandId,
        'create_task_must_not_have_task_id',
        'createTask must not include taskId',
      )
    }
  } else if (!('taskId' in command) || !command.taskId) {
    return reject(command.commandId, 'missing_task_id', `${command.type} requires taskId`)
  }

  if (command.type === 'reconcileInterruptedRun') {
    if (!command.turnId || !command.runId || !command.runtimeCursor) {
      return reject(
        command.commandId,
        'invalid_reconcile',
        'reconcileInterruptedRun requires turnId, runId, and runtimeCursor',
      )
    }
  }

  if (command.type === 'respondToApproval') {
    const d = command.payload?.decision
    if (d !== 'approved' && d !== 'rejected') {
      return reject(
        command.commandId,
        'invalid_approval_payload',
        'respondToApproval.payload.decision must be approved|rejected',
      )
    }
    if (!command.payload?.requestId) {
      return reject(
        command.commandId,
        'invalid_approval_payload',
        'respondToApproval.payload.requestId is required',
      )
    }
  }

  return null
}

function reject(
  commandId: string,
  reasonCode: string,
  message: string,
): CommandAcknowledgement {
  return {
    status: 'rejected',
    commandId,
    reasonCode,
    message,
  }
}
