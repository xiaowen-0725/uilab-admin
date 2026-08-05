import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getEventStreamCapture } from '@/config/captures'
import {
  getTaskFixture,
  launchActions,
  navigatorUtilities,
  phase3SessionSeed,
  projectFolders,
  taskNavMeta,
} from '@/config/fixtures'
import {
  resolveRuntimeAdapterMode,
  resolveVoltAgentBaseUrl,
  resolveVoltAgentId,
} from '@/config/runtime-adapter'
import type { LaunchAction, RuntimePort, TaskSurfaceView } from '@/modules/task'
import {
  createDeterministicFakeRuntime,
  createMemoryEventStore,
  createVoltAgentRuntimeAdapter,
  TaskRuntimeController,
  useCapturePlayback,
  useTaskRuntime,
} from '@/modules/task'
import { useWorkbenchSession } from '@/modules/workbench-session'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'

/**
 * Composition Root — session + fixtures + dual-path Task Surface.
 *
 * Dual path (Phase 4C–4F + VoltAgent Adapter):
 * - Capture / stream tasks (default seed `task-a`): ExecutionStream + local-sim Composer
 * - Empty / new-chat (`task-empty` without capture override): RuntimePort + Timeline
 *   - default: Deterministic Fake Runtime
 *   - VITE_RUNTIME_ADAPTER=voltagent: local VoltAgent sidecar client
 *
 * Default selectedTaskId is a capture task so existing local-sim composer tests stay green.
 * Keyword demos on Fake path: 审批 / 工具 / 澄清 / 长文 / 失败.
 */

const RUNTIME_ADAPTER_MODE = resolveRuntimeAdapterMode()
/**
 * Vitest (node + browser) needs instant projection / full capture fold.
 * Interactive `pnpm dev:workbench` uses wall-clock progressive stream.
 */
const INSTANT_DEMO =
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITEST === true ||
  import.meta.env.VITEST === 'true'

