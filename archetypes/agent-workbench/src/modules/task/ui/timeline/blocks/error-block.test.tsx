import {
  emptyProjectionState,
  projectEvents,
  TaskSurface,
  type AgentRuntimeEventEnvelope,
  type TaskSurfaceView,
} from '@/modules/task'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

function envelope(
  eventType: string,
  taskSequence: number,
  payload: unknown = {},
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${taskSequence}`,
    eventType,
    schemaVersion: 2,
    projectId: 'p',
    taskId: 'task-error',
    turnId: 'turn-1',
    taskSequence,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload,
  }
}

function renderFailedSurface(
  onRetryTurn?: () => void,
  message = 'Failed to fetch',
) {
  const { readModel } = projectEvents(
    emptyProjectionState({
      taskId: 'task-error',
      projectId: 'p',
      title: '你是谁',
    }),
    [
      envelope('turn.started', 1, { inputText: '你是谁', text: '你是谁' }),
      envelope('turn.failed', 2, { message }),
    ],
  )
  const view: TaskSurfaceView = {
    taskId: 'task-error',
    title: readModel.title,
    projectName: '测试项目',
    mode: 'runtime',
    readModel,
    launchActions: [],
    contextSections: [],
    contextPanelOpen: false,
  }
  return render(
    <TaskSurface
      view={view}
      composerRuntime={{
        mode: 'runtime',
        onRetryTurn,
      }}
    />,
  )
}

describe('Timeline error presentation', () => {
  it('states the sidecar gap and puts retry next to the error', async () => {
    const onRetryTurn = vi.fn()
    renderFailedSurface(onRetryTurn)

    const error = page.getByTestId('timeline-item-error:turn-1')
    await expect.element(error).toHaveTextContent('无法连接本机运行时')
    await expect.element(error).toHaveTextContent('localhost:3141')
    expect(error.element().textContent ?? '').not.toContain('Failed to fetch')
    expect(error.element().textContent ?? '').not.toContain('运行失败')

    const retry = page.getByTestId('timeline-retry-turn')
    await expect.element(retry).toBeInTheDocument()
    expect(retry.element().closest('[data-kind="error"]')).not.toBeNull()
    expect(error.element().getAttribute('title')).toBeNull()
    expect(retry.element().tagName).toBe('BUTTON')
    expect(retry.element().className).toMatch(/tl-chrome/)
    expect(
      document.querySelector('[data-kind="turn-terminal"]'),
    ).toBeNull()

    await userEvent.click(retry)
    expect(onRetryTurn).toHaveBeenCalledTimes(1)
  })

  it('does not surface sidecar HTTP status as the visible body', async () => {
    renderFailedSurface(undefined, '侧车 HTTP 502: Bad Gateway')

    const error = page.getByTestId('timeline-item-error:turn-1')
    await expect.element(error).toHaveTextContent('无法连接本机运行时')
    expect(error.element().textContent ?? '').not.toContain('502')
    expect(error.element().textContent ?? '').not.toContain('Bad Gateway')
    expect(error.element().textContent ?? '').not.toContain('侧车 HTTP')
  })
})
