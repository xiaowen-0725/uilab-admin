/**
 * Composition Root — product wiring only.
 *
 * Boot / Runtime / Task lifecycle / Surface open channels live in sibling units.
 * This file assembles them into Shell + thin chrome (boot screen, delete dialog).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  putSessionPointer,
  SESSION_ROW_ID,
  type SessionPointerRecord,
} from '@/app/persistence/workbench-idb'
import { launchActions } from '@/config/fixtures'
import {
  resolveRuntimeAdapterMode,
  resolveVoltAgentBaseUrl,
} from '@/config/runtime-adapter'
import {
  DEFAULT_PROJECT_ID,
  NEW_TASK_TITLE,
  type ProjectSummary,
  type TaskSummary,
  useProjectCatalog,
} from '@/modules/project'
import type {
  LaunchAction,
  TaskSurfaceView,
} from '@/modules/task'
import { useTaskRuntime } from '@/modules/task'
import {
  useWorkbenchSession,
  type WorkbenchSessionSeed,
} from '@/modules/workbench-session'
import { useWorkspaceDocumentSource } from '@/modules/work-surface'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'
import { DeleteTaskConfirmDialog } from './delete-task-confirm-dialog'
import {
  useBusyTaskIds,
  useWorkbenchRuntimeWiring,
} from './runtime-wiring'
import { useWorkbenchSurfaceAssembly } from './surface-assembly'
import {
  createNewChatTask,
  decideNewChat,
  hardDeleteTask,
} from './task-lifecycle-commands'
import {
  useWorkbenchBoot,
  type WorkbenchPersistence,
} from './workbench-boot'

const RUNTIME_ADAPTER_MODE = resolveRuntimeAdapterMode()

const INSTANT_DEMO =
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITEST === true ||
  import.meta.env.VITEST === 'true'

export type { WorkbenchPersistence }

export interface WorkbenchAppProps {
  /**
   * Durable store backend.
   * Tests default to memory for isolation; product default is idb.
   */
  persistence?: WorkbenchPersistence
  /** Optional unique IDB name for parallel browser tests. */
  idbName?: string
}

const DEFAULT_SESSION_SEED: WorkbenchSessionSeed = {
  selectedProjectId: DEFAULT_PROJECT_ID,
  selectedTaskId: null,
}

function resolveDefaultPersistence(): WorkbenchPersistence {
  if (INSTANT_DEMO) return 'memory'
  return 'idb'
}

/** Runtime path: no honesty chips in product chrome (data-honesty-mode / a11y only). */
function runtimeContext(_mode: 'fake' | 'voltagent') {
  return []
}

