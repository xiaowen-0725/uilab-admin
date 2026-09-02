import { describe, expect, it, vi } from 'vitest'
import {
  createCombinedClientToolExecutor,
  shouldOpenInteractiveSurfaceOnCommit,
} from './interactive-artifact-wiring'

describe('shouldOpenInteractiveSurfaceOnCommit', () => {
  it('opens only a live commit for the selected Task', () => {
    expect(
      shouldOpenInteractiveSurfaceOnCommit({
        replayed: false,
        taskId: 'task-a',
        selectedTaskId: 'task-a',
      }),
    ).toBe(true)
    expect(
      shouldOpenInteractiveSurfaceOnCommit({
        replayed: true,
        taskId: 'task-a',
        selectedTaskId: 'task-a',
      }),
    ).toBe(false)
    expect(
      shouldOpenInteractiveSurfaceOnCommit({
        replayed: false,
        taskId: 'task-a',
        selectedTaskId: 'task-b',
      }),
    ).toBe(false)
  })
})

describe('createCombinedClientToolExecutor', () => {
  it('routes interactive_commit away from the board executor', async () => {
    const board = vi.fn(async () => ({ ok: true, via: 'board' }))
    const interactive = vi.fn(async () => ({ ok: true, via: 'interactive' }))
    const executor = createCombinedClientToolExecutor(board, interactive)

    await expect(
      executor({
        toolName: 'interactive_commit',
        args: {},
        taskId: 'task-a',
        turnId: 'turn-1',
      }),
    ).resolves.toEqual({ ok: true, via: 'interactive' })
    expect(board).not.toHaveBeenCalled()

    await expect(
      executor({
        toolName: 'board_commit',
        args: {},
        taskId: 'task-a',
        turnId: 'turn-1',
      }),
    ).resolves.toEqual({ ok: true, via: 'board' })
    expect(interactive).toHaveBeenCalledTimes(1)
  })
})
