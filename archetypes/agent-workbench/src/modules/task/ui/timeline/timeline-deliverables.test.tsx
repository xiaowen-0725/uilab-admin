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
import { page } from 'vitest/browser'

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
  onOpenFileRef?: (info: { path?: string; line?: number; label: string }) => void,
  onOpenDeliverables?: (request: {
    items: readonly { path?: string; id?: string; kind?: string }[]
    activatePath?: string
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
      onOpenDeliverables={onOpenDeliverables}
      composerRuntime={{
        mode: 'runtime',
        turnStatus: readModel.turnStatus,
      }}
    />,
  )
}

describe('Timeline deliverables', () => {
  it('renders the featured preview card and opens it on click', async () => {
    const onOpenFileRef = vi.fn()
    const onOpenDeliverables = vi.fn()
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
      onOpenDeliverables,
    )

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('timeline-deliverables'))
      .toHaveTextContent('查看所有产物 (3)')

    const cards = document.querySelectorAll(
      '[data-testid="timeline-deliverables"] [data-testid="timeline-deliverable"]',
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]?.classList.contains('timeline-deliverable-card')).toBe(true)
    expect(cards[0]?.textContent).toContain('对比图')
    expect(cards[0]?.textContent).toContain('图片 · PNG')

    ;(page.getByTestId('file-reference-chip').element() as HTMLElement).click()
    expect(onOpenFileRef).toHaveBeenCalledWith({
      path: 'notes/chart.png',
      label: 'chart.png',
    })

    ;(page.getByTestId('timeline-deliverables-all').element() as HTMLElement).click()
    expect(onOpenDeliverables).toHaveBeenCalledWith(
      expect.objectContaining({
        activatePath: 'notes/chart.png',
      }),
    )
  })

  it('renders an interactive pointer card, not a file/HTML card', async () => {
    const onOpenFileRef = vi.fn()
    const onOpenDeliverables = vi.fn()
    renderTimeline(
      [
        envelope('turn.started', 1, { inputText: '做表', text: '做表' }),
        envelope('artifact.created', 2, {
          id: 'ia_notes-table',
          title: '对比清单',
          kind: 'interactive',
          html: '<table><tr><td>整表不该出现</td></tr></table>',
        }),
        envelope('file.changed', 3, {
          path: 'src/app.ts',
          changeKind: 'updated',
        }),
        envelope('message.delta', 4, { text: '表做好了。' }),
        envelope('turn.completed', 5),
      ],
      onOpenFileRef,
      onOpenDeliverables,
    )

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const zone = page.getByTestId('timeline-deliverables')
    await expect.element(zone).toHaveTextContent('对比清单')
    await expect.element(zone).toHaveTextContent('交互产物')
    expect(zone.element().textContent ?? '').not.toContain('文档 · HTML')
    expect(zone.element().textContent ?? '').not.toContain('整表不该出现')
    await expect.element(zone).toHaveTextContent('查看所有产物 (2)')

    ;(page.getByTestId('interactive-artifact-pointer').element() as HTMLElement).click()
    expect(onOpenFileRef).toHaveBeenCalledWith({
      kind: 'interactive',
      path: 'ia_notes-table',
      label: '对比清单',
    })

    ;(page.getByTestId('timeline-deliverables-all').element() as HTMLElement).click()
    expect(onOpenDeliverables).toHaveBeenCalledWith(
      expect.objectContaining({
        activatePath: 'ia_notes-table',
      }),
    )
  })

  it('omits the featured card when only source files were written', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '改代码', text: '改代码' }),
      envelope('file.changed', 2, {
        path: 'src/app.ts',
        changeKind: 'updated',
      }),
      envelope('message.delta', 3, { text: '改好了。' }),
      envelope('turn.completed', 4),
    ])

    await expect
      .element(page.getByTestId('timeline-deliverables-all'))
      .toHaveTextContent('查看所有产物 (1)')
    expect(
      document.querySelector('[data-testid="timeline-deliverable"]'),
    ).toBeNull()
  })

  it('renders deliverable paths in prose as plain names, not paperclip chips', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '保存', text: '保存' }),
      envelope('file.changed', 2, {
        path: 'poems.md',
        changeKind: 'created',
      }),
      envelope('message.delta', 3, {
        text: '已保存到 [poems.md](wb-file:poems.md)。',
      }),
      envelope('message.completed', 4, {
        text: '已保存到 [poems.md](wb-file:poems.md)。',
      }),
      envelope('turn.completed', 5),
    ])

    await expect
      .element(page.getByTestId('file-reference-plain'))
      .toHaveTextContent('poems.md')
    expect(
      document.querySelector(
        '[data-kind="assistant-message"] [data-testid="file-reference-chip"]',
      ),
    ).toBeNull()
    expect(
      document.querySelector('[data-testid="timeline-deliverables-all"]'),
    ).toBeNull()
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
      .toHaveTextContent('workflow-result.md')
    expect(document.querySelector('[data-testid="execution-stream"]')).toBeNull()
    const deliverableChip = page
      .getByTestId('timeline-deliverables')
      .getByTestId('file-reference-chip')
      .nth(0)
    ;(deliverableChip.element() as HTMLElement).click()
    expect(onOpenFileRef).toHaveBeenCalledWith({
      path: 'fixture/notes/workflow-result.md',
      label: 'workflow-result.md',
    })
  })

  it('does not show +N on a deleted file-change card while the run is live', async () => {
    renderTimeline([
      envelope('turn.started', 1),
      envelope('file.changed', 2, {
        path: 'notes/old.md',
        changeKind: 'deleted',
        additions: 4,
        deletions: 4,
      }),
    ])

    const card = page.getByTestId('timeline-item-file-change:e2')
    await expect.element(card).toHaveTextContent('已删除')
    expect(card.element().textContent ?? '').not.toMatch(/\+\d+/)
  })

  it('keeps settled files only in the deliverable zone', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '写结果', text: '写结果' }),
      envelope('tool.started', 2, {
        toolId: 'write-1',
        name: 'write_file',
        args: { path: 'notes/result.md' },
      }),
      envelope('tool.completed', 3, {
        toolId: 'write-1',
        name: 'write_file',
      }),
      envelope('file.changed', 4, {
        path: 'notes/result.md',
        additions: 10,
        changeKind: 'created',
      }),
      envelope('message.delta', 5, { text: '写好了。' }),
      envelope('message.completed', 6, { text: '写好了。' }),
      envelope('turn.completed', 7),
    ])

    await expect
      .element(page.getByTestId('timeline-deliverables'))
      .toHaveTextContent('result.md')
    expect(document.querySelectorAll('[data-testid="timeline-deliverables"]')).toHaveLength(
      1,
    )
    expect(document.querySelector('[data-testid="timeline-item-file-change:e4"]')).toBeNull()

    ;(page.getByTestId('timeline-turn-toggle').element() as HTMLElement).click()
    expect(document.querySelector('[data-kind="file-change-summary"]')).toBeNull()
    expect(document.querySelector('[data-kind="file-change"]')).toBeNull()
  })
})