export function WorkbenchApp({
  persistence: persistenceProp,
  idbName,
}: WorkbenchAppProps = {}) {
  const persistence = persistenceProp ?? resolveDefaultPersistence()
  const session = useWorkbenchSession(DEFAULT_SESSION_SEED)

  // --- Boot ---
  const boot = useWorkbenchBoot({
    persistence,
    idbName,
    onHydratePointers: session.commands.hydratePointers,
  })
  const {
    ready: bootReady,
    error: bootError,
    db,
    catalogController,
    eventStore,
  } = boot

  // --- Document source (module-owned bind UI) ---
  const documentSource = useWorkspaceDocumentSource({
    runtimeMode:
      RUNTIME_ADAPTER_MODE === 'voltagent' ? 'voltagent' : 'fake',
    voltAgentBaseUrl: resolveVoltAgentBaseUrl(),
  })

  // --- Catalog + selection ---
  const catalogView = useProjectCatalog(catalogController)
  const projectId = session.view.selectedProjectId

  useEffect(() => {
    catalogController?.setFocusedProject(projectId)
  }, [catalogController, projectId, catalogView.ready])

  const currentProject: ProjectSummary | null =
    catalogView.projects.find((p) => p.id === projectId) ??
    catalogView.projects[0] ??
    null

  const tasks: TaskSummary[] = catalogView.tasks
  const taskId = session.view.selectedTaskId
  const selectedTaskRow = taskId
    ? (catalogController?.getTaskRow(taskId) ?? null)
    : null

  // --- Runtime wiring ---
  const runtimeWiring = useWorkbenchRuntimeWiring({
    eventStore,
    projectId,
    persistence,
    bootReady,
    selectedTaskId: taskId,
  })
  const {
    honestyMode,
    controller: runtimeController,
    runStatusIndex,
  } = runtimeWiring

  const isRuntimePath = Boolean(taskId)
  const runtime = useTaskRuntime(runtimeController, taskId ?? '', {
    enabled: isRuntimePath && bootReady && Boolean(runtimeController),
    title: selectedTaskRow?.title ?? NEW_TASK_TITLE,
  })

  // Busy projection lives in runtime-wiring (after live runStatus is known).
  const busyTaskIds = useBusyTaskIds(
    runStatusIndex,
    taskId,
    runtime.runStatus,
  )

  // --- Surface registry + open channels ---
  const hasOpenWorkTabs = session.view.layout.openTabs.length > 0
  const surface = useWorkbenchSurfaceAssembly({
    documentSource,
    hasOpenWorkTabs,
    sessionCommands: session.commands,
    runtimeController,
    selectedTaskId: taskId,
    bootReady,
  })

  // Persist session pointers (IDB product path).
  useEffect(() => {
    if (!bootReady || persistence !== 'idb' || !db) return
    const record: SessionPointerRecord = {
      id: SESSION_ROW_ID,
      selectedProjectId: session.view.selectedProjectId,
      selectedTaskId: session.view.selectedTaskId,
      lastTaskByProject: session.view.lastTaskByProject,
      navigatorOpen: session.view.navigatorOpen,
      updatedAt: new Date().toISOString(),
    }
    void putSessionPointer(db, record).catch(() => {
      // Non-fatal; catalog is still durable.
    })
  }, [
    bootReady,
    db,
    persistence,
    session.view.selectedProjectId,
    session.view.selectedTaskId,
    session.view.lastTaskByProject,
    session.view.navigatorOpen,
  ])

  // Title write-back from Runtime → catalog.
  useEffect(() => {
    if (!isRuntimePath || !taskId) return
    const title = runtime.readModel.title.trim()
    if (!title || title === selectedTaskRow?.title) return
    void catalogController?.renameTask(taskId, title, 'runtime')
  }, [
    catalogController,
    isRuntimePath,
    runtime.readModel.title,
    selectedTaskRow?.title,
    taskId,
  ])

  const hasRuntimeTimeline = runtime.readModel.timeline.length > 0
  const mode =
    isRuntimePath && hasRuntimeTimeline
      ? ('runtime' as const)
      : ('empty' as const)

  const displayTitle =
    isRuntimePath && runtime.readModel.title
      ? runtime.readModel.title
      : (selectedTaskRow?.title ?? '还没有对话')

  const taskView: TaskSurfaceView | null = useMemo(() => {
    if (!taskId) return null
    return {
      taskId,
      title: displayTitle,
      projectName: currentProject?.name ?? '默认项目',
      mode,
      stream: null,
      streamPlaying: false,
      readModel: isRuntimePath ? runtime.readModel : null,
      launchActions,
      contextSections: runtimeContext(honestyMode),
      contextPanelOpen: session.view.layout.contextPanelOpen,
    }
  }, [
    taskId,
    displayTitle,
    currentProject?.name,
    mode,
    isRuntimePath,
    runtime.readModel,
    honestyMode,
    session.view.layout.contextPanelOpen,
  ])

  const composerRuntime = useMemo(
    () =>
      isRuntimePath
        ? {
            mode: 'runtime' as const,
            honestyMode,
            modelLabel:
              honestyMode === 'voltagent' ? '本地侧车模型' : 'Fake Runtime',
            runStatus: runtime.runStatus,
            onSubmitText: runtime.submitText,
            onCancelRun: runtime.cancelActiveRun,
            runtimeNotice:
              bootError && persistence === 'idb'
                ? `${runtime.notice ?? ''} · 本地存储降级：${bootError}`.trim()
                : runtime.notice,
            onApprove: (requestId: string) =>
              runtime.respondToApproval(requestId, 'approved'),
            onReject: (requestId: string) =>
              runtime.respondToApproval(requestId, 'rejected'),
            onProvideInput: (requestId: string, text: string) =>
              runtime.provideRunInput(text, requestId),
            onRetryTurn: () => runtime.retryTurn(),
            onFollowModeChange: runtime.setFollowMode,
          }
        : undefined,
    [
      isRuntimePath,
      honestyMode,
      runtime.runStatus,
      runtime.submitText,
      runtime.cancelActiveRun,
      runtime.notice,
      runtime.respondToApproval,
      runtime.provideRunInput,
      runtime.retryTurn,
      runtime.setFollowMode,
      bootError,
      persistence,
    ],
  )

  const onLaunchAction = useCallback(
    (action: LaunchAction) => {
      if (!taskId || !action.promptStub) return
      void runtime.submitText(action.promptStub)
    },
    [runtime, taskId],
  )

  // --- Task lifecycle commands ---
  const selectedTaskIdRef = useRef(session.view.selectedTaskId)
  selectedTaskIdRef.current = session.view.selectedTaskId
  const selectedProjectIdRef = useRef(session.view.selectedProjectId)
  selectedProjectIdRef.current = session.view.selectedProjectId
  const newTaskCounterRef = useRef(0)
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(
    null,
  )

  const onNewChat = useCallback(async () => {
    if (!catalogController) return

    const projectIdNow = selectedProjectIdRef.current
    const selectedId = selectedTaskIdRef.current
    const selected = selectedId
      ? catalogController.getTaskRow(selectedId)
      : null

    const decision = decideNewChat({
      selectedProjectId: projectIdNow,
      selectedTask: selected,
    })
    if (decision.kind === 'reselect') {
      session.commands.selectTask(decision.taskId)
      return
    }

    newTaskCounterRef.current += 1
    const row = await createNewChatTask({
      catalog: catalogController,
      projectId: projectIdNow,
      sequence: newTaskCounterRef.current,
    })
    session.commands.ensureTaskLayout(row.id)
    session.commands.selectTask(row.id)
  }, [catalogController, session.commands])

  const onSelectProject = useCallback(
    (nextProjectId: string) => {
      catalogController?.setFocusedProject(nextProjectId)
      session.commands.selectProject(nextProjectId)
    },
    [catalogController, session.commands],
  )

  const performDeleteTask = useCallback(
    async (deleteTaskId: string) => {
      if (!catalogController) return

      const result = await hardDeleteTask({
        taskId: deleteTaskId,
        catalog: catalogController,
        eventStore,
        db,
        persistence,
        runStatusIndex,
        runtimeController,
        activeTaskId: taskId,
        selectedTaskId: session.view.selectedTaskId,
        selectedProjectId: session.view.selectedProjectId,
        lastTaskByProject: session.view.lastTaskByProject,
        navigatorOpen: session.view.navigatorOpen,
        activeRunStatus: runtime.runStatus,
      })

      session.commands.removeTaskLayout(deleteTaskId)
      if (result.selectionChanged) {
        session.commands.selectTask(result.nextSelectedTaskId)
      }
      setDeleteConfirmTaskId(null)
    },
    [
      catalogController,
      db,
      eventStore,
      persistence,
      runStatusIndex,
      runtime.runStatus,
      runtimeController,
      session.commands,
      session.view.lastTaskByProject,
      session.view.navigatorOpen,
      session.view.selectedProjectId,
      session.view.selectedTaskId,
      taskId,
    ],
  )

  const onDeleteTask = useCallback((id: string) => {
    setDeleteConfirmTaskId(id)
  }, [])

  if (!bootReady) {
    return (
      <ThemeProvider>
        <div
          className='flex h-svh items-center justify-center text-sm text-muted-foreground'
          data-testid='workbench-booting'
        >
          正在加载工作台…
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <TooltipProvider delay={400}>
        <WorkbenchShell
          view={session.view}
          commands={session.commands}
          taskView={taskView}
          project={currentProject}
          projects={catalogView.projects}
          tasks={tasks}
          busyTaskIds={busyTaskIds}
          onLaunchAction={onLaunchAction}
          onNewChat={() => void onNewChat()}
          onDeleteTask={onDeleteTask}
          onSelectProject={onSelectProject}
          composerRuntime={composerRuntime}
          surfaceRegistry={surface.surfaceRegistry}
          onOpenFileRef={surface.onOpenFileRef}
          workSurfaceEmptyExtra={surface.workSurfaceEmptyExtra}
          workSurfaceToolbarTrailing={surface.workSurfaceToolbarTrailing}
        />
        <DeleteTaskConfirmDialog
          open={deleteConfirmTaskId != null}
          onCancel={() => setDeleteConfirmTaskId(null)}
          onConfirm={() => {
            if (deleteConfirmTaskId) {
              void performDeleteTask(deleteConfirmTaskId)
            }
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  )
}
