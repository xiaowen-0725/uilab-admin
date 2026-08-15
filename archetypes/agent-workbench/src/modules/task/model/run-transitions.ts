/**
 * Pure Run status state machine (design §7).
 * Illegal transitions return a diagnostic error object — never throw into UI.
 */

import type { TurnStatus } from './lifecycle'
import { isTerminalTurnStatus } from './lifecycle'

/** Events that may drive a Run status change. */
export type RunTransitionEvent =
  | { type: 'start' }
  | { type: 'request_approval' }
  | { type: 'approval_resolved'; decision: 'approved' | 'rejected' }
  | { type: 'request_input' }
  | { type: 'input_provided' }
  | { type: 'cancel_requested' }
  | { type: 'cancel_completed' }
  | { type: 'complete' }
  | { type: 'fail' }
  | { type: 'interrupt' }

export interface RunTransitionOk {
  ok: true
  status: TurnStatus
}

export interface RunTransitionError {
  ok: false
  error: {
    code: 'illegal_transition'
    from: TurnStatus
    event: RunTransitionEvent['type']
    message: string
  }
}

export type RunTransitionResult = RunTransitionOk | RunTransitionError

/**
 * Allowed main paths (design §7):
 * - queued → running
 * - running → waiting_for_approval → running
 * - waiting_for_approval → cancelled (approval rejection; no cancelling)
 * - running → waiting_for_input → running
 * - running → cancelling → cancelled (user cancel only)
 * - running → completed
 * - running → failed
 * - queued|running|waiting_for_approval|waiting_for_input|cancelling → interrupted
 *
 * Terminal statuses (completed|failed|cancelled) are immutable.
 * interrupted never returns to running on the same Run.
 */
export function applyRunTransition(
  from: TurnStatus,
  event: RunTransitionEvent,
): RunTransitionResult {
  if (isTerminalTurnStatus(from)) {
    return fail(from, event, `Turn is terminal (${from}); transitions are not allowed`)
  }

  switch (event.type) {
    case 'start':
      if (from === 'queued') return ok('running')
      return fail(from, event, 'start is only valid from queued')

    case 'request_approval':
      if (from === 'running') return ok('waiting_for_approval')
      return fail(from, event, 'request_approval is only valid from running')

    case 'approval_resolved':
      if (from !== 'waiting_for_approval') {
        return fail(from, event, 'approval_resolved is only valid from waiting_for_approval')
      }
      if (event.decision === 'approved') return ok('running')
      // Rejection: waiting_for_approval → cancelled (atomic; no cancelling)
      return ok('cancelled')

    case 'request_input':
      if (from === 'running') return ok('waiting_for_input')
      return fail(from, event, 'request_input is only valid from running')

    case 'input_provided':
      if (from === 'waiting_for_input') return ok('running')
      return fail(from, event, 'input_provided is only valid from waiting_for_input')

    case 'cancel_requested':
      // User cancel: running → cancelling (and active wait states may cancel via interrupt paths;
      // design main path is running → cancelling).
      if (from === 'running') return ok('cancelling')
      if (from === 'waiting_for_approval' || from === 'waiting_for_input') {
        // Design emphasizes approval reject vs user cancel; allow cancel_requested from wait
        // states into cancelling for Fake cancel-while-wait if needed. Strict main path
        // for user cancel is running → cancelling; wait states can also enter cancelling.
        return ok('cancelling')
      }
      if (from === 'cancelling') {
        return fail(from, event, 'already cancelling')
      }
      if (from === 'queued') {
        // Queued cancel: treat as direct cancel path via cancelling for uniformity,
        // or jump — design lists running → cancelling; queued cancel is rare.
        // Accept queued → cancelling for cancel-before-start.
        return ok('cancelling')
      }
      return fail(from, event, 'cancel_requested is not valid from this status')

    case 'cancel_completed':
      if (from === 'cancelling') return ok('cancelled')
      return fail(from, event, 'cancel_completed is only valid from cancelling')

    case 'complete':
      if (from === 'running') return ok('completed')
      return fail(from, event, 'complete is only valid from running')

    case 'fail':
      if (from === 'running') return ok('failed')
      return fail(from, event, 'fail is only valid from running')

    case 'interrupt':
      if (
        from === 'queued' ||
        from === 'running' ||
        from === 'waiting_for_approval' ||
        from === 'waiting_for_input' ||
        from === 'cancelling'
      ) {
        return ok('interrupted')
      }
      return fail(from, event, 'interrupt is not valid from this status')

    default: {
      const _exhaustive: never = event
      return fail(from, { type: 'start' }, `unknown event: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

function ok(status: TurnStatus): RunTransitionOk {
  return { ok: true, status }
}

function fail(
  from: TurnStatus,
  event: RunTransitionEvent,
  message: string,
): RunTransitionError {
  return {
    ok: false,
    error: {
      code: 'illegal_transition',
      from,
      event: event.type,
      message,
    },
  }
}
