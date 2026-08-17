import { describe, expect, it } from 'vitest'
import { createBoardPreviewPolicy } from './board-preview-policy'

describe('BoardPreviewPolicy', () => {
  it('opens on the first commit of a turn and only updates afterwards', () => {
    const policy = createBoardPreviewPolicy()
    expect(policy.decide('turn-1')).toBe('open')
    expect(policy.decide('turn-1')).toBe('update')
    expect(policy.decide('turn-1')).toBe('update')
  })

  it('does not reopen after the user closes in the same turn', () => {
    const policy = createBoardPreviewPolicy()
    expect(policy.decide('turn-1')).toBe('open')
    policy.onUserClose()
    expect(policy.decide('turn-1')).toBe('skip')
  })

  it('resets when the turn changes', () => {
    const policy = createBoardPreviewPolicy()
    policy.decide('turn-1')
    policy.onUserClose()
    expect(policy.decide('turn-2')).toBe('open')
  })

  it('resets when the task changes', () => {
    const policy = createBoardPreviewPolicy()
    policy.decide('turn-1', 'task-a')
    policy.onUserClose()
    expect(policy.decide('turn-1', 'task-b')).toBe('open')
  })
})
