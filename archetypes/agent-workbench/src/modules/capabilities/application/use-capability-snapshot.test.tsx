import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type {
  CapabilitySnapshot,
  CapabilitySnapshotPort,
} from '../ports/capability-snapshot-port'
import { createCapabilityController } from './capability-controller'
import { useCapabilitySnapshot } from './use-capability-snapshot'

function snapshotFor(taskId: string): CapabilitySnapshot {
  return {
    version: 1,
    generatedAt: '2026-08-11T00:00:00.000Z',
    taskId,
    honesty: {
      runtime: 'local-sidecar',
      authBoundary: 'provider_declared',
      note: '测试快照',
    },
    connectors: [],
    skills: [],
    experts: [],
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  }
}

function SnapshotProbe({
  controller,
  taskId,
}: {
  controller: ReturnType<typeof createCapabilityController>
  taskId: string
}) {
  const snapshot = useCapabilitySnapshot(controller, taskId)
  return (
    <output data-testid='capability-snapshot-task'>
      {snapshot?.taskId ?? 'loading'}
    </output>
  )
}

describe('useCapabilitySnapshot', () => {
  it('keeps the newest Task when refresh responses arrive out of order', async () => {
    const resolvers = new Map<string, (snapshot: CapabilitySnapshot) => void>()
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(
        (taskId) =>
          new Promise<CapabilitySnapshot>((resolve) => {
            resolvers.set(String(taskId), resolve)
          })
      ),
      setSelection: vi.fn(),
      startAuth: vi.fn(),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe: () => () => {},
    }
    const controller = createCapabilityController(port)
    const taskA = controller.refresh('task-a')
    const taskB = controller.refresh('task-b')

    resolvers.get('task-b')?.(snapshotFor('task-b'))
    await taskB
    resolvers.get('task-a')?.(snapshotFor('task-a'))
    await taskA

    expect(controller.getCached()?.taskId).toBe('task-b')
  })

  it('never exposes the previous Task snapshot while the next Task is loading', async () => {
    let resolveTaskB: ((snapshot: CapabilitySnapshot) => void) | undefined
    const listeners = new Set<(snapshot: CapabilitySnapshot) => void>()
    const port: CapabilitySnapshotPort = {
      getSnapshot: vi.fn(async (taskId) => {
        if (taskId === 'task-b') {
          return new Promise<CapabilitySnapshot>((resolve) => {
            resolveTaskB = resolve
          })
        }
        return snapshotFor(String(taskId))
      }),
      setSelection: vi.fn(),
      startAuth: vi.fn(),
      refreshAuth: vi.fn(),
      revokeAuth: vi.fn(),
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const controller = createCapabilityController(port)
    await controller.refresh('task-a')

    render(<SnapshotProbe controller={controller} taskId='task-b' />)

    await expect
      .element(page.getByTestId('capability-snapshot-task'))
      .toHaveTextContent('loading')

    resolveTaskB?.(snapshotFor('task-b'))
    await expect
      .element(page.getByTestId('capability-snapshot-task'))
      .toHaveTextContent('task-b')
  })
})
