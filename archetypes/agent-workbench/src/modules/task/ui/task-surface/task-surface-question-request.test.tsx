import { useEffect, useMemo, useRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TaskRuntimeController } from '../../application/task-runtime-controller'
import { useTaskRuntime } from '../../application/use-task-runtime'
import {
  resetPermissionPresetStoreForTests,
  setPermissionPreset,
} from '../../application/permission-preset'
import {
  createScriptedRuntimePort,
  questionRequestedScenario,
} from '../../test/scripted-runtime-port'
import { TaskSurface, type TaskSurfaceView } from './task-surface'

interface QuestionHarnessProps {
  taskId: string
  requestId: string
  allowMultiple?: boolean
}

function QuestionHarness({
  taskId,
  requestId,
  allowMultiple = false,
}: QuestionHarnessProps) {
  const runtime = useMemo(() => createScriptedRuntimePort(), [])
  const controller = useMemo(
    () =>
      new TaskRuntimeController({
        runtime,
        projectId: 'p',
        seed: `q-${taskId}`,
      }),
    [runtime, taskId],
  )
  const result = useTaskRuntime(controller, taskId, {
    enabled: true,
    title: '提问测试',
  })
  const pushed = useRef(false)

  useEffect(() => {
    if (!result.ready || pushed.current) return
    pushed.current = true
    runtime.pushEvents(
      taskId,
      questionRequestedScenario(taskId, 'turn-1', requestId, {
        allowMultiple,
      }).events,
    )
  }, [result.ready, runtime, taskId, requestId, allowMultiple])

  const view: TaskSurfaceView = {
    taskId,
    title: result.readModel.title,
    projectName: '测试项目',
    mode: 'runtime',
    readModel: result.readModel,
    launchActions: [],
    contextSections: [],
    contextPanelOpen: false,
  }

  return (
    <TaskSurface
      view={view}
      composerRuntime={{
        mode: 'runtime',
        turnStatus: result.turnStatus,
        onSubmitText: (text) => result.submitText(text),
        onRespondToQuestion: (id, answer) =>
          result.respondToQuestion(id, answer),
        onProvideInput: (id, text) => result.provideRunInput(text, id),
      }}
    />
  )
}

describe('TaskSurface Question Request', () => {
  beforeEach(() => {
    resetPermissionPresetStoreForTests()
  })

  it('answers a single-choice question on click and folds the card', async () => {
    render(
      <QuestionHarness taskId='task-q-single' requestId='req-single' />,
    )

    await expect
      .element(page.getByTestId('question-option-formal'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer-input'))
      .toHaveAttribute('placeholder', '或直接回复…')

    await userEvent.click(page.getByTestId('question-option-formal'))

    await expect
      .element(page.getByTestId('timeline-item-input-request:req-single'))
      .toHaveAttribute('data-status', 'provided')
    await expect
      .element(page.getByTestId('timeline-item-input-request:req-single'))
      .toHaveTextContent('正式')
  })

  it('submits multiple selected options', async () => {
    render(
      <QuestionHarness
        taskId='task-q-multi'
        requestId='req-multi'
        allowMultiple
      />,
    )

    await userEvent.click(page.getByTestId('question-option-formal'))
    await userEvent.click(page.getByTestId('question-option-casual'))
    await expect
      .element(page.getByTestId('question-submit'))
      .toHaveTextContent('提交所选（2）')
    await userEvent.click(page.getByTestId('question-submit'))

    await expect
      .element(page.getByTestId('timeline-item-input-request:req-multi'))
      .toHaveTextContent('正式、轻松')
  })

  it('submits selected options together with Other text', async () => {
    render(
      <QuestionHarness
        taskId='task-q-multi-other'
        requestId='req-multi-other'
        allowMultiple
      />,
    )

    await userEvent.click(page.getByTestId('question-option-formal'))
    await userEvent.click(page.getByTestId('question-other'))
    await userEvent.fill(page.getByTestId('question-other-input'), '更短一些')
    await expect
      .element(page.getByTestId('question-submit'))
      .toHaveTextContent('提交所选（2）')
    await userEvent.click(page.getByTestId('question-submit'))

    await expect
      .element(page.getByTestId('timeline-item-input-request:req-multi-other'))
      .toHaveTextContent('正式、其他：更短一些')
  })

  it('submits Other free text', async () => {
    render(<QuestionHarness taskId='task-q-other' requestId='req-other' />)

    await userEvent.click(page.getByTestId('question-other'))
    await userEvent.fill(page.getByTestId('question-other-input'), '更短一些')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(page.getByTestId('timeline-item-input-request:req-other'))
      .toHaveTextContent('其他：更短一些')
  })

  it('skips the question', async () => {
    render(<QuestionHarness taskId='task-q-skip' requestId='req-skip' />)

    await userEvent.click(page.getByTestId('question-skip'))

    await expect
      .element(page.getByTestId('timeline-item-input-request:req-skip'))
      .toHaveTextContent('已跳过')
  })

  it('answers via Composer free text', async () => {
    render(<QuestionHarness taskId='task-q-free' requestId='req-free' />)

    await expect
      .element(page.getByTestId('question-option-formal'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer-input'))
      .toHaveAttribute('placeholder', '或直接回复…')
    await userEvent.fill(page.getByTestId('composer-input'), '按你的建议')
    await userEvent.click(page.getByTestId('composer-submit'))

    await expect
      .element(page.getByTestId('timeline-item-input-request:req-free'))
      .toHaveTextContent('直接回复：按你的建议')
  })

  it('does not auto-answer a question under full-access or auto-approve', async () => {
    const taskId = 'task-q-preset'
    setPermissionPreset(taskId, 'full-access')
    render(<QuestionHarness taskId={taskId} requestId='req-preset' />)

    await expect
      .element(page.getByTestId('question-option-formal'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('timeline-item-input-request:req-preset'))
      .toHaveAttribute('data-status', 'waiting')
    expect(document.querySelector('[data-testid="approval-dock"]')).toBeNull()
    await expect
      .element(page.getByTestId('composer'))
      .toBeInTheDocument()
  })

  it('does not auto-answer a question under the default auto-approve preset', async () => {
    render(
      <QuestionHarness taskId='task-q-auto' requestId='req-auto' />,
    )

    await expect
      .element(page.getByTestId('question-option-formal'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('timeline-item-input-request:req-auto'))
      .toHaveAttribute('data-status', 'waiting')
    await expect
      .element(page.getByTestId('composer'))
      .toBeInTheDocument()
  })
})
