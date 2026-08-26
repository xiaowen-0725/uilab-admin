/**
 * Stream gate fixture: short mid-run prose stays out of the answer slot.
 */
import {
  emptyProjectionState,
  projectEvents,
  TaskSurface,
  type AgentRuntimeEventEnvelope,
  type TaskSurfaceView,
} from '@/modules/task'
import { describe, expect, it } from 'vitest'
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
    taskId: 'task-gate',
    turnId: 'turn-1',
    taskSequence,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload,
  }
}

function renderTimeline(events: AgentRuntimeEventEnvelope[]) {
  const { readModel } = projectEvents(
    emptyProjectionState({
      taskId: 'task-gate',
      projectId: 'p',
      title: '晋升门',
    }),
    events,
  )
  const view: TaskSurfaceView = {
    taskId: 'task-gate',
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
        turnStatus: readModel.turnStatus,
      }}
    />,
  )
}

describe('Timeline stream gate', () => {
  it('keeps short streaming narration out of the assistant answer slot', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '看看 README', text: '看看 README' }),
      envelope('message.delta', 2, { text: '我先打开 README。' }),
      envelope('tool.started', 3, {
        toolId: 'read-1',
        name: 'read_file',
        args: { path: 'README.md' },
      }),
    ])

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    expect(
      document.querySelector('[data-category="assistant-message"]'),
    ).toBeNull()
    await expect
      .element(page.getByTestId('timeline-turn-status-label'))
      .toHaveTextContent(/正在处理|已完成/)
    expect(document.querySelector('[data-testid="timeline-stream-caret"]')).toBeNull()
  })

  it('promotes completed assistant text to prose', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '问好', text: '问好' }),
      envelope('message.delta', 2, { text: '你好，今天可以一起改安装说明。' }),
      envelope('message.completed', 3),
      envelope('turn.completed', 4),
    ])

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const prose = document.querySelector('[data-category="assistant-message"]')
    expect(prose?.textContent).toContain('你好')
  })

  it('keeps a completed commentary out of the answer slot while tools continue', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '看看 README', text: '看看 README' }),
      envelope('message.delta', 2, { text: '过程说明。' }),
      envelope('message.completed', 3, { text: '过程说明。' }),
      envelope('tool.started', 4, {
        toolId: 'read-1',
        name: 'read_file',
        args: { path: 'README.md' },
      }),
      envelope('tool.completed', 5, {
        toolId: 'read-1',
        name: 'read_file',
      }),
    ])

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    expect(
      document.querySelector('[data-category="assistant-message"]'),
    ).toBeNull()
    await expect
      .element(page.getByTestId('timeline-turn-status-label'))
      .toHaveTextContent(/正在处理|已完成/)
  })

  it('surfaces a failed run with tools as 失败, not a process receipt', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '写文件', text: '写文件' }),
      envelope('tool.started', 2, {
        toolId: 'write-1',
        name: 'write_file',
        args: { path: 'notes.md' },
      }),
      envelope('tool.completed', 3, {
        toolId: 'write-1',
        name: 'write_file',
      }),
      envelope('turn.failed', 4, { message: 'runtime error' }),
    ])

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const label = page.getByTestId('timeline-turn-status-label')
    await expect.element(label).toHaveTextContent('失败')
    expect(label.element().textContent ?? '').not.toMatch(/已完成|项过程/)
  })

  it('collapses asides and tools into one process fold after the answer lands', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '写贪吃蛇', text: '写贪吃蛇' }),
      envelope('tool.started', 2, {
        toolId: 'list-1',
        name: 'list_files',
        args: { path: '.' },
      }),
      envelope('tool.completed', 3, {
        toolId: 'list-1',
        name: 'list_files',
      }),
      envelope('message.delta', 4, { text: '目录是空的，开始写游戏。' }),
      envelope('message.completed', 5, { text: '目录是空的，开始写游戏。' }),
      envelope('tool.started', 6, {
        toolId: 'write-1',
        name: 'write_file',
        args: { path: 'outputs/snake-game.html' },
      }),
      envelope('tool.completed', 7, {
        toolId: 'write-1',
        name: 'write_file',
      }),
      envelope('message.delta', 8, { text: '已完成：outputs/snake-game.html' }),
      envelope('message.completed', 9, { text: '已完成：outputs/snake-game.html' }),
      envelope('turn.completed', 10, { durationMs: 8000 }),
    ])

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-kind="process-fold"]')).toHaveLength(1)
    expect(
      document.querySelector('[data-kind="process-fold"]')?.getAttribute('data-fold-open'),
    ).toBe('false')
    const answers = document.querySelectorAll('[data-category="assistant-message"]')
    expect(answers).toHaveLength(1)
    expect(answers[0]?.textContent).toContain('已完成：outputs/snake-game.html')
    expect(answers[0]?.textContent).not.toContain('目录是空的')

    await userEvent.click(page.getByTestId('timeline-turn-toggle'))
    const aside = document.querySelector('[data-kind="process-aside"]')
    expect(aside?.textContent).toContain('目录是空的，开始写游戏。')
  })

  it('surfaces a cancelled run after approval rejection as 已取消', async () => {
    renderTimeline([
      envelope('turn.started', 1, { inputText: '再试', text: '再试' }),
      envelope('approval.requested', 2, {
        requestId: 'req-1',
        toolName: 'write_file',
      }),
      envelope('approval.resolved', 3, {
        requestId: 'req-1',
        decision: 'rejected',
      }),
      envelope('turn.cancelled', 4),
    ])

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const label = page.getByTestId('timeline-turn-status-label')
    await expect.element(label).toHaveTextContent('已取消')
    expect(label.element().textContent ?? '').not.toMatch(/已完成|项过程/)
  })
})
