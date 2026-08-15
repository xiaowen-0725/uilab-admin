/**
 * RuntimePort — Task Module consumer port (design §11).
 * Fake and future production Adapter share this contract.
 */

import type { TaskExecutionContext } from '../model/execution-context'
import type { TurnStatus } from '../model/lifecycle'
import type {
  ApplicationCommand,
  CommandAcknowledgement,
} from '../protocol/commands'
import type { AgentRuntimeEventEnvelope } from '../protocol/events'

/**
 * Binds task/turn ids to an immutable execution context snapshot.
 * TaskExecutionContext itself holds no IDs.
 */
export interface RunStartInput {
  taskId: string
  turnId: string
  taskExecutionContextSnapshot: TaskExecutionContext
  capabilitiesSnapshot: unknown
}

/** Recovery-oriented snapshot; authority remains append-only events. */
export interface RuntimeSnapshot {
  taskId: string
  protocolVersion: number
  turnStatus?: TurnStatus
  lastTaskSequence: number
  runtimeCursor?: string
  projectionVersion?: number
  taskExecutionContextSnapshot?: TaskExecutionContext
  capabilitiesSnapshot?: unknown
}

export interface RuntimeCapabilities {
  projectId: string
  environmentId: string
  features: {
    steer: boolean
    queueFollowUp: boolean
    approval: boolean
    runInput: boolean
    cancel: boolean
  }
  models?: readonly string[]
  tools?: readonly string[]
}

export type RuntimeSubscriptionEvent =
  | { kind: 'event'; envelope: AgentRuntimeEventEnvelope }
  | { kind: 'gap'; fromSequence: number; toSequence?: number; message?: string }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'reconnect'; cursor?: string }

export type RuntimeUnsubscribe = () => void

/**
 * Task-owned Runtime Port.
 * - sendCommand: unified ack (accepted|duplicate|rejected|unsupported|conflict)
 * - subscribe: push immutable envelopes from cursor; may signal gap/error/reconnect
 * - getSnapshot: read-only recovery support (does not reconcile)
 * - getCapabilities: optional capability matrix
 * - startRun: start a Turn's execution; UI changes via events
 */
export interface RuntimePort {
  sendCommand(command: ApplicationCommand): Promise<CommandAcknowledgement>

  subscribe(
    taskId: string,
    cursor: number | string | null | undefined,
    listener: (event: RuntimeSubscriptionEvent) => void,
  ): RuntimeUnsubscribe

  getSnapshot(taskId: string): Promise<RuntimeSnapshot | null>

  getCapabilities(
    projectId: string,
    environmentId: string,
  ): Promise<RuntimeCapabilities>

  startRun(
    input: RunStartInput,
    idempotencyKey: string,
  ): Promise<CommandAcknowledgement>
}