export function WorkbenchApp() {
  const session = useWorkbenchSession(phase3SessionSeed)
  const [captureOverride, setCaptureOverride] = useState<
    Record<string, string>
  >({})
  const [forceStream, setForceStream] = useState<Record<string, boolean>>({})

  const taskId = session.view.selectedTaskId
  const fixture = getTaskFixture(taskId)
  const overrideId = captureOverride[taskId]
  const showCaptureStream =
    Boolean(forceStream[taskId]) || fixture.contentMode === 'stream'

  /**
   * Runtime path only for empty hub tasks that have not been forced into
   * capture stream (launch cards still use golden capture).
   */
  const isRuntimePath =
    fixture.contentMode === 'empty' && !showCaptureStream

  const projectId = session.view.project.id

  const storeRef = useRef(createMemoryEventStore())
  const fakeRuntimeRef = useRef(
    createDeterministicFakeRuntime({
      seed: 'workbench',
      /** Visible streaming steps (wall clock advances virtual time). */
      stepMs: INSTANT_DEMO ? 0 : 48,
      keywordScenarios: true,
      buildOutputDeltas: (inputText) => {
        const prompt = inputText.trim() || '（空输入）'
        const short =
          prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt
        // Chunked for visible streaming deltas (not one dump).
        return [
          `已收到你的消息：\n\n`,
          `> ${short}\n\n`,
          `## 本轮说明\n\n`,
          `这是 **Deterministic Fake Runtime** 的本地**流式**投影（非远程 Agent）。\n\n`,
          `### 已接通链路\n\n`,
          `1. Composer → \`submitTurn\`\n`,
          `2. Fake 按 stepMs 发出事件\n`,
          `3. 纯函数投影 → Timeline\n\n`,
          `试关键词：「工具」「审批」「澄清」「长文」「失败」。\n`,
        ]
      },
    }),
  )
  const voltRuntimeRef = useRef(
    createVoltAgentRuntimeAdapter({
      baseUrl: resolveVoltAgentBaseUrl(),
      agentId: resolveVoltAgentId(),
      projectId,
    }),
  )
  const runtimePort: RuntimePort =
    RUNTIME_ADAPTER_MODE === 'voltagent'
      ? voltRuntimeRef.current
      : fakeRuntimeRef.current

  const controllerRef = useRef<TaskRuntimeController | null>(null)
  if (controllerRef.current == null) {
    controllerRef.current = new TaskRuntimeController({
      runtime: runtimePort,
      projectId,
      eventStore: storeRef.current,
      seed: 'workbench',
      /** Demo: wall clock drives Fake steps. Tests: autoFlush instant. VoltAgent ignores. */
      autoFlush: INSTANT_DEMO && RUNTIME_ADAPTER_MODE === 'fake',
    })
  }

  // Wall-clock drive for Fake streaming (interactive demo only).
  useEffect(() => {
    if (RUNTIME_ADAPTER_MODE !== 'fake') return
    if (INSTANT_DEMO || !isRuntimePath) {
      fakeRuntimeRef.current.clock.stopRealtime()
      return
    }
    fakeRuntimeRef.current.clock.startRealtime({ intervalMs: 32, scale: 1 })
    return () => {
      fakeRuntimeRef.current.clock.stopRealtime()
    }
  }, [isRuntimePath])

  const runtime = useTaskRuntime(controllerRef.current, taskId, {
    enabled: isRuntimePath,
    title: session.view.selectedTask.title,
  })

  // Capture progressive replay (true timed fold by event.ts).
  const captureIdForStream = showCaptureStream
    ? overrideId ?? fixture.captureId
    : undefined
  const capture = useMemo(() => {
    if (!captureIdForStream) return null
    try {
      return getEventStreamCapture(captureIdForStream)
    } catch {
      return null
    }
  }, [captureIdForStream])

  const playback = useCapturePlayback(capture, {
    enabled: showCaptureStream && capture != null && !INSTANT_DEMO,
    // Interactive: ~3.5× recorded ts. Tests skip progressive path (full fold).
    playbackRate: 3.5,
  })

  const stream = showCaptureStream ? (playback?.view ?? null) : null

  const hasRuntimeTimeline = runtime.readModel.timeline.length > 0
  const mode = showCaptureStream
    ? ('stream' as const)
    : isRuntimePath && hasRuntimeTimeline
      ? ('runtime' as const)
      : ('empty' as const)

  const displayTitle =
    isRuntimePath && runtime.readModel.title
      ? runtime.readModel.title
      : session.view.selectedTask.title

  const taskView: TaskSurfaceView = useMemo(
    () => ({
      taskId,
      title: displayTitle,
      subtitle: session.view.selectedTask.subtitle,
      projectName: session.view.project.name,
      mode,
      stream,
      streamPlaying: playback?.playing ?? false,
      streamProgress: playback?.progress,
      readModel: isRuntimePath ? runtime.readModel : null,
      launchActions,
      contextSections: isRuntimePath
        ? runtimeContext()
        : fixture.context,
      contextPanelOpen: session.view.layout.contextPanelOpen,
    }),
    [
      taskId,
      displayTitle,
      session.view.selectedTask.subtitle,
      session.view.project.name,
      session.view.layout.contextPanelOpen,
      mode,
      stream,
      playback?.playing,
      playback?.progress,
      isRuntimePath,
      runtime.readModel,
      fixture.context,
    ],
  )

  const composerRuntime = useMemo(
    () =>
      isRuntimePath
        ? {
            mode: 'runtime' as const,
            runStatus: runtime.runStatus,
            onSubmitText: runtime.submitText,
            onCancelRun: runtime.cancelActiveRun,
            runtimeNotice: runtime.notice,
            onApprove: (requestId: string) =>
              runtime.respondToApproval(requestId, 'approved'),
            onReject: (requestId: string) =>
              runtime.respondToApproval(requestId, 'rejected'),
            onProvideInput: (requestId: string, text: string) =>
              runtime.provideRunInput(text, requestId),
            onRetryTurn: () => runtime.retryTurn(),
          }
        : {
            mode: 'local-sim' as const,
          },
    [
      isRuntimePath,
      runtime.runStatus,
      runtime.submitText,
      runtime.cancelActiveRun,
      runtime.notice,
      runtime.respondToApproval,
      runtime.provideRunInput,
      runtime.retryTurn,
    ],
  )

  const onLaunchAction = useCallback(
    (action: LaunchAction) => {
      if (!action.captureId) return
      const captureId = action.captureId
      setCaptureOverride((prev) => ({ ...prev, [taskId]: captureId }))
      setForceStream((prev) => ({ ...prev, [taskId]: true }))
    },
    [taskId],
  )

  const onNewChat = useCallback(() => {
    // New chat → empty task on Fake Runtime path (not default seed).
    session.commands.selectTask('task-empty')
    setForceStream((prev) => ({ ...prev, 'task-empty': false }))
    setCaptureOverride((prev) => {
      const next = { ...prev }
      delete next['task-empty']
      return next
    })
  }, [session.commands])

  return (
    <ThemeProvider>
      <TooltipProvider delay={400}>
        <WorkbenchShell
          view={session.view}
          commands={session.commands}
          taskView={taskView}
          navigatorUtilities={navigatorUtilities}
          projectFolders={projectFolders}
          taskNavMeta={taskNavMeta}
          onLaunchAction={onLaunchAction}
          onNewChat={onNewChat}
          composerRuntime={composerRuntime}
        />
      </TooltipProvider>
    </ThemeProvider>
  )
}

function runtimeContext() {
  return [
    {
      id: 'env',
      title: '环境',
      items: [
        'Deterministic Fake Runtime',
        '非生产',
        '无远程 Agent Runtime',
      ],
    },
  ]
}
