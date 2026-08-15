/**
 * Timeline 产物区 — scripted events in, DOM out.
 */
import { getEventStreamCapture } from '@/config/captures'
import {
  emptyProjectionState,
  projectCapture,
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
    taskId: 'task-deliv',
    turnId: 'turn-1',

    taskSequence,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload,
  }
}

function renderTimeline(
  events: AgentRuntimeEventEnvelope[],
  onOpenFileRef?: TaskSurfaceView extends never ? never : (info: {
    path?: string
    line?: number
    label: string
  }) => void,
) {
  const { readModel } = projectEvents(
    emptyProjectionState({
      taskId: 'task-deliv',
      projectId: 'p',
      title: '产物测试',
    }),
    events,
  )
  const view: TaskSurfaceView = {
    taskId: 'task-deliv',
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
      onOpenFileRef={onOpenFileRef}
      composerRuntime={{
        mode: 'runtime',
        turnStatus: readModel.turnStatus,
      }}
    />,
  )
}

describe('Timeline deliverables', () => {
  it('renders a file chip list after the final reply and opens Work Surface on click', async () => {
    const onOpenFileRef = vi.fn()
    renderTimeline(
      [
        envelope('turn.started', 1, { inputText: '写结果', text: '写结果' }),
        envelope('file.changed', 3, {
          path: 'notes/result.md',
          additions: 10,
          changeKind: 'created',
        }),
        envelope('file.changed', 4, {
          path: 'notes/old.md',
          changeKind: 'deleted',
        }),
        envelope('artifact.created', 5, {
          path: 'notes/chart.png',
          kind: 'image',
          title: '对比图',
        }),
        envelope('message.delta', 6, { text: '三个文件都齐了。' }),
        envelope('turn.completed', 7),
      ],
      onOpenFileRef,
    )

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('timeline-deliverables'))
      .toHaveTextContent('本次产出 · 3 个文件')

    const chips = document.querySelectorAll(
      '[data-testid="timeline-deliverables"] [data-testid="file-reference-chip"]',
    )
    expect(chips).toHaveLength(3)
    expect(chips[0]?.textContent).toContain('result.md')
    expect(chips[1]?.textContent).toContain('已删除')
    expect(chips[1]?.textContent).toContain('old.md')
    expect(chips[2]?.textContent).toContain('对比图')

    await userEvent.click(page.getByTestId('file-reference-chip').nth(0))
    expect(onOpenFileRef).toHaveBeenCalledWith({
      path: 'notes/result.md',
      label: 'result.md',
    })
  })

  it('hides the deliverable zone when the run produced no files', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '问好', text: '问好' }),
      envelope('message.delta', 3, { text: '你好。' }),
      envelope('turn.completed', 4),
    ])

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="timeline-deliverables"]')).toBeNull()
  })

  it('projects a capture write into Timeline deliverable chips (ExecutionStream equivalent)', async () => {
    const readModel = projectCapture(
      getEventStreamCapture('case-fixture-workflow-replay'),
      { taskId: 'task-deliv' },
    )
    const onOpenFileRef = vi.fn()
    const view: TaskSurfaceView = {
      taskId: 'task-deliv',
      title: readModel.title,
      projectName: '测试项目',
      mode: 'stream',
      readModel,
      launchActions: [],
      contextSections: [],
      contextPanelOpen: false,
    }
    render(
      <TaskSurface
        view={view}
        onOpenFileRef={onOpenFileRef}
        composerRuntime={{ mode: 'local-sim' }}
      />,
    )

    await expect
      .element(page.getByTestId('timeline-deliverables'))
      .toHaveTextContent('本次产出 · 1 个文件')
    expect(document.querySelector('[data-testid="execution-stream"]')).toBeNull()
    const deliverableChip = page
      .getByTestId('timeline-deliverables')
      .getByTestId('file-reference-chip')
      .nth(0)
    await userEvent.click(deliverableChip)
    expect(onOpenFileRef).toHaveBeenCalledWith({
      path: 'fixture/notes/workflow-result.md',
      label: 'workflow-result.md',
    })
  })

  it('does not show +N on a deleted file-change card', async () => {
    renderTimeline([
      envelope('turn.started', 1),
      envelope('file.changed', 2, {
        path: 'notes/old.md',
        changeKind: 'deleted',
        additions: 4,
        deletions: 4,
      }),
      envelope('turn.completed', 3),
    ])

    const card = page.getByTestId('timeline-item-file-change:e2')
    await expect.element(card).toHaveTextContent('已删除')
    expect(card.element().textContent ?? '').not.toMatch(/\+\d+/)
  })
})
