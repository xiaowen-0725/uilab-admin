/**
 * Application Command protocol (design §7).
 * UI only dispatches commands; it must not append Runtime events or mutate Run state.
 */
import type { TaskExecutionContext } from '../model/execution-context'
import type {
  ProjectId,
  RunId,
  RunStatus,
  TaskId,
  TurnId,
} from '../model/lifecycle'

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

/**
 * Slim ref types for capability data carried in a Turn submission.
 *
 * These are task-owned command DTOs — NOT imported from the capabilities
 * module. The task command protocol must not depend on the capabilities
 * read-model module (Codex review: "the stable execution protocol should
 * not depend on the volatile UI/read-model module").
 *
 * The composition layer (composer.tsx) imports both modules and projects
 * CapabilitySnapshot → these refs at the seam, including the name→label
 * field rename. This keeps the rename in one place (the composition call site)
 * without creating a cross-module type dependency.
 */
export type TurnSkillRef = { id: string; label: string }

export type TurnConnectorRef = {
  id: string
  label: string
  connected?: boolean
  taskSelected: boolean
  capabilityEffective?: boolean
}

export type TurnExpertRef = { id: string; label: string; instruction?: string }

export interface TurnComposerContext {
  attachments?: Array<{
    name: string
    kind: 'file' | 'image'
    meta?: string
  }>
  skills?: TurnSkillRef[]
  /** Capability Surface snapshot for this Turn; status-safe labels only. */
  connectors?: TurnConnectorRef[]
  /**
   * Task-selected expert profile (not a sub-agent).
   * `instruction` is the config-package overlay from Expert catalog (status-safe).
   */
  expert?: TurnExpertRef | null
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
