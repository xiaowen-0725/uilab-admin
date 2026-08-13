/**
 * Composition Root — product wiring only.
 *
 * Boot / Runtime / Task lifecycle / Surface open channels live in sibling units.
 * This file assembles them into Shell + thin chrome (boot screen, delete dialog).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  putSessionPointer,
  SESSION_ROW_ID,
  type SessionPointerRecord,
} from '@/app/persistence/workbench-idb'
import { launchActions } from '@/config/fixtures'
import { resolveVoltAgentBaseUrl } from '@/config/runtime-adapter'
import {
  createProjectLocalRootCommands,
  createWorkbenchHostPort,
  DEFAULT_PROJECT_ID,
  NEW_TASK_TITLE,
  type HostPort,
  type ProjectSummary,
  type TaskSummary,
  useProjectCatalog,
} from '@/modules/project'
import type { LaunchAction, TaskSurfaceView } from '@/modules/task'
import { useTaskRuntime } from '@/modules/task'
import { useWorkspaceDocumentSource, fetchWorkspaceHint } from '@/modules/work-surface'
import {
  useWorkbenchSession,
  type WorkbenchSessionSeed,
} from '@/modules/workbench-session'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { WorkbenchShell } from '@/shell/workbench-shell/workbench-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DeleteTaskConfirmDialog } from './delete-task-confirm-dialog'
import { useBusyTaskIds, useWorkbenchRuntimeWiring } from './runtime-wiring'
import { useWorkbenchSurfaceAssembly } from './surface-assembly'
import {
  createNewChatTask,
  decideNewChat,
  hardDeleteTask,
} from './task-lifecycle-commands'
import { useWorkbenchBoot, type WorkbenchPersistence } from './workbench-boot'

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
  /** Optional HostPort injection (tests). Product path uses Electron 桥 or unavailable. */
  hostPort?: HostPort
}

const DEFAULT_SESSION_SEED: WorkbenchSessionSeed = {
  selectedProjectId: null,
  selectedTaskId: null,
}

function resolveDefaultPersistence(): WorkbenchPersistence {
  if (INSTANT_DEMO) return 'memory'
  return 'idb'
}

/** Runtime context chips are empty in product chrome (data-honesty-mode / a11y only). */
function runtimeContext(): [] {
  return []
}

