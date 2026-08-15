import { describe, expect, it } from 'vitest'
import { applyRunTransition } from './run-transitions'
import type { TurnStatus } from './lifecycle'

describe('applyRunTransition', () => {
  it('happy path: queued → running → completed', () => {
    expect(applyRunTransition('queued', { type: 'start' })).toEqual({
      ok: true,
      status: 'running',
    })
    expect(applyRunTransition('running', { type: 'complete' })).toEqual({
      ok: true,
      status: 'completed',
    })
  })

  it('happy path: running → failed', () => {
    expect(applyRunTransition('running', { type: 'fail' })).toEqual({
      ok: true,
      status: 'failed',
    })
  })

  it('user cancel path: running → cancelling → cancelled', () => {
    expect(applyRunTransition('running', { type: 'cancel_requested' })).toEqual({
      ok: true,
      status: 'cancelling',
    })
    expect(applyRunTransition('cancelling', { type: 'cancel_completed' })).toEqual({
      ok: true,
      status: 'cancelled',
    })
  })

  it('approval path: running → waiting_for_approval → running', () => {
    expect(applyRunTransition('running', { type: 'request_approval' })).toEqual({
      ok: true,
      status: 'waiting_for_approval',
    })
    expect(
      applyRunTransition('waiting_for_approval', {
        type: 'approval_resolved',
        decision: 'approved',
      }),
    ).toEqual({ ok: true, status: 'running' })
  })

  it('approval rejection: waiting_for_approval → cancelled (no cancelling)', () => {
    expect(
      applyRunTransition('waiting_for_approval', {
        type: 'approval_resolved',
        decision: 'rejected',
      }),
    ).toEqual({ ok: true, status: 'cancelled' })
  })

  it('input wait path: running → waiting_for_input → running', () => {
    expect(applyRunTransition('running', { type: 'request_input' })).toEqual({
      ok: true,
      status: 'waiting_for_input',
    })
    expect(applyRunTransition('waiting_for_input', { type: 'input_provided' })).toEqual({
      ok: true,
      status: 'running',
    })
  })

  it('interrupt from non-terminal active states', () => {
    const sources: TurnStatus[] = [
      'queued',
      'running',
      'waiting_for_approval',
      'waiting_for_input',
      'cancelling',
    ]
    for (const from of sources) {
      expect(applyRunTransition(from, { type: 'interrupt' })).toEqual({
        ok: true,
        status: 'interrupted',
      })
    }
  })

  it('illegal: completed is terminal', () => {
    const result = applyRunTransition('completed', { type: 'start' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('illegal_transition')
      expect(result.error.from).toBe('completed')
    }
  })

  it('illegal: failed is terminal (retry creates new Run, not transition)', () => {
    const result = applyRunTransition('failed', { type: 'start' })
    expect(result.ok).toBe(false)
  })

  it('illegal: interrupted never returns to running on same Run', () => {
    const result = applyRunTransition('interrupted', { type: 'start' })
    expect(result.ok).toBe(false)
  })

  it('illegal: complete from queued', () => {
    const result = applyRunTransition('queued', { type: 'complete' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.event).toBe('complete')
    }
  })

  it('illegal: cancel_completed from running (must cancel_requested first)', () => {
    const result = applyRunTransition('running', { type: 'cancel_completed' })
    expect(result.ok).toBe(false)
  })
})
