/**
 * Application Command protocol (design §7).
 * UI only dispatches commands; it must not append Runtime events or mutate Run state.
 */

import type { ProjectId, RunId, RunStatus, TaskId, TurnId } from '../model/lifecycle'
import type { TaskExecutionContext } from '../model/execution-context'

export type CommandActor = 'user' | 'system' | 'runtime'

/** Common envelope fields shared by every command. */
export interface CommandEnvelope {
  commandId: string
  issuedAt: string
  actor: CommandActor
  idempotencyKey: string
  schemaVersion: number
  expectedProjectionVersion?: number
  expectedRunStatus?: RunStatus
}

export interface CreateTaskCommand extends CommandEnvelope {
  type: 'createTask'
  /** createTask has proposedTaskId and explicitly no taskId. */
  proposedTaskId: TaskId
  projectId: ProjectId
  title?: string
  initialPrompt?: string
  executionContext?: TaskExecutionContext
}

export interface SubmitTurnCommand extends CommandEnvelope {
  type: 'submitTurn'
  taskId: TaskId
  proposedTurnId?: TurnId
  proposedRunId?: RunId
  inputText: string
  /** Safe composer metadata; attachment bytes are never embedded here. */
  composerContext?: TurnComposerContext
  turnId?: TurnId
  runId?: RunId
  runtimeCursor?: string
}

export interface TurnComposerContext {
  attachments?: Array<{
    name: string
    kind: 'file' | 'image'
    meta?: string
  }>
  skills?: Array<{ id: string; label: string }>
  mode?: 'default' | 'goal' | 'plan' | 'goal+plan'
}

export interface CancelRunCommand extends CommandEnvelope {
  type: 'cancelRun'
  taskId: TaskId
  turnId?: TurnId
  runId?: RunId
  runtimeCursor?: string
}

export interface RetryTurnCommand extends CommandEnvelope {
  type: 'retryTurn'
  taskId: TaskId
  turnId: TurnId
  /** Optional proposed id for the new Run attempt. */
  proposedRunId?: RunId
  runtimeCursor?: string
}

export interface RespondToApprovalCommand extends CommandEnvelope {
  type: 'respondToApproval'
  taskId: TaskId
  turnId?: TurnId
  runId?: RunId
  payload: {
    decision: 'approved' | 'rejected'
    requestId: string
    reason?: string
  }
}

export interface ProvideRunInputCommand extends CommandEnvelope {
  type: 'provideRunInput'
  taskId: TaskId
  turnId?: TurnId
  runId?: RunId
  inputText: string
  requestId?: string
}

/**
 * Phase 4E: full queue product. 4B Fake may return `unsupported`.
 */
export interface QueueFollowUpCommand extends CommandEnvelope {
  type: 'queueFollowUp'
  taskId: TaskId
  inputText: string
  proposedTurnId?: TurnId
}

/**
 * Phase 4E: steer while running. 4B Fake may return `unsupported`.
 */
export interface SteerRunCommand extends CommandEnvelope {
  type: 'steerRun'
  taskId: TaskId
  runId: RunId
  inputText: string
}

/**
 * Recovery command (design §7). RuntimePort executes via sendCommand only.
 * Must include taskId, turnId, runId, runtimeCursor, idempotencyKey.
 */
export interface ReconcileInterruptedRunCommand extends CommandEnvelope {
  type: 'reconcileInterruptedRun'
  taskId: TaskId
  turnId: TurnId
  runId: RunId
  runtimeCursor: string
}

export type ApplicationCommand =
  | CreateTaskCommand
  | SubmitTurnCommand
  | CancelRunCommand
  | RetryTurnCommand
  | RespondToApprovalCommand
  | ProvideRunInputCommand
  | QueueFollowUpCommand
  | SteerRunCommand
  | ReconcileInterruptedRunCommand

export type CommandAcknowledgementStatus =
  | 'accepted'
  | 'duplicate'
  | 'rejected'
  | 'unsupported'
  | 'conflict'

/**
 * Unified acknowledgement for Application + RuntimePort (design §7).
 * Non-accepted statuses require reasonCode.
 */
export interface CommandAcknowledgement {
  status: CommandAcknowledgementStatus
  commandId: string
  reasonCode?: string
  message?: string
  acceptedAt?: string
  currentVersion?: number
  currentRunStatus?: RunStatus
  originalCommandId?: string
  originalAcknowledgement?: {
    commandId: string
    status: CommandAcknowledgementStatus
    acceptedAt?: string
  }
}