export function WorkbenchApp({
  persistence: persistenceProp,
  idbName,
  hostPort: hostPortProp,
}: WorkbenchAppProps = {}) {
  const persistence = persistenceProp ?? resolveDefaultPersistence()
  const session = useWorkbenchSession(DEFAULT_SESSION_SEED)
  const hostPort = useMemo(
    () => hostPortProp ?? createWorkbenchHostPort(),
    [hostPortProp],
  )
  const hostAvailable = hostPort.isAvailable()
  const localRootRef = useRef<ReturnType<
    typeof createProjectLocalRootCommands
  > | null>(null)
  const [projectActionError, setProjectActionError] = useState<string | null>(
    null
  )

  // --- Boot ---
  const boot = useWorkbenchBoot({
    persistence,
    idbName,
    hostAvailable,
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
    runtimeMode: 'voltagent',
    voltAgentBaseUrl: resolveVoltAgentBaseUrl(),
  })

  // --- Catalog + selection ---
  const catalogView = useProjectCatalog(catalogController)
  const projectId = session.view.selectedProjectId

  useEffect(() => {
    catalogController?.setFocusedProject(projectId)
  }, [catalogController, projectId, catalogView.ready])

  const currentProject: ProjectSummary | null =
    catalogView.projects.find((p) => p.id === projectId) ?? null

  const tasks: TaskSummary[] = catalogView.tasks
  const taskId = session.view.selectedTaskId
  const selectedTaskRow = taskId
    ? (catalogController?.getTaskRow(taskId) ?? null)
    : null

  // --- Runtime wiring ---
  const runtimeWiring = useWorkbenchRuntimeWiring({
    eventStore,
    projectId: projectId ?? DEFAULT_PROJECT_ID,
    persistence,
    bootReady,
  })
  const {
    controller: runtimeController,
    runStatusIndex,
    capabilityController,
  } = runtimeWiring

  const isRuntimePath = Boolean(taskId)
  const runtime = useTaskRuntime(runtimeController, taskId ?? '', {
    enabled: isRuntimePath && bootReady && Boolean(runtimeController),
    title: selectedTaskRow?.title ?? NEW_TASK_TITLE,
  })

  // Busy projection lives in runtime-wiring (after live runStatus is known).
  const busyTaskIds = useBusyTaskIds(runStatusIndex, taskId, runtime.runStatus)

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
      projectName: currentProject?.name ?? '未选择项目',
      mode,
      stream: null,
      streamPlaying: false,
      readModel: isRuntimePath ? runtime.readModel : null,
      launchActions,
      contextSections: runtimeContext(),
      contextPanelOpen: session.view.layout.contextPanelOpen,
    }
  }, [
    taskId,
    displayTitle,
    currentProject?.name,
    mode,
    isRuntimePath,
    runtime.readModel,
    session.view.layout.contextPanelOpen,
  ])

  const composerRuntime = useMemo(
    () =>
      isRuntimePath
        ? {
            mode: 'runtime' as const,
            modelLabel: '本地侧车模型',
            runStatus: runtime.runStatus,
            onSubmitText: async (
              text: string,
              composerContext?: Parameters<typeof runtime.submitText>[1],
            ) => {
              const gate = await localRootRef.current?.assertWritableRuntime()
              if (gate && !gate.ok) {
                setProjectActionError(gate.message)
                return null
              }
              setProjectActionError(null)
              return runtime.submitText(text, composerContext)
            },
            onCancelRun: runtime.cancelActiveRun,
            runtimeNotice: [
              runtime.notice,
              bootError && persistence === 'idb'
                ? `本地存储降级：${bootError}`
                : null,
              projectActionError,
            ]
              .filter(Boolean)
              .join(' · ') || null,
            onApprove: (requestId: string, reason?: string) =>
              runtime.respondToApproval(requestId, 'approved', reason),
            onReject: (requestId: string) =>
              runtime.respondToApproval(requestId, 'rejected'),
            onProvideInput: (requestId: string, text: string) =>
              runtime.provideRunInput(text, requestId),
            onRetryTurn: () => runtime.retryTurn(),
            onFollowModeChange: runtime.setFollowMode,
            capabilityController,
            capabilityTaskId: taskId,
          }
        : undefined,
    [
      isRuntimePath,
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
      capabilityController,
      taskId,
      projectActionError,
    ]
  )

  const onLaunchAction = useCallback(
    (action: LaunchAction) => {
      if (!taskId || !action.promptStub) return
      void (async () => {
        const gate = await localRootRef.current?.assertWritableRuntime()
        if (gate && !gate.ok) {
          setProjectActionError(gate.message)
          return
        }
        void runtime.submitText(action.promptStub)
      })()
    },
    [runtime, taskId]
  )

  // --- Task lifecycle commands ---
  const selectedTaskIdRef = useRef(session.view.selectedTaskId)
  selectedTaskIdRef.current = session.view.selectedTaskId
  const selectedProjectIdRef = useRef(session.view.selectedProjectId)
  selectedProjectIdRef.current = session.view.selectedProjectId
  const newTaskCounterRef = useRef(0)
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(
    null
  )

  const localRootCommands = useMemo(() => {
    if (!catalogController) return null
    return createProjectLocalRootCommands({
      catalog: catalogController,
      host: hostPort,
      getSelectedProjectId: () => selectedProjectIdRef.current,
      selectProject: (nextProjectId) => {
        catalogController.setFocusedProject(nextProjectId)
        session.commands.selectProject(nextProjectId)
      },
      fetchWorkspaceRoot: () => fetchWorkspaceHint(resolveVoltAgentBaseUrl()),
    })
  }, [catalogController, hostPort, session.commands])
  localRootRef.current = localRootCommands

  const onNewChat = useCallback(async () => {
    if (!catalogController || !localRootCommands) return

    let project
    try {
      project = await localRootCommands.ensureProjectForNewChat()
      setProjectActionError(null)
    } catch (err) {
      setProjectActionError(
        err instanceof Error ? err.message : '无法准备项目',
      )
      return
    }

    const selectedId = selectedTaskIdRef.current
    const selected = selectedId
      ? catalogController.getTaskRow(selectedId)
      : null

    const decision = decideNewChat({
      selectedProjectId: project.id,
      selectedTask:
        selected?.projectId === project.id ? selected : null,
    })
    if (decision.kind === 'reselect') {
      session.commands.selectTask(decision.taskId)
      return
    }

    newTaskCounterRef.current += 1
    const row = await createNewChatTask({
      catalog: catalogController,
      projectId: project.id,
      sequence: newTaskCounterRef.current,
    })
    session.commands.ensureTaskLayout(row.id)
    session.commands.selectTask(row.id)
  }, [catalogController, localRootCommands, session.commands])

  const onSelectProject = useCallback(
    (nextProjectId: string) => {
      catalogController?.setFocusedProject(nextProjectId)
      session.commands.selectProject(nextProjectId)
      const record = catalogController?.getProjectRecord(nextProjectId)
      if (hostPort.isAvailable() && record?.localRoot) {
        void hostPort.startRuntime(record.localRoot).catch((err: unknown) => {
          setProjectActionError(
            err instanceof Error ? err.message : '无法切换项目运行时',
          )
        })
      }
    },
    [catalogController, hostPort, session.commands]
  )

  const onOpenLocalFolder = useCallback(async () => {
    if (!localRootCommands) return
    try {
      await localRootCommands.openLocalFolder()
      setProjectActionError(null)
    } catch (err) {
      setProjectActionError(
        err instanceof Error ? err.message : '无法打开本地文件夹',
      )
    }
  }, [localRootCommands])

  const onCreateProject = useCallback(async () => {
    if (!localRootCommands) return
    try {
      await localRootCommands.createProject()
      setProjectActionError(null)
    } catch (err) {
      setProjectActionError(
        err instanceof Error ? err.message : '无法新建项目',
      )
    }
  }, [localRootCommands])

  const performDeleteTask = useCallback(
    async (deleteTaskId: string) => {
      if (!catalogController || !session.view.selectedProjectId) return

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
        onTaskDeleted: (deletedTaskId) => {
          capabilityController.clearTask(deletedTaskId)
        },
      })

      // Always sync selection + lastTaskByProject into session memory so the
      // putSessionPointer effect cannot overwrite IDB with a stale map.
      session.commands.removeTaskLayout(deleteTaskId)
      session.commands.hydratePointers({
        selectedProjectId: session.view.selectedProjectId,
        selectedTaskId: result.selectionChanged
          ? result.nextSelectedTaskId
          : session.view.selectedTaskId,
        lastTaskByProject: result.lastTaskByProject,
        navigatorOpen: session.view.navigatorOpen,
      })
      setDeleteConfirmTaskId(null)
    },
    [
      catalogController,
      capabilityController,
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
    ]
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
          hostAvailable={hostAvailable}
          projectActionError={projectActionError}
          onOpenLocalFolder={() => void onOpenLocalFolder()}
          onCreateProject={() => void onCreateProject()}
          composerRuntime={composerRuntime}
          capabilityController={capabilityController}
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
