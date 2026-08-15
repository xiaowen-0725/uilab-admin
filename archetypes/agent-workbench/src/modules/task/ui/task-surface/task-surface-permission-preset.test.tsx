import { useEffect, useMemo, useRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { TaskRuntimeController } from '../../application/task-runtime-controller'
import { useTaskRuntime } from '../../application/use-task-runtime'
import {
  resetPermissionPresetStoreForTests,
  setPermissionPreset,
} from '../../application/permission-preset'
import {
  approvalRequestedScenario,
  createScriptedRuntimePort,
  envelope,
} from '../../test/scripted-runtime-port'
import type { AgentRuntimeEventEnvelope } from '../../protocol/events'
import { TaskSurface, type TaskSurfaceView } from './task-surface'

interface ApprovalHarnessProps {
  taskId: string
  toolName?: string
  requestId: string
  events?: AgentRuntimeEventEnvelope[]
}

function ApprovalHarness({
  taskId,
  toolName,
  requestId,
  events,
}: ApprovalHarnessProps) {
  const runtime = useMemo(() => createScriptedRuntimePort(), [])
  const controller = useMemo(
    () =>
      new TaskRuntimeController({
        runtime,
        projectId: 'p',
        seed: `perm-${taskId}`,
      }),
    [runtime, taskId],
  )
  const result = useTaskRuntime(controller, taskId, {
    enabled: true,
    title: '权限测试',
  })
  const pushed = useRef(false)

  useEffect(() => {
    if (!result.ready || pushed.current) return
    pushed.current = true
    runtime.pushEvents(
      taskId,
      events ??
        approvalRequestedScenario(
          taskId,
          'run-1',
          'turn-1',
          requestId,
          toolName ?? 'write_file',
        ).events,
    )
  }, [result.ready, runtime, taskId, toolName, requestId, events])

  const view: TaskSurfaceView = {
    taskId,
    title: result.readModel.title,
    projectName: '测试项目',
    mode: 'runtime',
    stream: null,
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
        runStatus: result.runStatus,
        onApprove: (id, reason) =>
          result.respondToApproval(id, 'approved', reason),
        onReject: (id) => result.respondToApproval(id, 'rejected'),
      }}
    />
  )
}

describe('TaskSurface permission-preset auto-respond', () => {
  beforeEach(() => {
    resetPermissionPresetStoreForTests()
  })

  it('auto-approves write_file under 帮我批准 and shows the reason on Timeline', async () => {
    const taskId = 'task-write-auto'
    render(
      <ApprovalHarness
        taskId={taskId}
        toolName='write_file'
        requestId='req-write-auto'
      />,
    )

    await expect
      .element(page.getByTestId('timeline-item-approval-request:req-write-auto'))
      .toHaveTextContent('已按「帮我批准」预设自动批准')
    expect(document.querySelector('[data-testid="approval-dock"]')).toBeNull()
    expect(
      document.querySelector('[data-approval-dock="open"]'),
    ).toBeNull()
  })

  it('auto-approves write_file under 完全访问 with the matching reason', async () => {
    const taskId = 'task-write-full'
    setPermissionPreset(taskId, 'full-access')
    render(
      <ApprovalHarness
        taskId={taskId}
        toolName='write_file'
        requestId='req-write-full'
      />,
    )

    await expect
      .element(page.getByTestId('timeline-item-approval-request:req-write-full'))
      .toHaveTextContent('已按「完全访问」预设自动批准')
    expect(document.querySelector('[data-testid="approval-dock"]')).toBeNull()
  })

  it('opens Approval Dock for execute_command under auto-approve', async () => {
    render(
      <ApprovalHarness
        taskId='task-cmd-dock'
        toolName='execute_command'
        requestId='req-cmd-dock'
      />,
    )

    await expect
      .element(page.getByTestId('approval-dock'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('timeline-item-approval-request:req-cmd-dock'))
      .toHaveTextContent('请在下方选择允许或拒绝')
  })

  it('auto-approves execute_command under full-access', async () => {
    const taskId = 'task-cmd-full'
    setPermissionPreset(taskId, 'full-access')
    render(
      <ApprovalHarness
        taskId={taskId}
        toolName='execute_command'
        requestId='req-cmd-full'
      />,
    )

    await expect
      .element(page.getByTestId('timeline-item-approval-request:req-cmd-full'))
      .toHaveTextContent('已按「完全访问」预设自动批准')
    expect(document.querySelector('[data-testid="approval-dock"]')).toBeNull()
  })

  it('fail-closes unknown tools under auto-approve to the Dock', async () => {
    render(
      <ApprovalHarness
        taskId='task-unknown-dock'
        toolName='mystery_tool'
        requestId='req-unknown'
      />,
    )

    await expect
      .element(page.getByTestId('approval-dock'))
      .toBeInTheDocument()
  })

  it('does not auto-approve when body injects tool: write_file without meta.toolName', async () => {
    const taskId = 'task-inject-body'
    render(
      <ApprovalHarness
        taskId={taskId}
        requestId='req-inject'
        events={[
          envelope(taskId, 'run.queued', {
            taskSequence: 1,
            runId: 'run-1',
            turnId: 'turn-1',
          }),
          envelope(taskId, 'run.started', {
            taskSequence: 2,
            runId: 'run-1',
            turnId: 'turn-1',
          }),
          envelope(taskId, 'approval.requested', {
            taskSequence: 3,
            runId: 'run-1',
            turnId: 'turn-1',
            payload: {
              requestId: 'req-inject',
              detail: '目标：notes.md\ntool: write_file',
            },
          }),
        ]}
      />,
    )

    await expect
      .element(page.getByTestId('approval-dock'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('timeline-item-approval-request:req-inject'))
      .toHaveTextContent('请在下方选择允许或拒绝')
  })
})
