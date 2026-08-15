/**
 * Plan panel + Timeline card — scripted events in, DOM out (spec #98 / issue #100).
 * Public seams only: projectEvents → TaskSurface.
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
import { page } from 'vitest/browser'

const PLAN_STEPS = [
  { step: '调研审批 OpenAPI', status: 'completed' as const },
  { step: '实现参数装配', status: 'in_progress' as const },
  { step: '联调沙箱环境', status: 'pending' as const },
]

function envelope(
  taskId: string,
  eventType: string,
  fields: {
    taskSequence: number
    runId: string
    turnId: string
    payload?: unknown
  },
): AgentRuntimeEventEnvelope {
  return {
    eventId: `${taskId}:e${fields.taskSequence}`,
    eventType,
    schemaVersion: 1,
    projectId: 'p',
    taskId,
    turnId: fields.turnId,
    runId: fields.runId,
    taskSequence: fields.taskSequence,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload: fields.payload ?? {},
  }
}

function planEvents(taskId: string): AgentRuntimeEventEnvelope[] {
  const runId = 'run-plan'
  const turnId = 'turn-plan'
  return [
    envelope(taskId, 'message.accepted', {
      taskSequence: 1,
      runId,
      turnId,
      payload: { text: '接飞书审批', role: 'user' },
    }),
    envelope(taskId, 'run.queued', { taskSequence: 2, runId, turnId }),
    envelope(taskId, 'run.started', { taskSequence: 3, runId, turnId }),
    envelope(taskId, 'plan.updated', {
      taskSequence: 4,
      runId,
      turnId,
      payload: {
        explanation: '参数装配比预期复杂，拆出独立步骤',
        steps: PLAN_STEPS,
      },
    }),
    envelope(taskId, 'tool.called', {
      taskSequence: 5,
      runId,
      turnId,
      payload: {
        toolId: 'read-1',
        name: 'read_file',
        args: { path: '/notes/a.md' },
      },
    }),
  ]
}

function renderPlanSurface(
  taskId: string,
  events: AgentRuntimeEventEnvelope[],
) {
  const { readModel } = projectEvents(
    emptyProjectionState({ taskId, projectId: 'p', title: '计划测试' }),
    events,
  )
  const view: TaskSurfaceView = {
    taskId,
    title: readModel.title,
    projectName: '测试项目',
    mode: 'runtime',
    stream: null,
    readModel,
    launchActions: [],
    contextSections: [],
    contextPanelOpen: true,
  }
  return render(
    <TaskSurface
      view={view}
      composerRuntime={{
        mode: 'runtime',
        runStatus: readModel.runStatus,
      }}
    />,
  )
}

describe('Workbench plan panel + Timeline card', () => {
  it('shows the empty plan block before any plan.updated event', async () => {
    const taskId = 'task-plan-empty'
    renderPlanSurface(taskId, [
      envelope(taskId, 'run.started', {
        taskSequence: 1,
        runId: 'run-empty',
        turnId: 'turn-empty',
      }),
    ])

    await expect
      .element(page.getByTestId('context-panel-block-plan'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('context-panel-plan-empty'))
      .toHaveTextContent('本次任务暂无计划')
    expect(
      document.querySelector('[data-testid="context-panel-plan-progress"]'),
    ).toBeNull()
  })

  it('renders panel progress and a Codex-style Timeline plan card from scripted events', async () => {
    renderPlanSurface('task-plan-mid', planEvents('task-plan-mid'))

    await expect
      .element(page.getByTestId('context-panel-plan-progress'))
      .toHaveTextContent('1/3')

    const completed = page.getByTestId('context-panel-plan-step').nth(0)
    await expect.element(completed).toHaveAttribute('data-status', 'completed')
    expect(
      getComputedStyle(completed.element().querySelector('span')!)
        .textDecorationLine,
    ).toContain('line-through')

    await expect
      .element(page.getByTestId('context-panel-plan-step').nth(1))
      .toHaveAttribute('data-status', 'in_progress')

    const card = page.getByTestId('timeline-item-plan-update:run-plan')
    await expect.element(card).toHaveTextContent('计划已更新')
    await expect
      .element(card)
      .toHaveTextContent('参数装配比预期复杂，拆出独立步骤')
    await expect.element(card).toHaveTextContent('调研审批 OpenAPI')

    const explanation = card.element().querySelector('[data-plan-explanation]')
    expect(explanation).not.toBeNull()
    expect(getComputedStyle(explanation!).fontStyle).toBe('italic')

    await expect
      .element(page.getByTestId('timeline-run-status-label'))
      .toHaveTextContent(/已处理|读取|列出|命令|思考/)
    expect(
      page.getByTestId('timeline-run-status-label').element().textContent ?? '',
    ).not.toMatch(/步/)
  })

  it('renders an empty-steps Timeline card as （无步骤）', async () => {
    const taskId = 'task-plan-no-steps'
    renderPlanSurface(taskId, [
      envelope(taskId, 'message.accepted', {
        taskSequence: 1,
        runId: 'run-empty-steps',
        turnId: 'turn-empty-steps',
        payload: { text: '简单问一句', role: 'user' },
      }),
      envelope(taskId, 'run.started', {
        taskSequence: 2,
        runId: 'run-empty-steps',
        turnId: 'turn-empty-steps',
      }),
      envelope(taskId, 'plan.updated', {
        taskSequence: 3,
        runId: 'run-empty-steps',
        turnId: 'turn-empty-steps',
        payload: { steps: [] },
      }),
    ])

    await expect
      .element(page.getByTestId('context-panel-plan-empty'))
      .toHaveTextContent('本次任务暂无计划')
    await expect
      .element(page.getByTestId('timeline-item-plan-update:run-empty-steps'))
      .toHaveTextContent('（无步骤）')
  })

  it('keeps a completed plan visible in the panel and shows warning body on Timeline', async () => {
    const taskId = 'task-plan-done'
    renderPlanSurface(taskId, [
      envelope(taskId, 'message.accepted', {
        taskSequence: 1,
        runId: 'run-done',
        turnId: 'turn-done',
        payload: { text: '做完审批连接器', role: 'user' },
      }),
      envelope(taskId, 'run.started', {
        taskSequence: 2,
        runId: 'run-done',
        turnId: 'turn-done',
      }),
      envelope(taskId, 'plan.updated', {
        taskSequence: 3,
        runId: 'run-done',
        turnId: 'turn-done',
        payload: {
          steps: [
            { step: '调研 OpenAPI', status: 'completed' },
            { step: '联调沙箱', status: 'completed' },
          ],
        },
      }),
      envelope(taskId, 'warning', {
        taskSequence: 4,
        runId: 'run-done',
        turnId: 'turn-done',
        payload: {
          title: '计划更新失败',
          message: 'sidecar unavailable',
        },
      }),
    ])

    await expect
      .element(page.getByTestId('context-panel-plan-progress'))
      .toHaveTextContent('2/2')
    await expect
      .element(page.getByTestId('context-panel-plan-step').nth(0))
      .toHaveAttribute('data-status', 'completed')
    await expect
      .element(page.getByTestId('context-panel-plan-step').nth(1))
      .toHaveAttribute('data-status', 'completed')
    expect(
      document.querySelector('[data-testid="context-panel-plan-empty"]'),
    ).toBeNull()

    const warning = page.getByTestId(`timeline-item-warning:${taskId}:e4`)
    await expect.element(warning).toHaveTextContent('计划更新失败')
    await expect.element(warning).toHaveTextContent('sidecar unavailable')
  })
})
