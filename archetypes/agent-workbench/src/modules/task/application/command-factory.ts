/**
 * Deterministic Application Command builders (Phase 4C–4E).
 * Prefer an injected clock (VirtualClock on Fake) so ids/timestamps stay reproducible.
 */

import type {
  CancelRunCommand,
  CommandActor,
  CreateTaskCommand,
  ProvideRunInputCommand,
  QuestionAnswer,
  QueueFollowUpCommand,
  ReconcileInterruptedRunCommand,
  RespondToApprovalCommand,
  RetryTurnCommand,
  SteerRunCommand,
  SubmitTurnCommand,
  TurnComposerContext,
} from '../protocol/commands'

export interface CommandClock {
  nowIso(): string
}

export interface CommandIdSource {
  /** Monotonic counter for command / idempotency suffixes. */
  next(): number
}

export function createCounterIdSource(start = 1): CommandIdSource {
  let n = start
  return {
    next() {
      const value = n
      n += 1
      return value
    },
  }
}

export interface CommandFactoryOptions {
  clock: CommandClock
  ids?: CommandIdSource
  seed?: string
  actor?: CommandActor
  schemaVersion?: number
}

export class CommandFactory {
  private readonly clock: CommandClock
  private readonly ids: CommandIdSource
  private readonly seed: string
  private readonly actor: CommandActor
  private readonly schemaVersion: number

  constructor(options: CommandFactoryOptions) {
    this.clock = options.clock
    this.ids = options.ids ?? createCounterIdSource(1)
    this.seed = options.seed ?? 'cmd'
    this.actor = options.actor ?? 'user'
    this.schemaVersion = options.schemaVersion ?? 1
  }

  private envelope() {
    const n = this.ids.next()
    const commandId = `${this.seed}:command:${n}`
    const idempotencyKey = `${this.seed}:idem:${n}`
    return {
      commandId,
      idempotencyKey,
      issuedAt: this.clock.nowIso(),
      actor: this.actor,
      schemaVersion: this.schemaVersion,
    }
  }

  createTask(input: {
    proposedTaskId: string
    projectId: string
    title?: string
    initialPrompt?: string
  }): CreateTaskCommand {
    return {
      type: 'createTask',
      ...this.envelope(),
      proposedTaskId: input.proposedTaskId,
      projectId: input.projectId,
      title: input.title,
      initialPrompt: input.initialPrompt,
    }
  }

  submitTurn(input: {
    taskId: string
    inputText: string
    proposedTurnId?: string
    proposedRunId?: string
    composerContext?: TurnComposerContext
  }): SubmitTurnCommand {
    return {
      type: 'submitTurn',
      ...this.envelope(),
      taskId: input.taskId,
      inputText: input.inputText,
      proposedTurnId: input.proposedTurnId,
      proposedRunId: input.proposedRunId,
      composerContext: input.composerContext,
    }
  }

  cancelRun(input: {
    taskId: string
    turnId?: string
    runId?: string
  }): CancelRunCommand {
    return {
      type: 'cancelRun',
      ...this.envelope(),
      taskId: input.taskId,
      turnId: input.turnId,
      runId: input.runId,
    }
  }

  retryTurn(input: {
    taskId: string
    turnId: string
    proposedRunId?: string
  }): RetryTurnCommand {
    return {
      type: 'retryTurn',
      ...this.envelope(),
      taskId: input.taskId,
      turnId: input.turnId,
      proposedRunId: input.proposedRunId,
    }
  }

  respondToApproval(input: {
    taskId: string
    requestId: string
    decision: 'approved' | 'rejected'
    reason?: string
    turnId?: string
    runId?: string
  }): RespondToApprovalCommand {
    return {
      type: 'respondToApproval',
      ...this.envelope(),
      taskId: input.taskId,
      turnId: input.turnId,
      runId: input.runId,
      payload: {
        decision: input.decision,
        requestId: input.requestId,
        reason: input.reason,
      },
    }
  }

  provideRunInput(input: {
    taskId: string
    inputText: string
    requestId?: string
    turnId?: string
    runId?: string
    answer?: QuestionAnswer
  }): ProvideRunInputCommand {
    return {
      type: 'provideRunInput',
      ...this.envelope(),
      taskId: input.taskId,
      inputText: input.inputText,
      requestId: input.requestId,
      turnId: input.turnId,
      runId: input.runId,
      answer: input.answer,
    }
  }

  queueFollowUp(input: {
    taskId: string
    inputText: string
    proposedTurnId?: string
  }): QueueFollowUpCommand {
    return {
      type: 'queueFollowUp',
      ...this.envelope(),
      taskId: input.taskId,
      inputText: input.inputText,
      proposedTurnId: input.proposedTurnId,
    }
  }

  steerRun(input: {
    taskId: string
    runId: string
    inputText: string
  }): SteerRunCommand {
    return {
      type: 'steerRun',
      ...this.envelope(),
      taskId: input.taskId,
      runId: input.runId,
      inputText: input.inputText,
    }
  }

  reconcileInterruptedRun(input: {
    taskId: string
    turnId: string
    runId: string
    runtimeCursor: string
  }): ReconcileInterruptedRunCommand {
    return {
      type: 'reconcileInterruptedRun',
      ...this.envelope(),
      taskId: input.taskId,
      turnId: input.turnId,
      runId: input.runId,
      runtimeCursor: input.runtimeCursor,
    }
  }
}
