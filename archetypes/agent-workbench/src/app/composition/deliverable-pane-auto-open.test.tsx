import {
  asTaskId,
  asTurnId,
  emptyTaskReadModel,
  type TaskReadModel,
} from '@/modules/task'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useDeliverablePaneAutoOpen } from './deliverable-pane-auto-open'

function item(
  category: 'user-message' | 'turn-terminal',
  turnId: string,
  status?: string,
): TaskReadModel['timeline'][number] {
  return {
    id: `${category}-${turnId}`,
    category,
    status,
    sourceEventIds: [],
    taskId: asTaskId('t1'),
    turnId: asTurnId(turnId),
    projectionVersion: 1,
  }
}

function runningModel(): TaskReadModel {
  return {
    ...emptyTaskReadModel({ taskId: 't1', projectId: 'p' }),
    turnStatus: 'running',
    activeTurnId: asTurnId('turn-1'),
    timeline: [item('user-message', 'turn-1')],
  }
}

function completedModel(): TaskReadModel {
  return {
    ...emptyTaskReadModel({ taskId: 't1', projectId: 'p' }),
    turnStatus: 'completed',
    activeTurnId: asTurnId('turn-1'),
    deliverables: [
      { path: 'poems.md', source: 'file', changeKind: 'created' },
    ],
    timeline: [
      item('user-message', 'turn-1'),
      item('turn-terminal', 'turn-1', 'completed'),
    ],
  }
}

function Probe({
  readModel,
  workSurfaceVisible,
  onOpen,
  onRequestOpenMotion,
}: {
  readModel: TaskReadModel
  workSurfaceVisible: boolean
  onOpen: () => boolean
  onRequestOpenMotion: () => void
}) {
  useDeliverablePaneAutoOpen({
    taskId: 't1',
    readModel,
    workSurfaceVisible,
    onOpen,
    onRequestOpenMotion,
  })
  return <div data-testid='auto-open-probe' />
}

describe('useDeliverablePaneAutoOpen motion', () => {
  it('requests drawer motion when a watched turn finishes and the pane is closed', async () => {
    const onOpen = vi.fn(() => true)
    const onRequestOpenMotion = vi.fn()
    const screen = await render(
      <Probe
        readModel={runningModel()}
        workSurfaceVisible={false}
        onOpen={onOpen}
        onRequestOpenMotion={onRequestOpenMotion}
      />,
    )

    screen.rerender(
      <Probe
        readModel={completedModel()}
        workSurfaceVisible={false}
        onOpen={onOpen}
        onRequestOpenMotion={onRequestOpenMotion}
      />,
    )

    await expect.poll(() => onOpen.mock.calls.length).toBe(1)
    expect(onRequestOpenMotion).toHaveBeenCalledTimes(1)
  })

  it('does not request drawer motion when the pane is already open', async () => {
    const onOpen = vi.fn(() => true)
    const onRequestOpenMotion = vi.fn()
    const screen = await render(
      <Probe
        readModel={runningModel()}
        workSurfaceVisible={true}
        onOpen={onOpen}
        onRequestOpenMotion={onRequestOpenMotion}
      />,
    )

    screen.rerender(
      <Probe
        readModel={completedModel()}
        workSurfaceVisible={true}
        onOpen={onOpen}
        onRequestOpenMotion={onRequestOpenMotion}
      />,
    )

    await expect.poll(() => onOpen.mock.calls.length).toBe(1)
    expect(onRequestOpenMotion).not.toHaveBeenCalled()
  })
})
